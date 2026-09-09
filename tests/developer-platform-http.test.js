const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

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

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

async function waitForResult(base, headers, measurementId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const item = await jsonRequest(`${base}/v1/measurements/${measurementId}`, { headers });
    if (item.response.status === 200) return item.body;
    assert.equal(item.response.status, 409);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("platform HTTP result did not become ready");
}

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "geocheck-platform-http-"));
  const database = path.join(temp, "platform.db");
  const port = await availablePort();
  const adminToken = "admin-platform-test-token-1234567890";
  const child = spawn(process.execPath, ["services/api/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      LEGACY_HOST: "unused.invalid",
      ADMIN_TOKEN: adminToken,
      DEVELOPER_API_PLATFORM_ENABLED: "true",
      DEVELOPER_API_PROTOTYPE_ENABLED: "false",
      DEVELOPER_API_MODE: "fixture",
      DEVELOPER_API_LOCAL_DB_PATH: database,
      DEVELOPER_API_TOKEN_PEPPER: "http-test-platform-token-pepper-32-bytes-minimum",
      DEVELOPER_API_QUOTA_WINDOW_STRATEGY: "rolling_24h",
      DEVELOPER_API_RESULT_RETENTION_DAYS: "30"
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
    const privateHeaders = (token, extra = {}) => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extra
    });
    const adminHeaders = { "X-Admin-Token": adminToken, "Content-Type": "application/json" };

    const unauthorizedAdmin = await jsonRequest(`${base}/v1/admin/overview`);
    assert.equal(unauthorizedAdmin.response.status, 401);

    const invited = await jsonRequest(`${base}/v1/admin/invitations`, {
      method: "POST", headers: adminHeaders, body: JSON.stringify({ email: "http-owner@example.com" })
    });
    assert.equal(invited.response.status, 201);
    assert.match(invited.body.verification_token, /^gci_/);
    assert.equal(invited.response.headers.get("cache-control"), "no-store");
    assert.equal(invited.response.headers.get("access-control-allow-origin"), null);

    const verified = await jsonRequest(`${base}/v1/auth/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: invited.body.verification_token })
    });
    assert.equal(verified.response.status, 200);
    const session = verified.body.session_token;

    const paidActivation = await jsonRequest(`${base}/v1/console/activation`, {
      method: "POST", headers: privateHeaders(session), body: JSON.stringify({ plan: "basic" })
    });
    assert.equal(paidActivation.response.status, 402, "paid access cannot be granted before payment exists");

    const activation = await jsonRequest(`${base}/v1/console/activation`, {
      method: "POST", headers: privateHeaders(session), body: JSON.stringify({ plan: "free" })
    });
    assert.equal(activation.response.status, 200);
    assert.equal(activation.body.remaining_rounds, 3);

    const createdKey = await jsonRequest(`${base}/v1/console/api-keys`, {
      method: "POST", headers: privateHeaders(session), body: JSON.stringify({ name: "HTTP key" })
    });
    assert.equal(createdKey.response.status, 201);
    const apiKey = createdKey.body.api_key;
    assert.match(apiKey, /^gck_/);

    const listedKeys = await jsonRequest(`${base}/v1/console/api-keys`, { headers: privateHeaders(session) });
    assert.equal(listedKeys.response.status, 200);
    assert.equal(Object.hasOwn(listedKeys.body.data[0], "api_key"), false);

    const created = await jsonRequest(`${base}/v1/measurements`, {
      method: "POST",
      headers: privateHeaders(apiKey, { "Idempotency-Key": "http-platform-measurement" }),
      body: JSON.stringify({ input: { type: "prompt", text: "政府公開資料要去哪裡查？" }, locale: "zh-TW" })
    });
    assert.equal(created.response.status, 202);
    const result = await waitForResult(base, privateHeaders(apiKey), created.body.measurement_id);
    assert.equal(result.status, "succeeded");
    assert.equal(result.engines.length, 4);
    assert.equal(Object.hasOwn(result, "tenant_id"), false);
    assert(result.engines.every((engine) => !Object.hasOwn(engine, "cost")));

    const consoleJobs = await jsonRequest(`${base}/v1/console/jobs`, { headers: privateHeaders(session) });
    assert.equal(consoleJobs.response.status, 200);
    assert.equal(consoleJobs.body.data.length, 1);

    const overview = await jsonRequest(`${base}/v1/admin/overview`, { headers: adminHeaders });
    assert.equal(overview.response.status, 200);
    assert.equal(overview.body.jobs.succeeded, 1);
    assert.equal(Object.hasOwn(overview.body, "emails"), false);

    const paused = await jsonRequest(`${base}/v1/admin/admission`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ enabled: false, reason: "HTTP security drill" })
    });
    assert.equal(paused.response.status, 200);
    assert.equal(paused.body.enabled, false);

    const blocked = await jsonRequest(`${base}/v1/measurements`, {
      method: "POST", headers: privateHeaders(apiKey, { "Idempotency-Key": "paused-http-request" }),
      body: JSON.stringify({ input: { type: "prompt", text: "must not start" } })
    });
    assert.equal(blocked.response.status, 503);

    const deleted = await jsonRequest(`${base}/v1/measurements/${created.body.measurement_id}`, {
      method: "DELETE", headers: privateHeaders(apiKey)
    });
    assert.equal(deleted.response.status, 204);
    const afterDelete = await jsonRequest(`${base}/v1/measurements/${created.body.measurement_id}`, {
      headers: privateHeaders(apiKey)
    });
    assert.equal(afterDelete.response.status, 410);

    const revoked = await jsonRequest(`${base}/v1/console/api-keys/${createdKey.body.key_id}`, {
      method: "DELETE", headers: privateHeaders(session)
    });
    assert.equal(revoked.response.status, 204);
    const revokedUsage = await jsonRequest(`${base}/v1/usage`, { headers: privateHeaders(apiKey) });
    assert.equal(revokedUsage.response.status, 401);

    const loginRequest = await jsonRequest(`${base}/v1/auth/login-links`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "http-owner@example.com" })
    });
    assert.equal(loginRequest.response.status, 202);
    assert.equal(Object.hasOwn(loginRequest.body, "login_token"), false);
    const outbox = await jsonRequest(`${base}/v1/admin/outbox`, { headers: adminHeaders });
    assert.equal(outbox.response.status, 200);
    assert.match(outbox.body.data[0].login_token, /^gcl_/);

    console.log("developer platform HTTP tests passed");
  } finally {
    const stopped = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    if (child.exitCode === null) await stopped;
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
