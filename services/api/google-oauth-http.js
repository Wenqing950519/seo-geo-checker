const { createHash, createHmac, randomBytes } = require("node:crypto");

// One Google client, but each audience issues only its own GeoCheck session.
function createGoogleOAuthHttpHandler(options = {}) {
  const {
    config = process.env, dashboardApi, developerApi, gscClient,
    stateStore = createMemoryStateStore(), fetchImpl = fetch, now = () => Date.now()
  } = options;
  const clientId = String(config.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(config.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  const dashboardOrigin = String(config.DASHBOARD_ORIGIN || config.SITE_ORIGIN || "https://geocheck.lisheng.cv").replace(/\/+$/, "");
  const developerOrigin = String(config.DEVELOPER_API_ORIGIN || "https://api.geocheck.lisheng.cv").replace(/\/+$/, "");
  const routes = {
    dashboard: { start: "/app-api/v1/auth/google/start", callback: "/app-api/v1/auth/google/callback", origin: dashboardOrigin, redirect: "/app/", api: dashboardApi?.workerApi, storage: "gc_dashboard_session", scopes: ["openid", "email", "profile"] },
    developer: { start: "/v1/auth/google/start", callback: "/v1/auth/google/callback", origin: developerOrigin, redirect: "/developers/console", api: developerApi?.workerApi, storage: "gc_developer_session", scopes: ["openid", "email", "profile"] }
  };
  // A Worker serves the callback and the property choice in different isolates,
  // so this cannot be a Map in production. It is injected, and the in-memory
  // implementation is only the local-server default.
  const pendingGscConnections = options.pendingStore || createMemoryPendingStore();
  function enabled(audience) {
    if (!clientId || !clientSecret) return false;
    if (audience === "gsc") {
      return Boolean(gscClient && typeof routes.dashboard.api?.loginGoogleAccount === "function"
        && typeof routes.dashboard.api?.getGscSummary === "function"
        && typeof routes.dashboard.api?.connectGoogleSearchConsole === "function");
    }
    if (audience === "dashboard" || audience === "developer") {
      return typeof routes[audience].api?.loginGoogleAccount === "function";
    }
    return Boolean(typeof routes.dashboard.api?.loginGoogleAccount === "function"
      && typeof routes.developer.api?.loginGoogleAccount === "function");
  }
  async function handle({ req, res, url, sendJson, readJson }) {
    if (url.pathname === "/app-api/v1/projects/google/gsc/select" && req.method === "POST") {
      if (!enabled("gsc") || typeof readJson !== "function") return sendError(res, sendJson, 503, "google_oauth_not_configured", "Google OAuth is not configured");
      try {
        const body = await readJson(req, 8 * 1024); const pendingId = String(body.pending_id || ""); const propertyUri = String(body.property_uri || "");
        const pending = await pendingGscConnections.get(pendingId); const sessionToken = bearer(req);
        if (!pending || pending.expiresAt < now() || !timingSafe(sessionToken, pending.sessionToken) || !pending.properties.includes(propertyUri)) throw coded("gsc_selection_invalid");
        await pendingGscConnections.delete(pendingId);
        const connection = await routes.dashboard.api.connectGoogleSearchConsole({ sessionToken, projectId: pending.projectId, googleEmail: pending.googleEmail,
          propertyUri, refreshToken: pending.refreshToken, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] });
        sendJson(res, 201, { connection }, { "Access-Control-Allow-Origin": null, "Cache-Control": "no-store" }); return true;
      } catch (error) { return sendError(res, sendJson, 400, error.code || "gsc_selection_failed", "Search Console property could not be selected"); }
    }
    if (url.pathname === "/app-api/v1/projects/google/gsc/authorize" && req.method === "POST") {
      if (!enabled("gsc")) return sendError(res, sendJson, 503, "google_oauth_not_configured", "Google OAuth is not configured");
      const sessionToken = bearer(req); const projectId = String(url.searchParams.get("project_id") || "");
      try {
        await routes.dashboard.api.getGscSummary({ sessionToken, projectId, from: "2000-01-01", to: "2000-01-01" });
        const id = randomBytes(24).toString("base64url"); const verifier = randomBytes(48).toString("base64url"); const nonce = randomBytes(18).toString("base64url");
        await stateStore.put({ id, audience: "gsc", verifier, nonce, sessionToken, projectId, expiresAt: now() + 600000 });
        const state = signState({ id, audience: "gsc" }, stateKey(config, "dashboard"));
        const params = new URLSearchParams({ client_id: clientId, redirect_uri: `${dashboardOrigin}/app-api/v1/auth/google/gsc/callback`, response_type: "code", scope: "openid email profile https://www.googleapis.com/auth/webmasters.readonly", state, code_challenge: challenge(verifier), code_challenge_method: "S256", access_type: "offline", prompt: "consent" });
        sendJson(res, 200, { authorize_url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }, { "Access-Control-Allow-Origin": null, "Cache-Control": "no-store", "Set-Cookie": cookie("gc_oauth_gsc", nonce) }); return true;
      } catch (error) { return sendError(res, sendJson, error.code === "auth_required" ? 401 : 403, error.code || "gsc_authorization_denied", "GSC authorization cannot be started"); }
    }
    if (url.pathname === "/app-api/v1/auth/google/gsc/callback" && req.method === "GET") {
      try {
        const payload = verifyState(url.searchParams.get("state"), stateKey(config, "dashboard")); const nonce = readCookie(req, "gc_oauth_gsc");
        const record = nonce ? await stateStore.consume({ id: payload.id, audience: "gsc", nonce, now: now() }) : null;
        if (!record) throw coded("oauth_state_invalid"); const token = await exchange({ code: String(url.searchParams.get("code") || ""), verifier: record.verifier, redirectUri: `${dashboardOrigin}/app-api/v1/auth/google/gsc/callback` });
        if (!token.refresh_token) throw coded("google_refresh_token_missing"); const profile = await userInfo(token.access_token); const session = await routes.dashboard.api.authenticateSession(record.sessionToken);
        if (!session || profile.email !== session.email) throw coded("google_account_mismatch"); const properties = await gscClient.listProperties({ accessToken: token.access_token }); const siteUrl = await projectSiteUrl(record.sessionToken, record.projectId);
        const matches = properties.filter((property) => propertyMatchesSite(property.siteUrl, siteUrl)).map((property) => property.siteUrl);
        if (!matches.length) throw coded("gsc_matching_property_not_found"); const pendingId = randomBytes(24).toString("base64url");
        await pendingGscConnections.set(pendingId, { sessionToken: record.sessionToken, projectId: record.projectId, googleEmail: profile.email, refreshToken: token.refresh_token, properties: matches, expiresAt: now() + 600000 });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": clearCookie("gc_oauth_gsc") });
        res.end(gscPropertySelectionPage({ pendingId, properties: matches })); return true;
      } catch (error) { return sendError(res, sendJson, 400, error.code || "gsc_connect_failed", "Search Console connection could not be completed"); }
    }
    const entry = Object.entries(routes).find(([, route]) => url.pathname === route.start || url.pathname === route.callback);
    if (!entry) return false;
    const [audience, route] = entry;
    if (!enabled(audience)) return sendError(res, sendJson, 503, "google_oauth_not_configured", "Google OAuth is not configured");
    if (url.pathname === route.start && req.method === "GET") {
      const id = randomBytes(24).toString("base64url"); const verifier = randomBytes(48).toString("base64url"); const nonce = randomBytes(18).toString("base64url");
      await stateStore.put({ id, audience, verifier, nonce, expiresAt: now() + 600000 });
      const state = signState({ id, audience }, stateKey(config, audience));
      const params = new URLSearchParams({ client_id: clientId, redirect_uri: `${route.origin}${route.callback}`, response_type: "code", scope: route.scopes.join(" "), state, code_challenge: challenge(verifier), code_challenge_method: "S256" });
      res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, "Set-Cookie": cookie(`gc_oauth_${audience}`, nonce) }); res.end(); return true;
    }
    if (url.pathname === route.callback && req.method === "GET") {
      try {
        const payload = verifyState(url.searchParams.get("state"), stateKey(config, audience));
        const nonce = readCookie(req, `gc_oauth_${audience}`);
        const record = nonce ? await stateStore.consume({ id: payload.id, audience, nonce, now: now() }) : null;
        if (!record) throw coded("oauth_state_invalid");
        const code = String(url.searchParams.get("code") || ""); if (!code) throw coded("oauth_denied");
        const token = await exchange({ code, verifier: record.verifier, redirectUri: `${route.origin}${route.callback}` });
        const profile = await userInfo(token.access_token); if (!profile.email_verified) throw coded("google_email_unverified");
        const session = await route.api.loginGoogleAccount({ email: profile.email });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": clearCookie(`gc_oauth_${audience}`) });
        res.end(`<!doctype html><meta charset="utf-8"><script>localStorage.setItem(${JSON.stringify(route.storage)},${JSON.stringify(session.session_token)});location.replace(${JSON.stringify(route.redirect)});</script>`);
      } catch (error) { return sendError(res, sendJson, error.code === "account_not_authorized" ? 403 : 400, error.code || "google_oauth_failed", "Google sign-in could not be completed"); }
      return true;
    }
    return false;
  }
  // Only the Project's site URL is needed, to decide which Search Console
  // properties may be offered. getOverview would load runs, observations and
  // annotations for that, and its range argument only accepts 4, 12 or 26 weeks.
  async function projectSiteUrl(sessionToken, projectId) {
    const projects = await routes.dashboard.api.listProjects({ sessionToken });
    const project = projects.find((entry) => entry.projectId === projectId);
    if (!project) throw coded("gsc_project_not_found");
    return project.siteUrl;
  }

  async function exchange({ code, verifier, redirectUri }) { const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }); const response = await fetchImpl("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }); if (!response.ok) throw coded("google_token_exchange_failed"); return response.json(); }
  async function userInfo(accessToken) { const response = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } }); if (!response.ok) throw coded("google_userinfo_failed"); return response.json(); }
  return { handle, state: () => ({ enabled: enabled(), audiences: Object.keys(routes) }) };
}
function createMemoryPendingStore() {
  const pending = new Map();
  return {
    async set(id, record) { pending.set(id, record); },
    async get(id) { return pending.get(id) || null; },
    async delete(id) { pending.delete(id); }
  };
}

function createMemoryStateStore() {
  const states = new Map();
  return {
    async put(record) { states.set(record.id, record); },
    async consume({ id, audience, nonce, now }) {
      const record = states.get(id);
      if (!record || record.expiresAt < now || record.audience !== audience || record.nonce !== nonce) return null;
      states.delete(id);
      return record;
    }
  };
}
function stateKey(config, audience) { const key = String(config[`${audience.toUpperCase()}_GOOGLE_OAUTH_STATE_KEY`] || ""); if (Buffer.byteLength(key) < 32) throw coded("google_oauth_not_configured"); return key; }
function signState(value, key) { const body = Buffer.from(JSON.stringify(value)).toString("base64url"); return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`; }
function verifyState(value, key) { const [body, signature] = String(value || "").split("."); const expected = createHmac("sha256", key).update(body).digest("base64url"); if (!body || !signature || !timingSafe(signature, expected)) throw coded("oauth_state_invalid"); try { return JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw coded("oauth_state_invalid"); } }
function challenge(verifier) { return createHash("sha256").update(verifier).digest("base64url"); }
function timingSafe(a, b) { return a.length === b.length && require("node:crypto").timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
function cookie(name, value) { return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`; }
function clearCookie(name) { return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`; }
function readCookie(req, name) { return String(req.headers.cookie || "").split(/;\s*/).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || ""; }
function bearer(req) { const value = String(req.headers.authorization || ""); return /^Bearer\s+(.+)$/i.test(value) ? value.replace(/^Bearer\s+/i, "").trim() : ""; }
function propertyMatchesSite(propertyUri, siteUrl) { try { const host = new URL(siteUrl).hostname.replace(/^www\./, "").toLowerCase(); const property = String(propertyUri || "").toLowerCase(); return property.startsWith("sc-domain:") ? host === property.slice(10) || host.endsWith(`.${property.slice(10)}`) : new URL(property).hostname.replace(/^www\./, "") === host; } catch { return false; } }
function gscPropertySelectionPage({ pendingId, properties }) { const options = properties.map((property) => `<label><input type="radio" name="property" value="${escapeHtml(property)}" required> ${escapeHtml(property)}</label>`).join(""); return `<!doctype html><meta charset="utf-8"><title>選擇 Search Console property</title><style>body{max-width:620px;margin:8vh auto;padding:24px;font:16px/1.5 system-ui;color:#172033}fieldset{border:1px solid #d7e0ea;border-radius:10px;padding:16px}label{display:block;padding:10px 0}button{margin-top:18px;background:#007f75;color:#fff;border:0;border-radius:6px;padding:10px 16px;font-weight:700}</style><h1>選擇此 Project 的 Search Console property</h1><p>只列出與目前 Project 網域相符的 property。</p><form id="gsc-select"><fieldset>${options}</fieldset><button>連接並開始匯入</button></form><script>document.querySelector('#gsc-select').addEventListener('submit',async(e)=>{e.preventDefault();const property=new FormData(e.currentTarget).get('property');const token=localStorage.getItem('gc_dashboard_session');const r=await fetch('/app-api/v1/projects/google/gsc/select',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({pending_id:${JSON.stringify(pendingId)},property_uri:property})});location.replace('/app/#gsc='+(r.ok?'connected':'failed'));});</script>`; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }
function coded(code) { const error = new Error(code); error.code = code; return error; }
function sendError(res, sendJson, status, code, message) { sendJson(res, status, { error: { code, message } }, { "Access-Control-Allow-Origin": null, "Cache-Control": "no-store" }); return true; }
module.exports = { createGoogleOAuthHttpHandler };
