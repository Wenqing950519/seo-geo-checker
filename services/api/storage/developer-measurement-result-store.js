const { createHash } = require("node:crypto");

const MAX_RESULT_BYTES = 512 * 1024;

function createInMemoryMeasurementResultStore() {
  const records = new Map();
  return {
    async get({ tenantId, measurementId }) {
      return records.get(`${tenantId}:${measurementId}`) || null;
    },
    async put(result) {
      assertResultSize(result);
      records.set(`${result.tenant_id}:${result.measurement_id}`, structuredClone(result));
      return true;
    },
    state: () => ({ kind: "memory", enabled: true, maxResultBytes: MAX_RESULT_BYTES })
  };
}

function createD1MeasurementResultStore(options = {}) {
  const config = normalizeConfig(options.config || process.env);
  const fetchImpl = options.fetch || globalThis.fetch;

  async function get({ tenantId, measurementId }) {
    if (!config.enabled) return null;
    const result = await query(
      "SELECT result_json FROM developer_measurement_results WHERE tenant_id = ? AND measurement_id = ? LIMIT 1",
      [String(tenantId), String(measurementId)]
    );
    const value = result.results?.[0]?.result_json;
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  async function put(measurement) {
    assertResultSize(measurement);
    if (!config.enabled) return false;
    const resultJson = JSON.stringify(measurement);
    await query(
      `INSERT INTO developer_measurement_results (
        measurement_id, tenant_id, status, created_at, completed_at, result_hash, result_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(measurement_id) DO UPDATE SET
        status = excluded.status,
        completed_at = excluded.completed_at,
        result_hash = excluded.result_hash,
        result_json = excluded.result_json`,
      [
        String(measurement.measurement_id), String(measurement.tenant_id), String(measurement.status),
        String(measurement.created_at), String(measurement.completed_at || measurement.created_at),
        createHash("sha256").update(resultJson).digest("hex"), resultJson
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
        throw new Error("Developer measurement D1 query failed");
      }
      return body.result[0] || { results: [] };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    get,
    put,
    state: () => ({ kind: "d1", enabled: config.enabled, maxResultBytes: MAX_RESULT_BYTES })
  };
}

function createPrototypeMeasurementResultStore(options = {}) {
  const d1 = createD1MeasurementResultStore(options);
  return d1.state().enabled ? d1 : createInMemoryMeasurementResultStore();
}

function normalizeConfig(source) {
  const gatewayUrl = String(source.GEOCHECK_DEVELOPER_D1_GATEWAY_URL || source.gatewayUrl || "").trim().replace(/\/+$/, "");
  const gatewayToken = String(source.GEOCHECK_DEVELOPER_D1_GATEWAY_TOKEN || source.gatewayToken || "").trim();
  const accountId = String(source.GEOCHECK_DEVELOPER_D1_ACCOUNT_ID || source.accountId || "").trim();
  const databaseId = String(source.GEOCHECK_DEVELOPER_D1_DATABASE_ID || source.databaseId || "").trim();
  const apiToken = String(source.GEOCHECK_DEVELOPER_D1_API_TOKEN || source.apiToken || "").trim();
  const auditDatabaseId = String(source.CLOUDFLARE_D1_DATABASE_ID || "").trim();
  if (databaseId && auditDatabaseId && databaseId === auditDatabaseId) {
    throw new Error("Developer API must not use product A's D1 database");
  }
  const gatewayEnabled = Boolean(gatewayUrl && gatewayToken);
  const restEnabled = Boolean(accountId && databaseId && apiToken);
  if (gatewayEnabled && restEnabled) throw new Error("Configure Developer D1 gateway or REST credentials, not both");
  return {
    apiToken: gatewayEnabled ? gatewayToken : apiToken,
    enabled: gatewayEnabled || restEnabled,
    endpoint: gatewayEnabled
      ? `${gatewayUrl}/v1/query`
      : `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`
  };
}

function assertResultSize(value) {
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > MAX_RESULT_BYTES) {
    const error = new Error(`Measurement result exceeds ${MAX_RESULT_BYTES} bytes`);
    error.code = "result_too_large";
    throw error;
  }
}

module.exports = {
  MAX_RESULT_BYTES,
  createD1MeasurementResultStore,
  createInMemoryMeasurementResultStore,
  createPrototypeMeasurementResultStore
};
