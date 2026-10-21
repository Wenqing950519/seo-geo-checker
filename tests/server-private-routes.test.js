const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

// Classic server (services/api/server.js) routes that must stay private or bounded. These assertions used to
// live in developer-api-http.test.js next to the Developer API checks; when the Platform code moved to
// ls-labs (products/platform, LSL-D-009) the Platform half went with it and this half stayed.
// The server no longer mounts any Developer API, so /v1 must answer like any unknown path.

const root = path.resolve(__dirname, "..");

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

async function main() {
  const port = await availablePort();
  const child = spawn(process.execPath, ["services/api/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      LEGACY_HOST: "unused.invalid",
      ADMIN_TOKEN: "admin-test-key-1234567890-abcdef"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server readiness timeout: ${stderr}`)), 10_000);
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited ${code}: ${stderr}`));
      });
      child.stdout.on("data", (chunk) => {
        if (String(chunk).includes(`localhost:${port}`)) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const base = `http://127.0.0.1:${port}`;
    const paidProbe = await fetch(`${base}/api/test-provider`, { method: "POST" });
    assert.equal(paidProbe.status, 401, "paid provider probes must require admin authentication");
    const paidProbePreflight = await fetch(`${base}/api/test-provider`, { method: "OPTIONS" });
    assert.equal(paidProbePreflight.status, 204);
    assert.equal(paidProbePreflight.headers.get("access-control-allow-origin"), null);
    const rateState = await fetch(`${base}/api/rate-limit-state`);
    assert.equal(rateState.status, 401, "operational state must require admin authentication");
    const authorizedRateState = await fetch(`${base}/api/rate-limit-state`, {
      headers: { "X-Admin-Token": "admin-test-key-1234567890-abcdef" }
    });
    assert.equal(authorizedRateState.status, 200);
    assert.equal(authorizedRateState.headers.get("cache-control"), "no-store");
    assert.equal(authorizedRateState.headers.get("access-control-allow-origin"), null);
    const unsafeLeadSite = await fetch(`${base}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "security@example.com", site: "javascript:alert(1)", consent: true })
    });
    assert.equal(unsafeLeadSite.status, 400);
    const oversizedLead = await fetch(`${base}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "security@example.com", site: "https://example.com", consent: true, need: "x".repeat(1_010_000) })
    });
    assert.equal(oversizedLead.status, 413);
    // Platform moved out: this server must not answer the Developer API any more.
    const usage = await fetch(`${base}/v1/usage`);
    assert.notEqual(usage.status, 200, "/v1 belongs to the Platform Worker now");
    assert.notEqual(usage.status, 401, "/v1 must not reach a Developer API handler");
    console.log("classic server private route tests passed");
  } finally {
    const stopped = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    if (child.exitCode === null) await stopped;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
