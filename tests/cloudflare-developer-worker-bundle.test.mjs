import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const outputDir = await mkdtemp(path.join(tmpdir(), "geocheck-worker-bundle-"));

try {
  await runWrangler(outputDir);
  const bundle = await readFile(path.join(outputDir, "worker.js"), "utf8");
  const auditWorker = await readFile("services/cloudflare/audit/src/worker.js", "utf8");
  const developerWorker = await readFile("services/cloudflare/developer-api/src/worker.js", "utf8");
  const developerOAuthMigration = await readFile("services/api/developer-api-migrations/0004_google_oauth_state.sql", "utf8");
  const pagesHeaders = await readFile("apps/web/public/_headers", "utf8");
  const auditConfig = JSON.parse(await readFile("services/cloudflare/audit/wrangler.jsonc", "utf8"));
  const developerConfig = JSON.parse(await readFile("services/cloudflare/developer-api/wrangler.jsonc", "utf8"));
  assert.doesNotMatch(bundle, /node:sqlite/, "Workers bundle must not include the local SQLite runtime");
  assert.doesNotMatch(bundle, /path\.join\(__dirname/, "Workers bundle must not evaluate CommonJS __dirname paths");
  assert.match(bundle, /configuration_incomplete/, "Developer Worker must fail closed when runtime secrets are absent");
  assert.equal(developerConfig.vars.DEVELOPER_API_QUOTA_WINDOW_STRATEGY, "rolling_24h");
  assert.equal(developerConfig.vars.DEVELOPER_API_RESULT_RETENTION_DAYS, "30");
  assert.deepEqual(developerConfig.routes, [
    { pattern: "platform.lslabs.tw", custom_domain: true },
    { pattern: "api.geocheck.lisheng.cv", custom_domain: true }
  ]);
  assert.equal(developerConfig.assets.directory, "../../../apps/web/public");
  assert.equal(developerConfig.assets.binding, "ASSETS");
  // brand.html and whitepaper.html sit in the shared public directory for
  // geocheck.lslabs.tw. Without this, static assets answer first on
  // platform.lslabs.tw and the redirect to the main domain never runs.
  assert.deepEqual(developerConfig.assets.run_worker_first, [
    "/brand", "/brand/", "/whitepaper", "/whitepaper/",
    "/sitemap.xml", "/robots.txt"
  ]);
  assert.equal(auditConfig.vars.AUDIT_ADMISSION_ENABLED, "false");
  assert.equal(auditConfig.containers[0].image_build_context, "../../..");
  assert.deepEqual(auditConfig.routes, [
    { pattern: "geocheck.lslabs.tw/api/*", zone_name: "lslabs.tw" },
    { pattern: "geocheck.lslabs.tw/report/*", zone_name: "lslabs.tw" },
    { pattern: "geocheck.lisheng.cv/api/*", zone_name: "lisheng.cv" },
    { pattern: "geocheck.lisheng.cv/report/*", zone_name: "lisheng.cv" }
  ]);
  assert.match(auditWorker, /AUDIT_ADMISSION_ENABLED/, "Audit Worker must guard new paid jobs with an admission switch");
  assert.match(auditWorker, /Strict-Transport-Security/, "Audit Worker responses must enable HSTS");
  assert.match(developerWorker, /Strict-Transport-Security/, "Developer Worker responses must enable HSTS");
  assert.match(developerWorker, /createD1OAuthStateStore/, "Google OAuth state must persist outside one Worker isolate");
  assert.match(developerWorker, /missingOAuthSecrets/, "Google login readiness must be separate from provider measurement readiness");
  assert.match(
    developerWorker, /isConsolePath/,
    "Developer Console must be served from the B API origin at its canonical slash path"
  );
  assert.doesNotMatch(
    developerWorker, /Response\.redirect\(new URL\("\/developers\/console"/,
    "Redirecting between the Console's two paths loops against the asset layer"
  );
  assert.match(
    developerWorker, /assetUrl\.pathname = "\/developers-console"/,
    "The Console asset must be fetched extensionless; the .html form 308s back into the Worker"
  );
  assert.match(developerWorker, /url\.hostname === "platform\.lslabs\.tw"/, "Platform host must own its landing, docs, and Console");
  assert.match(developerWorker, /https:\/\/lslabs\.tw\/brand\//, "Platform brand links must resolve to the LS Labs brand source");
  assert.match(developerWorker, /https:\/\/lslabs\.tw\/research\/geo-whitepaper\//, "Platform research links must resolve to the LS Labs research source");
  // Internal channel (D-047): separate switch, separate budget, own auth.
  assert.match(
    developerWorker, /pathname\.startsWith\("\/internal\/v1\/"\)/,
    "Products A and C must reach measurement through /internal/v1, never /v1"
  );
  assert.match(
    developerWorker, /authenticateInternalCaller/,
    "The internal channel must authenticate its caller"
  );
  assert.match(
    developerWorker, /adminAuthorized/,
    "Rotating an internal caller secret must require the admin token"
  );
  assert.equal(
    developerConfig.vars.DEVELOPER_API_INTERNAL_DAILY_BUDGET_TWD, "500",
    "The internal daily spend cap must be configured apart from the customer one"
  );
  assert.equal(developerConfig.vars.DEVELOPER_API_INTERNAL_MONTHLY_BUDGET_TWD, "3000");
  assert.notEqual(
    developerConfig.vars.DEVELOPER_API_INTERNAL_DAILY_BUDGET_TWD,
    developerConfig.vars.DEVELOPER_API_DAILY_BUDGET_TWD,
    "Internal and customer budgets must not silently share one number"
  );
  assert.match(developerOAuthMigration, /developer_google_oauth_states/, "Developer OAuth state requires its own Product B D1 table");
  assert.match(pagesHeaders, /Strict-Transport-Security:\s*max-age=31536000/i, "Pages responses must enable HSTS");
  console.log("cloudflare developer worker bundle tests passed");
} finally {
  await rm(outputDir, { recursive: true, force: true });
}

function runWrangler(outdir) {
  const wranglerArgs = [
    "deploy", "--dry-run", "--outdir", outdir,
    "--config", "services/cloudflare/developer-api/wrangler.jsonc"
  ];
  const executable = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npx";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "wrangler.cmd", ...wranglerArgs]
    : ["wrangler", ...wranglerArgs];
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`wrangler dry-run exited ${code}: ${stderr}`)));
  });
}
