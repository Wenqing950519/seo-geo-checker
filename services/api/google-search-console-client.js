function createGoogleSearchConsoleClient({ clientId, clientSecret, fetchImpl = fetch } = {}) {
  if (!clientId || !clientSecret) return null;
  return { async fetchDailyMetrics({ propertyUri, refreshToken, from, to }) {
    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
    const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!tokenResponse.ok) { const error = new Error("token refresh failed"); error.code = "gsc_token_refresh_failed"; throw error; }
    const { access_token: accessToken } = await tokenResponse.json();
    const response = await fetchImpl(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUri)}/searchAnalytics/query`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ startDate: from, endDate: to, dimensions: ["date"], type: "web" }) });
    if (!response.ok) { const error = new Error("GSC query failed"); error.code = "gsc_query_failed"; throw error; }
    const payload = await response.json(); return payload.rows || [];
  }, async listProperties({ accessToken }) {
    const response = await fetchImpl("https://searchconsole.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) { const error = new Error("GSC property list failed"); error.code = "gsc_property_list_failed"; throw error; }
    return (await response.json()).siteEntry || [];
  }};
}
module.exports = { createGoogleSearchConsoleClient };
