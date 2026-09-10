const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const appDir = path.join(root, "apps/web/app");
const developerConsole = fs.readFileSync(path.join(root, "apps/web/public/developers-console.html"), "utf8");
const dashboardState = fs.readFileSync(path.join(appDir, "shared/state.js"), "utf8");
const dashboardApi = fs.readFileSync(path.join(appDir, "shared/api.js"), "utf8");
assert.match(developerConsole, /https:\/\/api\.geocheck\.lisheng\.cv\/v1\/auth\/google\/start/, "Developer Console Google login must target the isolated B API origin");
assert.doesNotMatch(developerConsole, /href="\/developers(?:\/docs)?"/, "Developer Console links must not resolve to the B API origin after same-origin deployment");
assert.doesNotMatch(developerConsole, /gcs_live_dev_session_demo|key_demo_default|Mock initial jobs/, "Developer Console must not authenticate, create keys, or show jobs from browser-only demo data");
assert.match(developerConsole, /consoleRequest\('\/v1\/console\/api-keys'/, "Developer Console must list API keys through the B Console API");
assert.match(developerConsole, /consoleRequest\('\/v1\/console\/jobs'/, "Developer Console must list jobs through the B Console API");
assert.match(developerConsole, /consoleRequest\('\/v1\/console\/usage'/, "Developer Console must load its quota through the B Console API");
assert.match(dashboardState, /this\.fixtureMode = false/, "Dashboard must not default to fixture data");
assert.doesNotMatch(dashboardApi, /falling back to acceptance fixtures/i, "Dashboard must not silently replace failed live data with fixtures");

// 1. Verify Directory Architecture (Folder per tab matching Themap)
const REQUIRED_FILES = [
  "index.html",
  "app.css",
  "app.js",
  "shared/icons.js",
  "shared/formatters.js",
  "shared/chart-utils.js",
  "shared/fixtures.js",
  "shared/api.js",
  "shared/state.js",
  "shared/sidebar.js",
  "shared/header.js",
  "overview/overview-view.js",
  "overview/overview.css",
  "performance/performance-view.js",
  "performance/performance.css",
  "questions/questions-view.js",
  "questions/questions.css",
  "citations/citations-view.js",
  "citations/citations.css",
  "quality/quality-view.js",
  "quality/quality.css",
  "evidence/evidence-drawer.js",
  "evidence/evidence-drawer.css",
  "auth/auth-view.js",
  "auth/auth.css"
];

for (const relPath of REQUIRED_FILES) {
  const fullPath = path.join(appDir, relPath);
  assert.ok(fs.existsSync(fullPath), `Required frontend module missing: ${relPath}`);
}

// 2. Strict Boundary & Security Audit: No Developer API leakage in frontend
const FORBIDDEN_TERMS = ["gck_", "gcs_", "tenant_id", "provider_cost", "developer_job_id", "api_key"];
function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".html")) {
      const content = fs.readFileSync(full, "utf8");
      for (const term of FORBIDDEN_TERMS) {
        assert.doesNotMatch(
          content,
          new RegExp(`\\b${term}\\b`, "i"),
          `Forbidden Developer concept "${term}" found in Dashboard frontend: ${path.relative(root, full)}`
        );
      }
    }
  }
}
scanDir(appDir);

// 3. Check acceptance fixtures in shared/fixtures.js
const fixturesContent = fs.readFileSync(path.join(appDir, "shared/fixtures.js"), "utf8");
assert.match(fixturesContent, /baseline/);
assert.match(fixturesContent, /twelve_weeks/);
assert.match(fixturesContent, /partial_run/);
assert.match(fixturesContent, /failed_run/);
assert.match(fixturesContent, /version_change/);

// 4. HTTP Route & Asset Serving Verification
async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function testHttpRoutes() {
  const port = await availablePort();
  const child = spawn(process.execPath, ["services/api/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DASHBOARD_API_ENABLED: "true",
      DASHBOARD_TOKEN_PEPPER: "test-pepper-thirty-two-bytes-length-here",
      DASHBOARD_ADMIN_TOKEN: "test-admin-token-at-least-twenty-bytes",
      DASHBOARD_DATABASE_PATH: ":memory:"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data; });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Server timeout: " + stderr)), 8000);
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error("Server exited: " + code));
      });
      child.stdout.on("data", (data) => {
        if (String(data).includes(`localhost:${port}`)) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    const base = `http://127.0.0.1:${port}`;

    // Test /app and /app/
    for (const route of ["/app", "/app/"]) {
      const res = await fetch(base + route);
      assert.equal(res.status, 200, `GET ${route} status`);
      assert.match(res.headers.get("content-type") || "", /text\/html/);
      const text = await res.text();
      assert.match(text, /GeoCheck Dashboard/);
      assert.match(text, /id="sidebar-container"/);
      assert.match(text, /id="drawer-container"/);
    }

    // Test static assets under /app/*
    for (const [subRoute, mimeRegex] of [
      ["/app/app.css", /text\/css/],
      ["/app/app.js", /javascript/],
      ["/app/overview/overview-view.js", /javascript/],
      ["/app/performance/performance-view.js", /javascript/],
      ["/app/questions/questions-view.js", /javascript/],
      ["/app/citations/citations-view.js", /javascript/],
      ["/app/quality/quality-view.js", /javascript/],
      ["/app/evidence/evidence-drawer.js", /javascript/],
      ["/app/evidence/evidence-drawer.css", /text\/css/]
    ]) {
      const res = await fetch(base + subRoute);
      assert.equal(res.status, 200, `GET ${subRoute}`);
      assert.match(res.headers.get("content-type") || "", mimeRegex, `MIME for ${subRoute}`);
      const body = await res.text();
      assert.ok(body.length > 50, `${subRoute} must not be empty`);
    }

    console.log("dashboard frontend HTTP routes and asset tests passed");
  } finally {
    const stopped = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    if (child.exitCode === null) await stopped;
  }
}

testHttpRoutes().then(() => {
  console.log("All dashboard frontend tests passed successfully!");
}).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
