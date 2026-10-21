import { Container, getContainer } from "@cloudflare/containers";
import { env as workerEnv } from "cloudflare:workers";
import { clientKey, isFinalAttempt, parseLimits } from "./limits.mjs";
import { cacheKey, normalizeUrl, resolveEntryUrl, sha256 } from "./entry-url.mjs";
import { containerFailure, describeFailure, failure } from "./failure.mjs";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export class AuditFallbackContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "2m";
  // GeoCheck runs DeepSeek planning with exactly one answer engine: Perplexity Sonar or
  // Gemini Flash (GEOCHECK_MCAC_ENGINE). No other provider key reaches the container.
  envVars = {
    DEEPSEEK_API_KEY: workerEnv.DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL: workerEnv.DEEPSEEK_MODEL,
    PERPLEXITY_API_KEY: workerEnv.PERPLEXITY_API_KEY,
    GEMINI_API_KEY: workerEnv.GEMINI_API_KEY,
    GEOCHECK_METHOD: workerEnv.GEOCHECK_METHOD,
    GEOCHECK_MCAC_ENGINE: workerEnv.GEOCHECK_MCAC_ENGINE,
    GEOCHECK_MCAC_GEMINI_MODEL: workerEnv.GEOCHECK_MCAC_GEMINI_MODEL
  };
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

async function readBody(request, maxBytes = 16 * 1024) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw Object.assign(new Error("request_too_large"), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw Object.assign(new Error("request_too_large"), { status: 413 });
  return JSON.parse(text || "{}");
}

// Ceilings on fresh (non-cached) audits: per Asia/Taipei day, and per client within a window.
// The numbers come from the AUDIT_LIMITS secret (limits.mjs). Cached results cost nothing and
// are never refused.
async function dailyLimitState(env, limit, now = Date.now()) {
  const offset = 8 * 60 * 60_000;
  const local = new Date(now + offset);
  local.setUTCHours(0, 0, 0, 0);
  const dayStart = local.getTime() - offset;
  const row = await env.REPORTS_DB.prepare(
    "SELECT COUNT(*) AS n FROM audit_jobs WHERE created_at >= ? AND COALESCE(json_extract(diagnostics_json, '$.cache_hit'), 0) = 0"
  ).bind(new Date(dayStart).toISOString()).first();
  return { reached: Number(row?.n || 0) >= limit, retryAfterSeconds: Math.max(60, Math.ceil((dayStart + 24 * 60 * 60_000 - now) / 1000)) };
}

async function clientLimitReached(env, client, limits, now = Date.now()) {
  const since = new Date(now - limits.perIpHours * 60 * 60_000).toISOString();
  const row = await env.REPORTS_DB.prepare(
    "SELECT COUNT(*) AS n FROM audit_jobs WHERE created_at >= ? AND json_extract(diagnostics_json, '$.client') = ? AND COALESCE(json_extract(diagnostics_json, '$.cache_hit'), 0) = 0"
  ).bind(since, client).first();
  return Number(row?.n || 0) >= limits.perIp;
}

async function getJob(db, jobId) {
  return (await db.prepare("SELECT * FROM audit_jobs WHERE job_id = ? LIMIT 1").bind(jobId).first()) || null;
}

async function getReport(db, reportId) {
  const row = await db.prepare("SELECT report_json FROM audit_reports WHERE report_id = ? LIMIT 1").bind(reportId).first();
  if (!row?.report_json) return null;
  try { return JSON.parse(row.report_json); } catch { return null; }
}

// Report pages and downloads share one container. A container per report cold-started on every
// new report, competed with audits for the instance ceiling, and one stuck instance kept its
// report failing for good (2026-10-21 deploy check). Audits run one at a time (max_concurrency).
const RENDER_CONTAINER = "report-render";
// Audits share one container as well. A container per job kept running after its audit, so the
// next audits hit the instance ceiling and failed (2026-10-21 launch smoke). The queue runs one
// audit at a time, so one container is enough.
const AUDIT_CONTAINER = "runner";

async function invokeContainer(env, name, path, body) {
  const container = getContainer(env.AUDIT_FALLBACK, `audit-${name}`);
  const request = new Request(`http://audit-container${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return container.fetch(request);
}

async function browserHtml(env, siteUrl) {
  const response = await env.BROWSER.quickAction("content", { url: siteUrl });
  if (!response.ok) throw new Error(`browser_run_http_${response.status}`);
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    const html = parsed.html || parsed.result?.html || parsed.content;
    if (typeof html === "string" && html.length >= 100) return html;
  } catch { /* content endpoint may return HTML directly */ }
  if (text.length < 100) throw new Error("browser_run_empty_content");
  return text;
}

async function processAudit(message, env) {
  const jobId = String(message.body?.job_id || "");
  const job = await getJob(env.REPORTS_DB, jobId);
  if (!job || !["queued", "running"].includes(job.status)) return;
  const leaseToken = crypto.randomUUID();
  const now = new Date().toISOString();
  const claim = await env.REPORTS_DB.prepare(`UPDATE audit_jobs
    SET status = 'running', lease_token = ?, lease_expires_at = ?, attempt_count = attempt_count + 1, updated_at = ?
    WHERE job_id = ? AND status = 'queued'`).bind(
    leaseToken, new Date(Date.now() + 15 * 60_000).toISOString(), now, jobId
  ).run();
  if (Number(claim.meta?.changes || 0) !== 1) return;
  const queries = JSON.parse(job.custom_queries_json || "[]");
  // site_url is what the user typed; entry_url is the entry the probe found reachable.
  let entryUrl = job.site_url;
  try { entryUrl = new URL(JSON.parse(job.diagnostics_json || "{}").entry_url || job.site_url).toString(); } catch { /* keep site_url */ }
  let html = null;
  let browserError = null;
  try { html = await browserHtml(env, entryUrl); } catch (error) { browserError = String(error?.message || "browser_run_failed").slice(0, 240); }
  // Recorded before the container runs, so a job that fails in the container still shows
  // which crawl path it was on (the 2026-10-21 failures had no browser_run at all).
  await env.REPORTS_DB.prepare("UPDATE audit_jobs SET diagnostics_json = json_patch(COALESCE(diagnostics_json, '{}'), ?), updated_at = ? WHERE job_id = ? AND lease_token = ?")
    .bind(JSON.stringify({ browser_run: html ? "succeeded" : "failed", browser_error: browserError }), new Date().toISOString(), jobId, leaseToken).run();
  const response = await invokeContainer(env, AUDIT_CONTAINER, "/audit", {
    url: entryUrl,
    requested_url: job.site_url,
    report_id: job.report_id,
    custom_queries: queries,
    ...(html ? { browser_html: html } : {})
  });
  if (!response.ok) {
    let body = null;
    try { body = await response.json(); } catch { /* the container may answer without a JSON body */ }
    throw containerFailure(response.status, body);
  }
  let payload;
  try { payload = await response.json(); } catch (error) { throw failure("audit_container_invalid_result", `container payload is not JSON: ${error?.message || "parse error"}`); }
  if (!payload?.report || typeof payload.report !== "object") throw failure("audit_container_invalid_result", "container payload has no report object");
  // The page, its "報告編號" and its download link must use the id the report is stored under.
  const report = { ...payload.report, id: job.report_id };
  const reportJson = JSON.stringify(report);
  const completedAt = new Date().toISOString();
  const limited = report?.model === "fetch-limited" || report?.homepage?.fetchBlocked === true || report?.limited === true;
  await env.REPORTS_DB.batch([
    env.REPORTS_DB.prepare(`INSERT INTO audit_reports (
      report_id, cache_key, site_origin, query_mode, query_set_version, pipeline_version, algorithm_version,
      entity_name, created_at, stored_at, expires_at, report_hash, report_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_id) DO UPDATE SET stored_at = excluded.stored_at, expires_at = excluded.expires_at,
      report_hash = excluded.report_hash, report_json = excluded.report_json`).bind(
      job.report_id, job.cache_key, new URL(entryUrl).origin.toLowerCase(), queries.length ? "custom" : "automatic",
      String(report.queryPlanning?.queryPlan?.query_set_version || report.probeSetVersion || "unknown"), String(report.pipelineVersion || workerEnv.AUDIT_PIPELINE_VERSION || "unknown"),
      String(report.audit?.score?.algorithm_version || report.algorithmVersion || "unknown"),
      String(report.audit?.query_planning?.entity_name || report.entity?.name || "unknown"), String(report.createdAt || completedAt), completedAt,
      new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(), await sha256(reportJson), reportJson
    ),
    // json_patch keeps cache_hit and the client key that the per-client limit counts.
    env.REPORTS_DB.prepare(`UPDATE audit_jobs SET status = ?, completed_at = ?, updated_at = ?,
      diagnostics_json = json_patch(COALESCE(diagnostics_json, '{}'), ?), error_code = NULL
      WHERE job_id = ? AND lease_token = ?`).bind(
      limited ? "completed_with_limitations" : "completed", completedAt, completedAt,
      JSON.stringify({ crawl_path: payload.crawl_path || "unknown" }), jobId, leaseToken
    )
  ]);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/healthz") {
        let d1 = false;
        try {
          await env.REPORTS_DB.prepare("SELECT 1 AS ok").first();
          d1 = true;
        } catch { /* readiness stays false */ }
        return json(d1 ? 200 : 503, {
          ok: d1,
          d1,
          queue: Boolean(env.AUDIT_JOBS),
          browser: Boolean(env.BROWSER),
          container: Boolean(env.AUDIT_FALLBACK),
          admission_enabled: String(env.AUDIT_ADMISSION_ENABLED || "").toLowerCase() === "true",
          limits_configured: Boolean(parseLimits(env))
        });
      }
      if (request.method === "POST" && url.pathname === "/api/audit-real-lite") {
        if (String(env.AUDIT_ADMISSION_ENABLED || "").toLowerCase() !== "true") {
          return json(503, { error: "New audits are temporarily paused", code: "service_unavailable" });
        }
        const limits = parseLimits(env);
        if (!limits) {
          console.error(JSON.stringify({ event: "audit_limits_missing" }));
          return json(503, { error: "New audits are temporarily paused", code: "service_unavailable" });
        }
        const body = await readBody(request);
        const siteUrl = normalizeUrl(body.url);
        const customQueries = Array.isArray(body.customQueries)
          ? body.customQueries.map((item) => String(item || "").trim()).filter(Boolean) : [];
        if (customQueries.length > 4 || new Set(customQueries.map((item) => item.toLowerCase())).size !== customQueries.length) {
          return json(400, { error: "自訂觀測題最多 4 題，且每題都必須不同。", code: "invalid_custom_queries" });
        }
        // The probe picks the entry that answers (https apex, https www, http apex with its
        // redirects), so a site whose apex https is dead is still measured, and one site typed
        // in different ways shares one cache row.
        const entry = await resolveEntryUrl(siteUrl);
        const key = await cacheKey(entry.url, customQueries, env.AUDIT_PIPELINE_VERSION);
        const cached = await env.REPORTS_DB.prepare("SELECT report_id FROM audit_reports WHERE cache_key = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1")
          .bind(key, new Date().toISOString()).first();
        let client = null;
        if (!cached) {
          client = await clientKey(request.headers.get("CF-Connecting-IP"), limits.pepper);
          // The window and count are not published, so this answer gives no Retry-After.
          if (await clientLimitReached(env, client, limits)) {
            return json(429, { error: "檢測次數太頻繁，請稍後再試。", code: "rate_limited" });
          }
          const daily = await dailyLimitState(env, limits.daily);
          if (daily.reached) {
            return json(429, { error: "今日免費檢測額度已滿，請明天再試。", code: "daily_limit_reached" }, { "Retry-After": String(daily.retryAfterSeconds) });
          }
        }
        const jobId = `aud_${crypto.randomUUID()}`;
        const reportId = cached?.report_id || `real_lite_${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        await env.REPORTS_DB.prepare(`INSERT INTO audit_jobs (
          job_id, report_id, cache_key, site_url, custom_queries_json, status, created_at, updated_at, completed_at, diagnostics_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(jobId, reportId, key, siteUrl, JSON.stringify(customQueries), cached ? "completed" : "queued", now, now,
            cached ? now : null, JSON.stringify({ cache_hit: Boolean(cached), entry_url: entry.url, entry_reachable: entry.reachable, ...(client ? { client } : {}) })).run();
        if (!cached) await env.AUDIT_JOBS.send({ job_id: jobId });
        return json(202, { job_id: jobId, report_id: reportId, status: cached ? "completed" : "queued", poll_url: `/api/status/${jobId}` }, { Location: `/api/status/${jobId}` });
      }
      const statusMatch = url.pathname.match(/^\/api\/status\/([^/]+)$/);
      if (request.method === "GET" && statusMatch) {
        const job = await getJob(env.REPORTS_DB, decodeURIComponent(statusMatch[1]));
        if (!job) return json(404, { error: "Job not found" });
        return json(200, { status: job.status, reportId: job.report_id, error_code: job.error_code || null, diagnostics: JSON.parse(job.diagnostics_json || "{}") });
      }
      const reportMatch = url.pathname.match(/^\/api\/report\/([^/]+)$/);
      if (request.method === "GET" && reportMatch) {
        const report = await getReport(env.REPORTS_DB, decodeURIComponent(reportMatch[1]));
        return report ? json(200, report) : json(404, { error: "Report not found" });
      }
      const markdownMatch = url.pathname.match(/^\/report\/([^/]+)\/markdown$/);
      if (request.method === "GET" && markdownMatch) {
        const reportId = decodeURIComponent(markdownMatch[1]);
        const report = await getReport(env.REPORTS_DB, reportId);
        if (!report) return json(404, { error: "Report not found" });
        const rendered = await invokeContainer(env, RENDER_CONTAINER, "/render-markdown", { report });
        if (!rendered.ok) throw new Error(`audit_container_http_${rendered.status}`);
        return withSecurityHeaders(new Response(await rendered.text(), { status: 200, headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="geocheck-${reportId.replace(/[^A-Za-z0-9_-]/g, "")}.md"`,
          "Cache-Control": "no-store"
        } }));
      }
      const pageMatch = url.pathname.match(/^\/report\/([^/]+)$/);
      if (request.method === "GET" && pageMatch) {
        const report = await getReport(env.REPORTS_DB, decodeURIComponent(pageMatch[1]));
        if (!report) return withSecurityHeaders(new Response("<h1>Report not found</h1>", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }));
        return withSecurityHeaders(await invokeContainer(env, RENDER_CONTAINER, "/render", { report }));
      }
      if (request.method === "POST" && url.pathname === "/api/leads") {
        const body = await readBody(request);
        const email = String(body.email || "").trim();
        const siteUrl = normalizeUrl(body.site);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || body.consent !== true) return json(400, { error: "email 與個人資料同意為必填" });
        if (email.length > 254 || String(body.need || "").length > 1000 || String(body.name || "").length > 100) return json(400, { error: "欄位長度超過限制" });
        const now = new Date().toISOString();
        const leadId = crypto.randomUUID();
        await env.REPORTS_DB.prepare(`INSERT INTO audit_leads (
          lead_id, name, email, site_url, need, interest, source, report_id, consent_version, consented_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(leadId, String(body.name || "").trim(), email, siteUrl, String(body.need || "").trim(), String(body.interest || "diagnostic").slice(0, 80),
            String(body.source || "website").slice(0, 80), String(body.reportId || "").slice(0, 120), "2026-07-13", now, now).run();
        return json(200, { ok: true, leadId, nextAction: "已收到資料；如需進一步了解，我們會透過 Email 聯絡" });
      }
      return json(404, { error: "Not found" });
    } catch (error) {
      console.error(JSON.stringify({ event: "audit_api_error", code: error?.code || "internal_error" }));
      return json(error?.status || 500, { error: "Unable to process audit", code: error?.code || "internal_error" });
    }
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await processAudit(message, env);
        message.ack();
      } catch (error) {
        const jobId = String(message.body?.job_id || "");
        const attempt = Number(message.attempts || 1);
        const detail = describeFailure(error, { attempt });
        console.error(JSON.stringify({ event: "audit_job_failed", job_id: jobId, ...detail }));
        const now = new Date().toISOString();
        // `failure` is the latest attempt; the retry path also keeps `first_failure`, so a job
        // that failed twice shows what failed first and what failed last.
        const patch = JSON.stringify({ failure: { ...detail, at: now } });
        // After the last retry the message would sit in the unconsumed DLQ and the job would stay
        // queued forever, so the last failure marks the job failed and ends here.
        if (isFinalAttempt(attempt)) {
          if (jobId) {
            await env.REPORTS_DB.prepare(`UPDATE audit_jobs SET status = 'failed', lease_token = NULL, lease_expires_at = NULL, error_code = ?, completed_at = ?, updated_at = ?,
              diagnostics_json = json_patch(COALESCE(diagnostics_json, '{}'), ?)
              WHERE job_id = ? AND status IN ('queued', 'running')`)
              .bind(detail.code, now, now, patch, jobId).run();
          }
          message.ack();
          continue;
        }
        if (jobId) {
          await env.REPORTS_DB.prepare(`UPDATE audit_jobs SET status = 'queued', lease_token = NULL, lease_expires_at = NULL, error_code = ?, updated_at = ?,
            diagnostics_json = json_patch(COALESCE(diagnostics_json, '{}'), ?)
            WHERE job_id = ? AND status = 'running'`)
            .bind(detail.code, now, JSON.stringify({ failure: { ...detail, at: now }, first_failure: { ...detail, at: now } }), jobId).run();
        }
        message.retry({ delaySeconds: 60 });
      }
    }
  }
};
