const { loadEnvFiles, requireEnv } = require("../../packages/shared/env.js");

loadEnvFiles();

async function main() {
  const gatewayUrl = requireEnv("GEOCHECK_DEVELOPER_D1_GATEWAY_URL").replace(/\/+$/, "");
  const gatewayToken = requireEnv("GEOCHECK_DEVELOPER_D1_GATEWAY_TOKEN");
  requireEnv("DEVELOPER_API_TOKEN_PEPPER");
  requireEnv("ADMIN_TOKEN");
  requireEnv("DEVELOPER_API_QUOTA_WINDOW_STRATEGY");
  requireEnv("DEVELOPER_API_RESULT_RETENTION_DAYS");
  requireEnv("DEVELOPER_API_DAILY_BUDGET_TWD");
  requireEnv("DEVELOPER_API_MONTHLY_BUDGET_TWD");
  requireEnv("DEVELOPER_API_MAX_JOB_COST_TWD");
  requireEnv("DEVELOPER_API_TWD_PER_USD");
  const response = await fetch(`${gatewayUrl}/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${gatewayToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'developer_%' ORDER BY name"
    }),
    signal: AbortSignal.timeout(10_000)
  });
  const body = await response.json();
  if (!response.ok || body.success !== true || body.result?.[0]?.success === false) {
    throw new Error("Developer D1 readiness query failed");
  }
  const names = new Set((body.result?.[0]?.results || []).map((row) => row.name));
  const required = [
    "developer_accounts", "developer_api_keys", "developer_cost_events",
    "developer_entitlements", "developer_jobs", "developer_measurement_results",
    "developer_provider_attempts", "developer_quota_reservations", "developer_security_events",
    "developer_cost_budget_windows", "developer_cost_reservations"
  ];
  const missing = required.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Developer D1 is missing tables: ${missing.join(", ")}`);
  console.log(JSON.stringify({ ready: true, database_isolated: true, table_count: names.size }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
