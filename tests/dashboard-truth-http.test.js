const assert = require("node:assert/strict");
const { createDashboardApiHttpHandler } = require("../services/api/dashboard-api-http.js");
const { createSqliteDashboardStore } = require("../services/api/storage/dashboard-store.js");
const { createTruthSourceFetcher } = require("../services/api/application/dashboard-truth-source-fetcher.js");

const config = {
  DASHBOARD_API_ENABLED: "true",
  DASHBOARD_TOKEN_PEPPER: "dashboard-truth-http-test-pepper-with-at-least-thirty-two-bytes",
  DASHBOARD_ADMIN_TOKEN: "dashboard-truth-admin-test-token-at-least-twenty-bytes",
  DASHBOARD_TRUTH_ENABLED: "true",
  DASHBOARD_TRUTH_ALLOWLIST: "truth-http@example.com",
  DASHBOARD_DATABASE_PATH: ":memory:"
};

const sourceFetcher = createTruthSourceFetcher({
  fetch: async () => new Response("<html><head><title>HTTP 餐廳</title></head><body>電話 02-1234-5678<br>週一 11:00-21:00</body></html>", {
    status: 200, headers: { "content-type": "text/html" }
  })
});

async function invoke(handler, { method, pathname, body, token }) {
  let captured;
  const req = { method, headers: token ? { authorization: `Bearer ${token}` } : {} };
  const handled = await handler.handle({
    req, res: {}, url: new URL(`https://dashboard.example${pathname}`),
    readJson: async () => body || {},
    sendJson: (_res, status, data, headers) => { captured = { status, data, headers }; }
  });
  return { handled, ...captured };
}

async function main() {
  const sharedStore = createSqliteDashboardStore();
  const handler = createDashboardApiHttpHandler({ config, store: sharedStore, sourceFetcher });
  const invitation = await handler.handle({
    req: { method: "POST", headers: { "x-dashboard-admin-token": config.DASHBOARD_ADMIN_TOKEN } }, res: {},
    url: new URL("https://dashboard.example/app-api/v1/admin/invitations"), readJson: async () => ({ email: "truth-http@example.com" }),
    sendJson: (_res, status, data) => { handler._invitation = { status, data }; }
  });
  assert.equal(invitation, true);
  const verified = await invoke(handler, { method: "POST", pathname: "/app-api/v1/auth/verify", body: { token: handler._invitation.data.invitation_token } });
  const token = verified.data.session_token;
  const project = await invoke(handler, { method: "POST", pathname: "/app-api/v1/projects", token, body: { name: "HTTP truth", site_url: "https://brand.example", timezone: "Asia/Taipei" } });
  const projectId = project.data.projectId;

  const noBaseline = await invoke(handler, { method: "POST", pathname: `/app-api/v1/projects/${projectId}/truth/checks`, token, body: { engine_ids: ["openai"] } });
  assert.equal(noBaseline.status, 409);
  assert.equal(noBaseline.data.error.code, "truth_baseline_required");

  const sources = await invoke(handler, {
    method: "POST", pathname: `/app-api/v1/projects/${projectId}/truth/sources`, token,
    body: { sources: [{ kind: "website", url: "https://brand.example/" }] }
  });
  assert.equal(sources.status, 200);
  assert.equal(sources.data.data[0].status, "succeeded");
  const readiness = await invoke(handler, { method: "GET", pathname: `/app-api/v1/projects/${projectId}/truth/readiness`, token });
  assert.deepEqual(readiness.data, { truth_readiness: "baseline_pending" });

  const baseline = await invoke(handler, {
    method: "POST", pathname: `/app-api/v1/projects/${projectId}/truth/baseline/confirm`, token,
    body: { fields: { phone: { value: "02-1234-5678" } }, source_ids: [sources.data.data[0].source_id] }
  });
  assert.equal(baseline.status, 201);
  assert.equal(baseline.data.version, 1);
  const ready = await invoke(handler, { method: "GET", pathname: `/app-api/v1/projects/${projectId}/truth/readiness`, token });
  assert.deepEqual(ready.data, { truth_readiness: "ready" });

  const check = await invoke(handler, { method: "POST", pathname: `/app-api/v1/projects/${projectId}/truth/checks`, token, body: { engine_ids: ["openai", "perplexity"] } });
  assert.equal(check.status, 202);
  assert.deepEqual(check.data.engine_ids, ["openai", "perplexity"]);
  const fetched = await invoke(handler, { method: "GET", pathname: `/app-api/v1/projects/${projectId}/truth/checks/${check.data.check_id}`, token });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.data.status, "queued");

  const unauthenticated = await invoke(handler, { method: "GET", pathname: `/app-api/v1/projects/${projectId}/truth/sources` });
  assert.equal(unauthenticated.status, 401);
  for (const developerToken of ["gcs_developer_console_session", "gck_developer_api_key"]) {
    const denied = await invoke(handler, { method: "GET", pathname: `/app-api/v1/projects/${projectId}/truth/sources`, token: developerToken });
    assert.equal(denied.status, 401);
  }
  const closed = createDashboardApiHttpHandler({ config: { ...config, DASHBOARD_TRUTH_ENABLED: "false" }, store: sharedStore, sourceFetcher });
  // A production-like config keeps the feature closed even for an authenticated
  // Dashboard session; only an explicit smoke flag enables the routes.
  const closedResponse = await invoke(closed, { method: "GET", pathname: `/app-api/v1/projects/${projectId}/truth/sources`, token });
  assert.equal(closedResponse.status, 503);
  assert.equal(closedResponse.data.error.code, "truth_not_enabled");
  sharedStore.close();
  console.log("dashboard truth HTTP tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
