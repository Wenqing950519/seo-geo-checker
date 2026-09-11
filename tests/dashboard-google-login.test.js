// Product A Dashboard Google sign-in, driven against the D1-backed store.
//
// It exercises the same handler the Worker mounts, with the same D1 OAuth state
// store shape, so the parts that only exist in the Worker today (PKCE state in
// D1 rather than memory) are covered before deployment.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const { createGoogleOAuthHttpHandler } = require("../services/api/google-oauth-http.js");
const { createDashboardApiHttpHandler } = require("../services/api/dashboard-api-http.js");
const { createBoundD1DashboardStore } = require("../services/api/storage/dashboard-d1-store.js");

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "services/cloudflare/dashboard/migrations");
const ORIGIN = "https://geocheck.lisheng.cv";
const CONFIG = {
  DASHBOARD_API_ENABLED: "true",
  DASHBOARD_DATABASE_PATH: "",
  DASHBOARD_TOKEN_PEPPER: "dashboard-login-test-pepper-with-at-least-thirty-two-bytes",
  DASHBOARD_ADMIN_TOKEN: "dashboard-admin-test-token-at-least-twenty-bytes",
  DASHBOARD_GOOGLE_OAUTH_STATE_KEY: "dashboard-oauth-state-key-at-least-thirty-two-bytes",
  GOOGLE_OAUTH_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "test-client-secret",
  DASHBOARD_ORIGIN: ORIGIN
};

function createD1Emulator() {
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

// Mirrors services/cloudflare/dashboard/src/worker.js.
function createD1OAuthStateStore(db) {
  return {
    async put(record) {
      await db.batch([
        db.prepare("DELETE FROM dashboard_google_oauth_states WHERE expires_at <= ?").bind(Date.now()),
        db.prepare(`INSERT INTO dashboard_google_oauth_states (
          state_id, audience, verifier, nonce, session_token, project_id, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(record.id, record.audience, record.verifier, record.nonce,
            record.sessionToken || null, record.projectId || null, record.expiresAt, Date.now())
      ]);
    },
    async consume({ id, audience, nonce, now }) {
      return db.prepare(`DELETE FROM dashboard_google_oauth_states
        WHERE state_id = ? AND audience = ? AND nonce = ? AND expires_at > ?
        RETURNING state_id AS id, audience, verifier, nonce,
                  session_token AS sessionToken, project_id AS projectId,
                  expires_at AS expiresAt`)
        .bind(id, audience, nonce, now).first();
    }
  };
}

function invoke(handler, { method = "GET", pathname, search = "", headers = {} }) {
  let captured;
  const res = {
    writeHead(status, responseHeaders = {}) { captured = { status, headers: responseHeaders }; },
    end(body = "") { captured = { ...captured, body }; }
  };
  return handler.handle({
    req: { method, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) },
    res,
    url: new URL(`${ORIGIN}${pathname}${search}`),
    sendJson: (_res, status, data, responseHeaders) => { captured = { status, data, headers: responseHeaders }; }
  }).then((handled) => ({ handled, ...captured }));
}

async function main() {
  const { db, binding } = createD1Emulator();
  const store = createBoundD1DashboardStore({ db: binding });
  const dashboardApi = createDashboardApiHttpHandler({ config: CONFIG, store });

  // Only an invited, verified account may sign in with Google.
  const invitation = await dashboardApi.workerApi.createInvitation({ email: "owner@example.com" });
  await dashboardApi.workerApi.verifyInvitation({ token: invitation.invitation_token });

  const googleCalls = [];
  const fetchImpl = async (url, options) => {
    googleCalls.push({ url, options });
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return { ok: true, json: async () => ({ access_token: "google-access-token" }) };
    }
    return { ok: true, json: async () => ({ email: "owner@example.com", email_verified: true }) };
  };
  const oauth = createGoogleOAuthHttpHandler({
    config: CONFIG, dashboardApi, stateStore: createD1OAuthStateStore(binding), fetchImpl
  });

  // ---- start: redirects to Google with PKCE, and persists state in D1 ----
  const start = await invoke(oauth, { pathname: "/app-api/v1/auth/google/start" });
  assert.equal(start.status, 302);
  const location = new URL(start.headers.Location);
  assert.equal(location.origin + location.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(location.searchParams.get("client_id"), CONFIG.GOOGLE_OAUTH_CLIENT_ID);
  assert.equal(
    location.searchParams.get("redirect_uri"),
    `${ORIGIN}/app-api/v1/auth/google/callback`,
    "The Dashboard callback must be registered in Google Cloud exactly as sent"
  );
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.ok(location.searchParams.get("code_challenge"), "PKCE challenge is required");
  assert.doesNotMatch(
    start.headers.Location, /webmasters/,
    "Plain sign-in must not request Search Console scope"
  );

  const stateRow = db.prepare("SELECT * FROM dashboard_google_oauth_states").get();
  assert.equal(stateRow.audience, "dashboard");
  assert.equal(stateRow.session_token, null);
  assert.ok(stateRow.expires_at > Date.now(), "State must carry a future expiry");

  const cookie = String(start.headers["Set-Cookie"]);
  const nonce = cookie.slice(cookie.indexOf("=") + 1, cookie.indexOf(";"));
  const state = location.searchParams.get("state");

  // ---- callback: exchanges the code and hands back a Dashboard session ----
  const callback = await invoke(oauth, {
    pathname: "/app-api/v1/auth/google/callback",
    search: `?code=google-auth-code&state=${encodeURIComponent(state)}`,
    headers: { cookie: `gc_oauth_dashboard=${nonce}` }
  });
  assert.equal(callback.status, 200);
  assert.match(callback.body, /gc_dashboard_session/, "The browser must receive a Dashboard session");
  assert.match(callback.body, /gds_/, "The session must be a Dashboard session, never a Developer one");
  assert.doesNotMatch(callback.body, /gcs_|gck_/, "Developer credentials must never reach the Dashboard");
  assert.match(callback.body, /location\.replace\("\/app\/"\)/, "Sign-in must land on the Dashboard");
  assert.equal(
    googleCalls[0].options.body.get("code_verifier").length > 0, true,
    "The token exchange must send the PKCE verifier"
  );

  const sessionToken = callback.body.match(/"(gds_[^"]+)"/)[1];
  assert.ok(await dashboardApi.workerApi.authenticateSession(sessionToken), "The issued session must authenticate");

  // ---- the state is single use, so a replayed callback is refused ----
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS c FROM dashboard_google_oauth_states").get().c), 0,
    "A consumed OAuth state must be deleted"
  );
  const replay = await invoke(oauth, {
    pathname: "/app-api/v1/auth/google/callback",
    search: `?code=google-auth-code&state=${encodeURIComponent(state)}`,
    headers: { cookie: `gc_oauth_dashboard=${nonce}` }
  });
  assert.equal(replay.status, 400);
  assert.equal(replay.data.error.code, "oauth_state_invalid");

  // ---- a callback without the browser's nonce cookie is refused ----
  const noCookie = await invoke(oauth, {
    pathname: "/app-api/v1/auth/google/callback",
    search: `?code=google-auth-code&state=${encodeURIComponent(state)}`
  });
  assert.equal(noCookie.status, 400);

  // ---- an uninvited Google account cannot create an account by signing in ----
  const strangerOauth = createGoogleOAuthHttpHandler({
    config: CONFIG, dashboardApi, stateStore: createD1OAuthStateStore(binding),
    fetchImpl: async (url) => String(url).includes("oauth2.googleapis.com/token")
      ? { ok: true, json: async () => ({ access_token: "token" }) }
      : { ok: true, json: async () => ({ email: "stranger@example.com", email_verified: true }) }
  });
  const strangerStart = await invoke(strangerOauth, { pathname: "/app-api/v1/auth/google/start" });
  const strangerCookie = String(strangerStart.headers["Set-Cookie"]);
  const strangerNonce = strangerCookie.slice(strangerCookie.indexOf("=") + 1, strangerCookie.indexOf(";"));
  const strangerState = new URL(strangerStart.headers.Location).searchParams.get("state");
  const denied = await invoke(strangerOauth, {
    pathname: "/app-api/v1/auth/google/callback",
    search: `?code=code&state=${encodeURIComponent(strangerState)}`,
    headers: { cookie: `gc_oauth_dashboard=${strangerNonce}` }
  });
  assert.equal(denied.status, 403, "Dashboard access stays invitation-only");
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS c FROM dashboard_accounts").get().c), 1,
    "Google sign-in must not create an account"
  );

  // ---- Search Console stays feature-gated without a GSC client ----
  const gsc = await invoke(oauth, { method: "POST", pathname: "/app-api/v1/projects/google/gsc/authorize" });
  assert.equal(gsc.status, 503);

  console.log("dashboard Google login tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
