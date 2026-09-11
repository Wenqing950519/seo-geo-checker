const assert = require("node:assert/strict");
const { createGoogleOAuthHttpHandler } = require("../services/api/google-oauth-http.js");

const config = {
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  DASHBOARD_GOOGLE_OAUTH_STATE_KEY: "d".repeat(32),
  DEVELOPER_GOOGLE_OAUTH_STATE_KEY: "v".repeat(32),
  DASHBOARD_ORIGIN: "https://app.lslabs.tw",
  DEVELOPER_API_ORIGIN: "https://platform.lslabs.tw"
};
const dashboardApi = { workerApi: { loginGoogleAccount: async () => ({ session_token: "gds_dashboard" }) } };
const developerApi = { workerApi: { loginGoogleAccount: async () => ({ session_token: "gcs_developer" }) } };
function sharedStateStore() {
  const records = new Map();
  return {
    async put(record) { records.set(record.id, record); },
    async consume({ id, audience, nonce, now }) {
      const record = records.get(id);
      if (!record || record.audience !== audience || record.nonce !== nonce || record.expiresAt < now) return null;
      records.delete(id);
      return record;
    }
  };
}
const persistentStates = sharedStateStore();
const handler = createGoogleOAuthHttpHandler({
  config, dashboardApi, developerApi, stateStore: persistentStates,
  fetchImpl: async (url) => ({ ok: true, json: async () => url.includes("userinfo")
    ? { email: "member@example.com", email_verified: true } : { access_token: "google-access" } })
});

function response() {
  return { headers: {}, body: "", writeHead(status, headers) { this.status = status; this.headers = headers || {}; }, end(body = "") { this.body = body; } };
}
async function invoke(path, cookie = "") {
  const res = response();
  const handled = await handler.handle({ req: { method: "GET", headers: { cookie } }, res, url: new URL(`https://local.test${path}`), sendJson: (target, status, body, headers) => { target.writeHead(status, headers); target.end(JSON.stringify(body)); } });
  assert.equal(handled, true);
  return res;
}
function callbackPath(start, code = "ok") {
  const redirect = new URL(start.headers.Location);
  return `${redirect.searchParams.get("redirect_uri").replace("https://app.lslabs.tw", "").replace("https://platform.lslabs.tw", "")}?code=${code}&state=${encodeURIComponent(redirect.searchParams.get("state"))}`;
}
function cookieFrom(start) { return start.headers["Set-Cookie"].split(";", 1)[0]; }

(async () => {
  const dashboardStart = await invoke("/app-api/v1/auth/google/start");
  const dashboardAuth = new URL(dashboardStart.headers.Location);
  assert.equal(dashboardAuth.searchParams.get("redirect_uri"), "https://app.lslabs.tw/app-api/v1/auth/google/callback");
  assert.equal(dashboardAuth.searchParams.get("code_challenge_method"), "S256");
  const dashboardCallback = await invoke(callbackPath(dashboardStart), cookieFrom(dashboardStart));
  assert.equal(dashboardCallback.status, 200);
  assert.match(dashboardCallback.body, /gc_dashboard_session/);
  assert.match(dashboardCallback.body, /gds_dashboard/);
  const dashboardReplay = await invoke(callbackPath(dashboardStart), cookieFrom(dashboardStart));
  assert.equal(dashboardReplay.status, 400);

  const developerStart = await invoke("/v1/auth/google/start");
  const developerAuth = new URL(developerStart.headers.Location);
  assert.equal(developerAuth.searchParams.get("redirect_uri"), "https://platform.lslabs.tw/v1/auth/google/callback");
  const crossedCallback = await invoke(`/v1/auth/google/callback?code=ok&state=${encodeURIComponent(dashboardAuth.searchParams.get("state"))}`, cookieFrom(developerStart));
  assert.equal(crossedCallback.status, 400);
  const developerCallback = await invoke(callbackPath(developerStart), cookieFrom(developerStart));
  assert.equal(developerCallback.status, 200);
  assert.match(developerCallback.body, /gc_developer_session/);
  assert.match(developerCallback.body, /gcs_developer/);

  const crossInstanceStart = await invoke("/v1/auth/google/start");
  const secondHandler = createGoogleOAuthHttpHandler({
    config, developerApi, stateStore: persistentStates,
    fetchImpl: async (url) => ({ ok: true, json: async () => url.includes("userinfo")
      ? { email: "member@example.com", email_verified: true } : { access_token: "google-access" } })
  });
  const crossInstanceResponse = response();
  await secondHandler.handle({ req: { method: "GET", headers: { cookie: cookieFrom(crossInstanceStart) } }, res: crossInstanceResponse,
    url: new URL(`https://local.test${callbackPath(crossInstanceStart)}`), sendJson: (target, status, body, headers) => { target.writeHead(status, headers); target.end(JSON.stringify(body)); } });
  assert.equal(crossInstanceResponse.status, 200);

  let selectedProperty = null;
  const gscApi = { workerApi: {
    loginGoogleAccount: async () => ({ session_token: "gds_dashboard" }),
    getGscSummary: async () => ({}), authenticateSession: async () => ({ email: "member@example.com" }),
    getOverview: async () => ({ project: { siteUrl: "https://www.example.com" } }),
    connectGoogleSearchConsole: async ({ propertyUri }) => { selectedProperty = propertyUri; return { property_uri: propertyUri }; }
  } };
  const gscHandler = createGoogleOAuthHttpHandler({ config, dashboardApi: gscApi,
    gscClient: { listProperties: async () => [{ siteUrl: "sc-domain:example.com" }, { siteUrl: "https://unrelated.example" }] },
    fetchImpl: async (url) => ({ ok: true, json: async () => url.includes("userinfo")
      ? { email: "member@example.com", email_verified: true } : { access_token: "google-access", refresh_token: "refresh-token" } })
  });
  const gscStart = response();
  await gscHandler.handle({ req: { method: "POST", headers: { authorization: "Bearer gds_dashboard" } }, res: gscStart,
    url: new URL("https://local.test/app-api/v1/projects/google/gsc/authorize?project_id=project_1"), sendJson: (target, status, body, headers) => { target.writeHead(status, headers); target.end(JSON.stringify(body)); } });
  const gscAuthorize = JSON.parse(gscStart.body); const gscRedirect = new URL(gscAuthorize.authorize_url);
  const gscCallback = response();
  await gscHandler.handle({ req: { method: "GET", headers: { cookie: cookieFrom(gscStart) } }, res: gscCallback,
    url: new URL(`https://local.test/app-api/v1/auth/google/gsc/callback?code=ok&state=${encodeURIComponent(gscRedirect.searchParams.get("state"))}`), sendJson: (target, status, body, headers) => { target.writeHead(status, headers); target.end(JSON.stringify(body)); } });
  assert.equal(gscCallback.status, 200);
  assert.match(gscCallback.body, /選擇此 Project 的 Search Console property/);
  assert.match(gscCallback.body, /sc-domain:example\.com/);
  const pendingId = gscCallback.body.match(/pending_id:("[^"]+")/)?.[1];
  assert.ok(pendingId);
  const gscSelect = response();
  await gscHandler.handle({ req: { method: "POST", headers: { authorization: "Bearer gds_dashboard" } }, res: gscSelect,
    url: new URL("https://local.test/app-api/v1/projects/google/gsc/select"), readJson: async () => ({ pending_id: JSON.parse(pendingId), property_uri: "sc-domain:example.com" }),
    sendJson: (target, status, body, headers) => { target.writeHead(status, headers); target.end(JSON.stringify(body)); } });
  assert.equal(gscSelect.status, 201);
  assert.equal(selectedProperty, "sc-domain:example.com");
  console.log("Google OAuth isolation tests passed");
})();
