// Search Console connection for a Product A Project, end to end on D1.
//
// This is the path a Project owner walks: authorize, pick a property, then read
// the imported metrics. Google is stubbed; everything else — the durable pending
// record, the encryption, the domain matching, the store — is real, and the
// pending store is the same module the Worker mounts rather than a copy.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const { createBoundD1DashboardStore } = require("../services/api/storage/dashboard-d1-store.js");
const { createD1GscPendingStore } = require("../services/api/storage/dashboard-gsc-pending-store.js");
const { createDashboardService } = require("../services/api/application/dashboard-service.js");
const { createGoogleOAuthHttpHandler } = require("../services/api/google-oauth-http.js");
const { createDashboardApiHttpHandler } = require("../services/api/dashboard-api-http.js");

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "services/cloudflare/dashboard/migrations");
const ORIGIN = "https://geocheck.lisheng.cv";
const KEY = crypto.randomBytes(32).toString("base64");
const CONFIG = {
  DASHBOARD_API_ENABLED: "true",
  DASHBOARD_DATABASE_PATH: "",
  DASHBOARD_TOKEN_PEPPER: "dashboard-gsc-test-pepper-with-at-least-thirty-two-bytes",
  DASHBOARD_ADMIN_TOKEN: "dashboard-admin-test-token-at-least-twenty-bytes",
  DASHBOARD_GOOGLE_OAUTH_STATE_KEY: "dashboard-oauth-state-key-at-least-thirty-two-bytes",
  GOOGLE_OAUTH_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "test-client-secret",
  GSC_TOKEN_ENCRYPTION_KEY: KEY,
  DASHBOARD_ORIGIN: ORIGIN
};

function createD1() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync(MIGRATIONS).sort()) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  db.exec("PRAGMA foreign_keys = ON;");
  const run = (sql, params) => {
    const results = db.prepare(sql).all(...params);
    return { success: true, results, meta: { changes: Number(db.prepare("SELECT changes() AS c").get().c) } };
  };
  return {
    db,
    binding: {
      prepare(sql) {
        return {
          bind: (...params) => ({
            all: async () => run(sql, params),
            first: async () => run(sql, params).results[0] || null,
            run: async () => run(sql, params),
            __run: () => run(sql, params)
          })
        };
      },
      batch: async (statements) => {
        db.exec("BEGIN");
        try {
          const out = statements.map((statement) => statement.__run());
          db.exec("COMMIT");
          return out;
        } catch (error) {
          try { db.exec("ROLLBACK"); } catch {}
          throw error;
        }
      }
    }
  };
}

function invoke(handler, { method = "GET", pathname, search = "", headers = {}, body = {} }) {
  let captured;
  const res = {
    writeHead(status, responseHeaders = {}) { captured = { status, headers: responseHeaders }; },
    end(payload = "") { captured = { ...captured, body: payload }; }
  };
  return handler.handle({
    req: { method, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) },
    res,
    url: new URL(`${ORIGIN}${pathname}${search}`),
    readJson: async () => body,
    sendJson: (_res, status, data, responseHeaders) => { captured = { status, data, headers: responseHeaders }; }
  }).then((handled) => ({ handled, ...captured }));
}

const PROPERTIES = [
  "sc-domain:brand.example",
  "https://other.example/",
  "sc-domain:notbrand.example"
];

function googleFetch(calls) {
  return async (url, init) => {
    calls.push(String(url));
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return { ok: true, json: async () => ({ access_token: "google-access", refresh_token: "google-refresh" }) };
    }
    if (String(url).includes("openidconnect")) {
      return { ok: true, json: async () => ({ email: "owner@example.com", email_verified: true }) };
    }
    if (String(url).endsWith("/webmasters/v3/sites")) {
      return { ok: true, json: async () => ({ siteEntry: PROPERTIES.map((siteUrl) => ({ siteUrl })) }) };
    }
    return {
      ok: true,
      json: async () => ({ rows: [{ keys: ["2026-09-01"], clicks: 5, impressions: 40, ctr: 0.125, position: 6.2 }] })
    };
  };
}

async function main() {
  const { db, binding } = createD1();
  const store = createBoundD1DashboardStore({ db: binding });
  const pendingStore = createD1GscPendingStore({ db: binding, encryptionKey: KEY });
  assert.throws(() => createD1GscPendingStore({ db: {}, encryptionKey: KEY }), /D1 binding/);

  const calls = [];
  const fetchImpl = googleFetch(calls);
  const { createGoogleSearchConsoleClient } = require("../services/api/google-search-console-client.js");
  const gscClient = createGoogleSearchConsoleClient({
    clientId: CONFIG.GOOGLE_OAUTH_CLIENT_ID, clientSecret: CONFIG.GOOGLE_OAUTH_CLIENT_SECRET, fetchImpl
  });
  const service = createDashboardService({
    store, tokenPepper: CONFIG.DASHBOARD_TOKEN_PEPPER, googleTokenKey: KEY, gscClient
  });
  const dashboardApi = createDashboardApiHttpHandler({ config: CONFIG, store, api: service });
  const oauth = createGoogleOAuthHttpHandler({
    config: CONFIG, dashboardApi, gscClient, pendingStore, fetchImpl,
    stateStore: {
      records: new Map(),
      async put(record) { this.records.set(record.id, record); },
      async consume({ id, audience, nonce, now }) {
        const record = this.records.get(id);
        if (!record || record.audience !== audience || record.nonce !== nonce || record.expiresAt < now) return null;
        this.records.delete(id);
        return record;
      }
    }
  });

  // ---- a Project owner starts the authorization ----
  const invitation = await service.createInvitation({ email: "owner@example.com" });
  const session = await service.verifyInvitation({ token: invitation.invitation_token });
  const project = await service.createProject({
    sessionToken: session.session_token, name: "Brand", siteUrl: "https://brand.example", timezone: "Asia/Taipei"
  });

  const authorize = await invoke(oauth, {
    method: "POST", pathname: "/app-api/v1/projects/google/gsc/authorize",
    search: `?project_id=${encodeURIComponent(project.projectId)}`,
    headers: { authorization: `Bearer ${session.session_token}` }
  });
  assert.equal(authorize.status, 200, "Authorization must hand back a Google URL for the owner to follow");
  const authUrl = new URL(authorize.data.authorize_url);
  assert.match(
    authUrl.searchParams.get("scope"), /webmasters\.readonly/,
    "Connecting Search Console must request the read-only Search Console scope"
  );
  assert.equal(authUrl.searchParams.get("access_type"), "offline", "A refresh token requires offline access");
  assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    authUrl.searchParams.get("redirect_uri"),
    `${ORIGIN}/app-api/v1/auth/google/gsc/callback`,
    "The GSC callback must be registered in Google Cloud exactly as sent"
  );

  const cookie = String(authorize.headers["Set-Cookie"]);
  const nonce = cookie.slice(cookie.indexOf("=") + 1, cookie.indexOf(";"));
  const state = authUrl.searchParams.get("state");

  // ---- Google returns, and only matching properties are offered ----
  const callback = await invoke(oauth, {
    pathname: "/app-api/v1/auth/google/gsc/callback",
    search: `?code=google-code&state=${encodeURIComponent(state)}`,
    headers: { cookie: `gc_oauth_gsc=${nonce}` }
  });
  assert.equal(callback.status, 200, `callback failed: ${JSON.stringify(callback.data || callback.body)}`);
  assert.match(callback.body, /sc-domain:brand\.example/, "The Project's own property must be offered");
  assert.doesNotMatch(
    callback.body, /notbrand\.example|other\.example/,
    "Only properties that match the Project domain may be offered"
  );

  // The refresh token survived the isolate boundary, and never in clear text.
  const pendingRow = db.prepare("SELECT * FROM dashboard_gsc_pending_connections").get();
  assert.ok(pendingRow, "The pending choice must persist, not live in memory");
  assert.doesNotMatch(
    JSON.stringify(pendingRow), /google-refresh/,
    "A pending Google refresh token must never be readable in the database"
  );
  assert.ok(pendingRow.expires_at > Date.now(), "A pending choice must expire");

  const pendingId = callback.body.match(/name="pending_id" value="([^"]+)"/)?.[1]
    || callback.body.match(/pending_id["'\s:=]+([A-Za-z0-9_-]{16,})/)?.[1];
  assert.ok(pendingId, "The selection page must carry the pending id");
  assert.deepEqual(
    (await pendingStore.get(pendingId)).properties, ["sc-domain:brand.example"],
    "The stored record must decrypt back to what was written"
  );

  // ---- another account cannot claim someone else's pending connection ----
  const intruderInvitation = await service.createInvitation({ email: "intruder@example.com" });
  const intruder = await service.verifyInvitation({ token: intruderInvitation.invitation_token });
  const stolen = await invoke(oauth, {
    method: "POST", pathname: "/app-api/v1/projects/google/gsc/select",
    headers: { authorization: `Bearer ${intruder.session_token}` },
    body: { pending_id: pendingId, property_uri: "sc-domain:brand.example" }
  });
  assert.equal(stolen.status, 400, "A pending connection belongs to the session that started it");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM dashboard_google_connections").get().c, 0,
    "A refused selection must not connect anything"
  );

  // ---- the owner picks the property, and the connection is stored encrypted ----
  const selected = await invoke(oauth, {
    method: "POST", pathname: "/app-api/v1/projects/google/gsc/select",
    headers: { authorization: `Bearer ${session.session_token}` },
    body: { pending_id: pendingId, property_uri: "sc-domain:brand.example" }
  });
  assert.equal(selected.status, 201);
  const connection = db.prepare("SELECT * FROM dashboard_google_connections").get();
  assert.equal(connection.property_uri, "sc-domain:brand.example");
  assert.doesNotMatch(
    JSON.stringify(connection), /google-refresh/,
    "A stored Google refresh token must never be readable in the database"
  );
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS c FROM dashboard_gsc_pending_connections").get().c), 0,
    "The pending record must be consumed, not left behind"
  );

  // ---- the same pending id cannot be replayed ----
  const replay = await invoke(oauth, {
    method: "POST", pathname: "/app-api/v1/projects/google/gsc/select",
    headers: { authorization: `Bearer ${session.session_token}` },
    body: { pending_id: pendingId, property_uri: "sc-domain:brand.example" }
  });
  assert.equal(replay.status, 400);

  // ---- metrics import, then read back through the Dashboard API ----
  const synced = await service.syncGoogleSearchConsole({
    sessionToken: session.session_token, projectId: project.projectId,
    from: "2026-09-01", to: "2026-09-02"
  });
  assert.ok(synced, "A connected Project must be able to import metrics");
  const summary = await invoke(dashboardApi, {
    pathname: `/app-api/v1/projects/${project.projectId}/gsc`,
    search: "?from=2026-09-01&to=2026-09-30",
    headers: { authorization: `Bearer ${session.session_token}` }
  });
  assert.equal(summary.status, 200);
  assert.equal(summary.data.data[0].clicks, 5);
  assert.equal(summary.data.data[0].impressions, 40);

  console.log("dashboard Search Console connect tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
