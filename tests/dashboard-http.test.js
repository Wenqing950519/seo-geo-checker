const assert = require("node:assert/strict");
const { createDashboardApiHttpHandler } = require("../services/api/dashboard-api-http.js");
const { createSqliteDashboardStore } = require("../services/api/storage/dashboard-store.js");

const config = {
  DASHBOARD_API_ENABLED: "true",
  DASHBOARD_TOKEN_PEPPER: "dashboard-http-test-pepper-with-at-least-thirty-two-bytes",
  DASHBOARD_ADMIN_TOKEN: "dashboard-admin-test-token-at-least-twenty-bytes",
  DASHBOARD_DATABASE_PATH: ":memory:"
};

async function invoke(handler, { method, pathname, body, headers = {} }) {
  let captured;
  const req = { method, headers: Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])) };
  const res = {};
  const handled = await handler.handle({
    req,
    res,
    url: new URL(`https://dashboard.example${pathname}`),
    readJson: async () => body || {},
    sendJson: (_res, status, data, responseHeaders) => { captured = { status, data, headers: responseHeaders }; }
  });
  return { handled, ...captured };
}

async function main() {
  const handler = createDashboardApiHttpHandler({ config, createSqliteDashboardStore });
  const invitation = await invoke(handler, {
    method: "POST", pathname: "/app-api/v1/admin/invitations",
    headers: { "X-Dashboard-Admin-Token": config.DASHBOARD_ADMIN_TOKEN }, body: { email: "dashboard@example.com" }
  });
  assert.equal(invitation.status, 201);
  assert.equal(invitation.headers["Access-Control-Allow-Origin"], null);
  assert.equal(invitation.headers["Cache-Control"], "no-store");

  const verified = await invoke(handler, {
    method: "POST", pathname: "/app-api/v1/auth/verify", body: { token: invitation.data.invitation_token }
  });
  assert.equal(verified.status, 200);
  const dashboardSession = verified.data.session_token;
  assert.match(dashboardSession, /^gds_/);

  const project = await invoke(handler, {
    method: "POST", pathname: "/app-api/v1/projects",
    headers: { Authorization: `Bearer ${dashboardSession}` },
    body: { name: "HTTP project", site_url: "https://brand.example", timezone: "Asia/Taipei" }
  });
  assert.equal(project.status, 201);
  assert.equal(Object.hasOwn(project.data, "api_key"), false);
  assert.equal(JSON.stringify(project.data).includes("tenant"), false);

  for (const token of ["gcs_developer_console_session", "gck_developer_api_key"]) {
    const denied = await invoke(handler, {
      method: "GET", pathname: "/app-api/v1/projects", headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(denied.status, 401, "Developer credentials must not access Dashboard routes");
  }
  const notOwned = await invoke(handler, {
    method: "GET", pathname: "/v1/console/api-keys", headers: { Authorization: `Bearer ${dashboardSession}` }
  });
  assert.equal(notOwned.handled, false, "Dashboard handler must not own Developer Console routes");
  const unknownWrite = await invoke(handler, {
    method: "POST", pathname: `/app-api/v1/projects/${encodeURIComponent(project.data.projectId)}/runs`,
    headers: { Authorization: `Bearer ${dashboardSession}` }, body: {}
  });
  assert.equal(unknownWrite.status, 404, "Browser clients cannot submit raw Tracking Run evidence");
  console.log("dashboard HTTP tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
