// Bundle-level contract for the Product A Dashboard Worker.
//
// It builds the real Workers bundle so that a Node-only dependency (such as the
// `node:sqlite` store or a `__dirname` migration read) fails here rather than at
// deploy time, and pins the guarantees that keep the Dashboard closed by default
// and isolated from the Developer API.

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const outputDir = await mkdtemp(path.join(tmpdir(), "geocheck-dashboard-bundle-"));

try {
  await runWrangler(outputDir);
  const bundle = await readFile(path.join(outputDir, "worker.js"), "utf8");
  const worker = await readFile("services/cloudflare/dashboard/src/worker.js", "utf8");
  const config = JSON.parse(await readFile("services/cloudflare/dashboard/wrangler.jsonc", "utf8"));

  assert.doesNotMatch(bundle, /node:sqlite/, "The Dashboard Worker bundle must not include the local SQLite runtime");
  assert.doesNotMatch(bundle, /path\.join\(__dirname/, "The Dashboard Worker bundle must not read migrations from disk");

  // The Dashboard API must actually be mounted, not stubbed out.
  assert.match(bundle, /\/app-api\/v1\/projects/, "The Dashboard Worker must serve the /app-api/v1 routes");
  assert.match(worker, /createBoundD1DashboardStore/, "The Dashboard Worker must persist through its own D1 binding");
  assert.match(worker, /createDashboardApiHttpHandler/, "The Dashboard Worker must reuse the shared /app-api/v1 handler");

  assert.match(
    worker, /\/app-api\/v1\/healthz/,
    "Health must be reachable through the production route, which only covers /app-api/*"
  );

  assert.match(
    worker, /createD1OAuthStateStore/,
    "Google OAuth PKCE state must persist outside one Worker isolate"
  );
  assert.match(
    worker, /missingOAuthSecrets/,
    "Google sign-in readiness must be separate from Dashboard API readiness"
  );
  assert.match(
    bundle, /accounts\.google\.com/,
    "The Dashboard Worker must mount Google sign-in"
  );

  // The tracking loop (D-047 phase 2) must be mounted and fail closed.
  assert.match(
    worker, /createDashboardTrackingRunner/,
    "The scheduled tick must run the tracking loop, not a stub"
  );
  assert.match(
    worker, /missingTrackingSecrets/,
    "Tracking must not run without the internal caller secret"
  );
  assert.match(
    worker, /tracking_ready/,
    "Health must report whether tracking can run"
  );
  assert.doesNotMatch(
    bundle, /node:sqlite/,
    "The tracking runner must not drag the local SQLite store into the bundle"
  );

  // Search Console connection (the Project's own verification path).
  assert.match(
    worker, /createD1PendingGscStore/,
    "The two-step Search Console connect spans isolates, so its pending record must persist"
  );
  assert.match(
    worker, /encryptSecret/,
    "A pending Google refresh token must be stored encrypted, never in clear text"
  );
  assert.match(
    worker, /missingGscSecrets/,
    "Search Console must stay unavailable without its encryption key"
  );
  assert.match(worker, /search_console_ready/, "Health must report Search Console readiness");

  // Fails closed.
  assert.match(bundle, /configuration_incomplete/, "The Dashboard Worker must fail closed without runtime secrets");
  assert.match(worker, /REQUIRED_RUNTIME_SECRETS/, "Dashboard readiness must be an explicit secret list");
  assert.match(worker, /admission_enabled/, "Dashboard health must report the admission switch");
  assert.match(worker, /admission_closed/, "Dashboard payment callbacks must stay admission-gated");
  assert.match(worker, /Strict-Transport-Security/, "Dashboard Worker responses must enable HSTS");
  assert.match(worker, /"Cache-Control": "no-store"/, "Dashboard Worker responses must not be cached");

  // Product isolation: the Dashboard Worker must not reach Developer API state.
  assert.doesNotMatch(worker, /DEVELOPER_DB|developer_|\/v1\/console/, "The Dashboard Worker must not touch Developer API state");

  assert.equal(config.vars.DASHBOARD_ADMISSION_ENABLED, "false", "Dashboard admission must ship closed");
  assert.equal(config.vars.DASHBOARD_PAYMENT_MODE, "sandbox", "Dashboard payments must ship in sandbox mode");
  assert.equal(config.d1_databases[0].binding, "DASHBOARD_DB");
  assert.equal(config.d1_databases[0].database_name, "geocheck-dashboard");
  assert.deepEqual(config.routes, [
    { pattern: "geocheck.lisheng.cv/app-api/*", zone_name: "lisheng.cv" }
  ], "The Dashboard Worker owns /app-api/* only; Pages keeps /app/* and the audit Worker keeps /api/* and /report/*");

  console.log("cloudflare dashboard worker bundle tests passed");
} finally {
  await rm(outputDir, { recursive: true, force: true });
}

function runWrangler(outdir) {
  const wranglerArgs = [
    "deploy", "--dry-run", "--outdir", outdir,
    "--config", "services/cloudflare/dashboard/wrangler.jsonc"
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
