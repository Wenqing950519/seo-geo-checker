const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createDeveloperApiHttpHandler } = require("../services/api/developer-api-http.js");

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

async function waitForResult(base, headers, measurementId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${base}/v1/measurements/${measurementId}`, { headers });
    if (response.status === 200) return response.json();
    assert.equal(response.status, 409, "result should be queued or available");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("HTTP fixture result did not become available");
}

async function main() {
  assert.throws(
    () => createDeveloperApiHttpHandler({ config: { DEVELOPER_API_MODE: "typo" } }),
    /must be fixture or official/
  );
  assert.throws(
    () => createDeveloperApiHttpHandler({
      config: {
        DEVELOPER_API_PROTOTYPE_ENABLED: "true",
        DEVELOPER_API_PROTOTYPE_KEY: "short",
        DEVELOPER_API_MODE: "fixture"
      }
    }),
    /at least 14 characters/
  );
  const port = await availablePort();
  const child = spawn(process.execPath, ["services/api/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      LEGACY_HOST: "unused.invalid",
      DEVELOPER_API_PROTOTYPE_ENABLED: "true",
      DEVELOPER_API_PROTOTYPE_KEY: "prototype-test-key-1234567890-abcdef",
      DEVELOPER_API_MODE: "fixture",
      DEVELOPER_API_PROTOTYPE_TENANT: "http_fixture_tenant",
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
    const unauthorized = await fetch(`${base}/v1/usage`);
    assert.equal(unauthorized.status, 401);
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
    const preflight = await fetch(`${base}/v1/measurements`, { method: "OPTIONS" });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), null);

    const headers = {
      Authorization: "Bearer prototype-test-key-1234567890-abcdef",
      "Content-Type": "application/json",
      "Idempotency-Key": "http-fixture-request-1"
    };
    const created = await fetch(`${base}/v1/measurements`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: { type: "url", url: "https://example.com/course" },
        locale: "zh-TW"
      })
    });
    assert.equal(created.status, 202);
    assert.equal(created.headers.get("cache-control"), "no-store");
    assert.equal(created.headers.get("x-content-type-options"), "nosniff");
    assert.equal(created.headers.get("access-control-allow-origin"), null, "private API must not opt into browser CORS");
    assert.match(created.headers.get("location"), /^\/v1\/jobs\//);
    const accepted = await created.json();
    assert.equal(accepted.status, "queued");

    const result = await waitForResult(base, headers, accepted.measurement_id);
    assert.equal(result.status, "succeeded");
    assert.equal(Object.hasOwn(result, "tenant_id"), false, "internal tenant ids must not be returned");
    assert.equal(result.question_source, "generated");
    assert.equal(result.engines.length, 4);
    assert.equal(result.quota.charged_rounds, 1);

    const replay = await fetch(`${base}/v1/measurements`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { type: "url", url: "https://example.com/course" }, locale: "zh-TW" })
    });
    assert.equal(replay.status, 202);
    const replayBody = await replay.json();
    assert.equal(replayBody.idempotent_replay, true);
    assert.equal(replayBody.job_id, accepted.job_id);

    const usage = await fetch(`${base}/v1/usage`, { headers });
    assert.deepEqual(await usage.json(), {
      used_rounds: 1,
      reserved_rounds: 0,
      remaining_rounds: 2,
      quota_limit: 3
    });
    console.log("developer API HTTP smoke test passed");
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
