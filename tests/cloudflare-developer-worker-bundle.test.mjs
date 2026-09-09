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
  const pagesHeaders = await readFile("apps/web/public/_headers", "utf8");
  const auditConfig = JSON.parse(await readFile("services/cloudflare/audit/wrangler.jsonc", "utf8"));
  const developerConfig = JSON.parse(await readFile("services/cloudflare/developer-api/wrangler.jsonc", "utf8"));
  assert.doesNotMatch(bundle, /node:sqlite/, "Workers bundle must not include the local SQLite runtime");
  assert.doesNotMatch(bundle, /path\.join\(__dirname/, "Workers bundle must not evaluate CommonJS __dirname paths");
  assert.match(bundle, /configuration_incomplete/, "Developer Worker must fail closed when runtime secrets are absent");
  assert.equal(developerConfig.vars.DEVELOPER_API_QUOTA_WINDOW_STRATEGY, "rolling_24h");
  assert.equal(developerConfig.vars.DEVELOPER_API_RESULT_RETENTION_DAYS, "30");
  assert.equal(auditConfig.vars.AUDIT_ADMISSION_ENABLED, "false");
  assert.equal(auditConfig.containers[0].image_build_context, "../../..");
  assert.deepEqual(auditConfig.routes, [
    { pattern: "geocheck.lisheng.cv/api/*", zone_name: "lisheng.cv" },
    { pattern: "geocheck.lisheng.cv/report/*", zone_name: "lisheng.cv" }
  ]);
  assert.match(auditWorker, /AUDIT_ADMISSION_ENABLED/, "Audit Worker must guard new paid jobs with an admission switch");
  assert.match(auditWorker, /Strict-Transport-Security/, "Audit Worker responses must enable HSTS");
  assert.match(pagesHeaders, /Strict-Transport-Security:\s*max-age=31536000/i, "Pages responses must enable HSTS");
  console.log("cloudflare developer worker bundle tests passed");
} finally {
  await rm(outputDir, { recursive: true, force: true });
}

function runWrangler(outdir) {
  const wranglerArgs = [
    "wrangler", "deploy", "--dry-run", "--outdir", outdir,
    "--config", "services/cloudflare/developer-api/wrangler.jsonc"
  ];
  const executable = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npx";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npx.cmd", ...wranglerArgs] : wranglerArgs;
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
