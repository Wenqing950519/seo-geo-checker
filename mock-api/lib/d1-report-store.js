const { createHash } = require("crypto");
const { isCacheableAuditReport } = require("./audit-cache");

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REPORT_BYTES = 900_000;

function buildAuditCacheKey({ siteUrl, customQueries = null, pipelineVersion }) {
  const parsed = new URL(siteUrl);
  const request = {
    site_origin: `${parsed.protocol}//${parsed.host}`.toLowerCase(),
    query_mode: Array.isArray(customQueries) && customQueries.length ? "custom" : "automatic",
    custom_queries: Array.isArray(customQueries) && customQueries.length
      ? customQueries.map((query) => String(query || "").trim().replace(/\s+/g, " "))
      : [],
    pipeline_version: String(pipelineVersion || "unknown")
  };
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

function createD1ReportStore(options = {}) {
  const config = normalizeConfig(options.config || process.env);
  const now = options.now || (() => Date.now());
  const fetchImpl = options.fetch || globalThis.fetch;
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : config.ttlMs;

  async function getByCacheKey(cacheKey) {
    if (!config.enabled) return null;
    const result = await query(
      "SELECT report_json, stored_at, expires_at FROM audit_reports WHERE cache_key = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
      [cacheKey, new Date(now()).toISOString()]
    );
    const row = result.results?.[0];
    return hydrateCachedRow(row, cacheKey, now);
  }

  async function getById(reportId) {
    if (!config.enabled) return null;
    const result = await query("SELECT report_json FROM audit_reports WHERE report_id = ? LIMIT 1", [String(reportId || "")]);
    const row = result.results?.[0];
    if (!row?.report_json) return null;
    try { return JSON.parse(row.report_json); } catch { return null; }
  }

  async function set(cacheKey, report) {
    if (!config.enabled || !isCacheableAuditReport(report)) return false;
    const reportJson = JSON.stringify(report);
    if (Buffer.byteLength(reportJson, "utf8") > MAX_REPORT_BYTES) return false;
    const storedAt = new Date(now()).toISOString();
    const expiresAt = new Date(now() + ttlMs).toISOString();
    const parsed = new URL(report.url);
    const queryPlan = report.queryPlanning?.queryPlan || {};
    await query(
      `INSERT INTO audit_reports (
        report_id, cache_key, site_origin, query_mode, query_set_version,
        pipeline_version, algorithm_version, entity_name, created_at, stored_at,
        expires_at, report_hash, report_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(report_id) DO UPDATE SET
        cache_key = excluded.cache_key,
        stored_at = excluded.stored_at,
        expires_at = excluded.expires_at,
        report_hash = excluded.report_hash,
        report_json = excluded.report_json`,
      [
        String(report.id), cacheKey, `${parsed.protocol}//${parsed.host}`.toLowerCase(),
        String(report.queryPlanning?.source || "").includes("user_queries") ? "custom" : "automatic",
        String(queryPlan.query_set_version || "unknown"), String(report.pipelineVersion || "unknown"),
        String(report.audit?.score?.algorithm_version || report.algorithmVersion || "unknown"),
        String(report.audit?.query_planning?.entity_name || "unknown"), String(report.createdAt || storedAt),
        storedAt, expiresAt, createHash("sha256").update(reportJson).digest("hex"), reportJson
      ]
    );
    return true;
  }

  async function query(sql, params) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetchImpl(config.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sql, params }),
        signal: controller.signal
      });
      const body = await response.json();
      if (!response.ok || body.success !== true || !Array.isArray(body.result) || body.result[0]?.success === false) {
        throw new Error("D1 report store query failed");
      }
      return body.result[0] || { results: [] };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    getByCacheKey,
    getById,
    set,
    state: () => ({ enabled: config.enabled, ttlMs })
  };
}

function normalizeConfig(source) {
  const accountId = String(source.CLOUDFLARE_ACCOUNT_ID || source.accountId || "").trim();
  const databaseId = String(source.CLOUDFLARE_D1_DATABASE_ID || source.databaseId || "").trim();
  const apiToken = String(source.CLOUDFLARE_D1_API_TOKEN || source.apiToken || "").trim();
  const ttlMs = Math.max(0, Number(source.AUDIT_CACHE_TTL_MS || source.ttlMs || DEFAULT_TTL_MS));
  return {
    accountId,
    databaseId,
    apiToken,
    ttlMs,
    enabled: Boolean(accountId && databaseId && apiToken),
    endpoint: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`
  };
}

function hydrateCachedRow(row, cacheKey, now) {
  if (!row?.report_json) return null;
  try {
    const report = JSON.parse(row.report_json);
    const ageMs = Math.max(0, now() - Date.parse(row.stored_at));
    return {
      report,
      cache: { hit: true, key: cacheKey, ageSeconds: Math.floor(ageMs / 1000), expiresAt: row.expires_at }
    };
  } catch {
    return null;
  }
}

module.exports = { buildAuditCacheKey, createD1ReportStore };
