const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "services/cloudflare/dashboard/wrangler.jsonc"), "utf8"));
const database = config.d1_databases?.find((binding) => binding.binding === "DASHBOARD_DB");

assert.ok(database, "Dashboard Worker requires its own D1 binding");
assert.equal(database.database_name, "geocheck-dashboard");
assert.notEqual(database.database_id, "00000000-0000-0000-0000-000000000000", "Dashboard must not retain a placeholder database ID");

for (const [file, table] of [
  ["0001_dashboard_tracking.sql", "dashboard_projects"],
  ["0002_dashboard_google_gsc.sql", "dashboard_google_connections"],
  ["0003_dashboard_billing.sql", "dashboard_entitlements"]
]) {
  const migration = fs.readFileSync(path.join(root, "services/cloudflare/dashboard/migrations", file), "utf8");
  assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `${file} must contain the canonical ${table} schema`);
}

console.log("dashboard Cloudflare D1 foundation tests passed");
