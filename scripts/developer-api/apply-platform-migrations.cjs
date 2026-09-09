const fs = require("node:fs");
const path = require("node:path");
const { loadEnvFiles, requireEnv } = require("../../packages/shared/env.js");

loadEnvFiles();

async function main() {
  const accountId = requireEnv("GEOCHECK_DEVELOPER_D1_ACCOUNT_ID");
  const databaseId = requireEnv("GEOCHECK_DEVELOPER_D1_DATABASE_ID");
  const apiToken = requireEnv("GEOCHECK_DEVELOPER_D1_API_TOKEN");
  if (databaseId === String(process.env.CLOUDFLARE_D1_DATABASE_ID || "").trim()) {
    throw new Error("Refusing to apply Developer API migrations to product A's D1 database");
  }
  const directory = path.resolve(__dirname, "../../services/api/developer-api-migrations");
  const files = fs.readdirSync(directory).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(directory, file), "utf8");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
      signal: AbortSignal.timeout(30_000)
    });
    const body = await response.json();
    if (!response.ok || body.success !== true || body.result?.some((item) => item?.success === false)) {
      const error = new Error(`Migration failed: ${file}`);
      error.code = "migration_failed";
      throw error;
    }
    console.log(`applied ${file}`);
  }
  console.log(`Developer API schema ready (${files.length} migrations)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
