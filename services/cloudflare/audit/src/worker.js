import { Container, getContainer } from "@cloudflare/containers";
import { env as workerEnv } from "cloudflare:workers";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};

export class AuditFallbackContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "2m";
  envVars = {
    DEEPSEEK_API_KEY: workerEnv.DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL: workerEnv.DEEPSEEK_MODEL,
    PERPLEXITY_API_KEY: workerEnv.PERPLEXITY_API_KEY
  };
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function normalizeUrl(input) {
  const raw = String(input || "").trim();
  const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || isPrivateHost(url.hostname)) {
    const error = new Error("invalid_target_url");
    error.status = 400;
    throw error;
  }
  return url.toString();
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return true;
  const parts = host.match(/^(\d+)\.(\d+)\./);
  return Boolean(parts && Number(parts[1]) === 172 && Number(parts[2]) >= 16 && Number(parts[2]) <= 31);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cacheKey(siteUrl, customQueries, pipelineVersion) {
  const parsed = new URL(siteUrl);
  return sha256(JSON.stringify({
    site_origin: `${parsed.protocol}//${parsed.host}`.toLowerCase(),
    custom_queries: customQueries || [],
    pipeline_version: String(pipelineVersion || "unknown")
  }));
}

async function readBody(request, maxBytes = 16 * 1024) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw Object.assign(new Error("request_too_large"), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw Object.assign(new Error("request_too_large"), { status: 413 });
  return JSON.parse(text || "{}");
}

async function getJob(db, jobId) {
  return (await db.prepare("SELECT * FROM audit_jobs WHERE job_id = ? LIMIT 1").bind(jobId).first()) || null;
}

async function getReport(db, reportId) {
  const row = await db.prepare("SELECT report_json FROM audit_reports WHERE report_id = ? LIMIT 1").bind(reportId).first();
  if (!row?.report_json) return null;
  try { return JSON.parse(row.report_json); } catch { return null; }
}

async function invokeContainer(env, jobId, path, body) {
  const container = getContainer(env.AUDIT_FALLBACK, `audit-${jobId}`);
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
  let html = null;
  let browserError = null;
  try { html = await browserHtml(env, job.site_url); } catch (error) { browserError = String(error?.message || "browser_run_failed").slice(0, 240); }
  const response = await invokeContainer(env, jobId, "/audit", {
    url: job.site_url,
    custom_queries: queries,
    ...(html ? { browser_html: html } : {})
  });
  if (!response.ok) throw new Error(`audit_container_http_${response.status}`);
  const payload = await response.json();
  if (!payload?.report || typeof payload.report !== "object") throw new Error("audit_container_invalid_result");
  const report = payload.report;
  const reportJson = JSON.stringify(report);
  const completedAt = new Date().toISOString();
  const limited = report?.model === "fetch-limited" || report?.homepage?.fetchBlocked === true;
  await env.REPORTS_DB.batch([
    env.REPORTS_DB.prepare(`INSERT INTO audit_reports (
      report_id, cache_key, site_origin, query_mode, query_set_version, pipeline_version, algorithm_version,
      entity_name, created_at, stored_at, expires_at, report_hash, report_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_id) DO UPDATE SET stored_at = excluded.stored_at, expires_at = excluded.expires_at,
      report_hash = excluded.report_hash, report_json = excluded.report_json`).bind(
      job.report_id, job.cache_key, new URL(job.site_url).origin.toLowerCase(), queries.length ? "custom" : "automatic",
      String(report.queryPlanning?.queryPlan?.query_set_version || "unknown"), String(report.pipelineVersion || workerEnv.AUDIT_PIPELINE_VERSION || "unknown"),
      String(report.audit?.score?.algorithm_version || report.algorithmVersion || "unknown"),
      String(report.audit?.query_planning?.entity_name || "unknown"), String(report.createdAt || completedAt), completedAt,
      new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(), await sha256(reportJson), reportJson
    ),
    env.REPORTS_DB.prepare(`UPDATE audit_jobs SET status = ?, completed_at = ?, updated_at = ?, diagnostics_json = ?, error_code = NULL
      WHERE job_id = ? AND lease_token = ?`).bind(
      limited ? "completed_with_limitations" : "completed", completedAt, completedAt,
      JSON.stringify({ browser_run: html ? "succeeded" : "failed", browser_error: browserError, crawl_path: payload.crawl_path || "unknown" }), jobId, leaseToken
    )
  ]);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/api/audit-real-lite") {
        const body = await readBody(request);
        const siteUrl = normalizeUrl(body.url);
        const customQueries = Array.isArray(body.customQueries)
          ? body.customQueries.map((item) => String(item || "").trim()).filter(Boolean) : [];
        if (customQueries.length > 4 || new Set(customQueries.map((item) => item.toLowerCase())).size !== customQueries.length) {
          return json(400, { error: "自訂觀測題最多 4 題，且每題都必須不同。", code: "invalid_custom_queries" });
        }
        const key = await cacheKey(siteUrl, customQueries, env.AUDIT_PIPELINE_VERSION);
        const cached = await env.REPORTS_DB.prepare("SELECT report_id FROM audit_reports WHERE cache_key = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1")
          .bind(key, new Date().toISOString()).first();
        const jobId = `aud_${crypto.randomUUID()}`;
        const reportId = cached?.report_id || `real_lite_${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        await env.REPORTS_DB.prepare(`INSERT INTO audit_jobs (
          job_id, report_id, cache_key, site_url, custom_queries_json, status, created_at, updated_at, completed_at, diagnostics_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(jobId, reportId, key, siteUrl, JSON.stringify(customQueries), cached ? "completed" : "queued", now, now,
            cached ? now : null, JSON.stringify({ cache_hit: Boolean(cached) })).run();
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
      const pageMatch = url.pathname.match(/^\/report\/([^/]+)$/);
      if (request.method === "GET" && pageMatch) {
        const report = await getReport(env.REPORTS_DB, decodeURIComponent(pageMatch[1]));
        if (!report) return new Response("<h1>Report not found</h1>", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
        return invokeContainer(env, `render-${pageMatch[1]}`, "/render", { report });
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
        console.error(JSON.stringify({ event: "audit_job_failed", code: error?.code || "audit_failed" }));
        const jobId = String(message.body?.job_id || "");
        if (jobId) {
          await env.REPORTS_DB.prepare("UPDATE audit_jobs SET status = 'queued', lease_token = NULL, lease_expires_at = NULL, error_code = ?, updated_at = ? WHERE job_id = ? AND status = 'running'")
            .bind(String(error?.code || "audit_failed").slice(0, 120), new Date().toISOString(), jobId).run();
        }
        message.retry({ delaySeconds: 60 });
      }
    }
  }
};
