(function initGeoCheckAnalytics(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = { createAnalytics: factory };
    return;
  }
  root.GeoCheckAnalytics = factory(root);
})(typeof window !== "undefined" ? window : globalThis, function createAnalytics(env) {
  "use strict";

  const ATTRIBUTION_KEY = "geocheck_attribution_v1";
  const ANONYMOUS_ID_KEY = "geocheck_anonymous_id_v1";
  const SESSION_ID_KEY = "geocheck_session_id_v1";
  const ANALYSIS_COUNT_KEY = "geocheck_analysis_count_v1";
  const ACTIVATED_KEY = "geocheck_activated_v1";
  const ONCE_PREFIX = "geocheck_event_once_v1:";
  const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
  const BLOCKED_PARAM_KEYS = new Set([
    "url", "site", "site_url", "tested_url", "email", "name", "need", "message",
    "phone", "address", "query", "search_term"
  ]);

  function storageGet(storage, key) {
    try { return storage?.getItem(key) || ""; } catch { return ""; }
  }

  function storageSet(storage, key, value) {
    try { storage?.setItem(key, value); return true; } catch { return false; }
  }

  function makeId(prefix) {
    const uuid = env.crypto?.randomUUID?.();
    if (uuid) return `${prefix}_${uuid}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function getOrCreateId(storage, key, prefix) {
    const existing = storageGet(storage, key);
    if (existing) return existing;
    const created = makeId(prefix);
    storageSet(storage, key, created);
    return created;
  }

  function cleanValue(value, maxLength = 120) {
    if (value === undefined || value === null) return "";
    return String(value).trim().slice(0, maxLength);
  }

  function safeReferrerHost(referrer) {
    if (!referrer) return "";
    try { return new URL(referrer).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
  }

  function deviceType() {
    const ua = String(env.navigator?.userAgent || "");
    if (/ipad|tablet|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return "tablet";
    if (/mobile|iphone|ipod|android/i.test(ua)) return "mobile";
    return "desktop";
  }

  function currentUrl() {
    try { return new URL(env.location?.href || "https://invalid.local/"); } catch { return new URL("https://invalid.local/"); }
  }

  function readAttribution() {
    const url = currentUrl();
    const supplied = {};
    let hasUtm = false;
    UTM_KEYS.forEach((key) => {
      const value = cleanValue(url.searchParams.get(key), key === "utm_content" ? 200 : 120);
      supplied[key] = value;
      if (value) hasUtm = true;
    });

    const storedRaw = storageGet(env.sessionStorage, ATTRIBUTION_KEY);
    let stored = null;
    try { stored = storedRaw ? JSON.parse(storedRaw) : null; } catch { stored = null; }
    if (!hasUtm && stored) return stored;

    const attribution = {
      ...supplied,
      referrer: safeReferrerHost(env.document?.referrer || ""),
      entry_route: cleanValue(url.pathname || "/", 160)
    };
    storageSet(env.sessionStorage, ATTRIBUTION_KEY, JSON.stringify(attribution));
    return attribution;
  }

  const anonymousId = getOrCreateId(env.localStorage, ANONYMOUS_ID_KEY, "anon");
  const sessionId = getOrCreateId(env.sessionStorage, SESSION_ID_KEY, "session");
  const attribution = readAttribution();

  function isDebugMode() {
    const url = currentUrl();
    return url.searchParams.get("debug_mode") === "1" || url.searchParams.get("ga_debug") === "1";
  }

  function commonParams() {
    return {
      schema_version: "1.0",
      client_timestamp: new Date().toISOString(),
      gc_anonymous_id: anonymousId,
      gc_session_id: sessionId,
      page_route: cleanValue(currentUrl().pathname || "/", 160),
      entry_route: cleanValue(attribution.entry_route || "/", 160),
      utm_source: cleanValue(attribution.utm_source),
      utm_medium: cleanValue(attribution.utm_medium),
      utm_campaign: cleanValue(attribution.utm_campaign),
      utm_content: cleanValue(attribution.utm_content, 200),
      referrer: cleanValue(attribution.referrer),
      device_type: deviceType()
    };
  }

  function safeEventParams(params) {
    const safe = {};
    Object.entries(params || {}).forEach(([key, value]) => {
      if (BLOCKED_PARAM_KEYS.has(key) || value === undefined || value === null || value === "") return;
      if (typeof value === "string") safe[key] = cleanValue(value, 200);
      else if (typeof value === "number" || typeof value === "boolean") safe[key] = value;
    });
    return safe;
  }

  function track(eventName, params = {}) {
    if (typeof env.gtag !== "function") return false;
    const payload = safeEventParams({ ...commonParams(), ...params });
    if (isDebugMode()) payload.debug_mode = true;
    env.gtag("event", eventName, payload);
    return true;
  }

  function trackOnce(eventName, dedupeKey, params = {}) {
    const storageKey = `${ONCE_PREFIX}${dedupeKey}`;
    if (storageGet(env.sessionStorage, storageKey)) return false;
    const sent = track(eventName, params);
    if (sent) storageSet(env.sessionStorage, storageKey, "1");
    return sent;
  }

  function trackAnalysisStarted(params = {}) {
    const previous = Number.parseInt(storageGet(env.sessionStorage, ANALYSIS_COUNT_KEY), 10) || 0;
    const analysisSequence = previous + 1;
    const isRepeatAnalysis = storageGet(env.localStorage, ACTIVATED_KEY) === "1";
    storageSet(env.sessionStorage, ANALYSIS_COUNT_KEY, String(analysisSequence));
    const eventParams = {
      ...params,
      analysis_sequence: analysisSequence,
      is_repeat_analysis: isRepeatAnalysis,
      analysis_stage: "analysis_started",
      analysis_status: "in_progress"
    };
    track("analysis_started", eventParams);
    if (analysisSequence === 2) track("second_analysis", eventParams);
    return analysisSequence;
  }

  function trackResultViewed(analysisId, params = {}) {
    const analysisSequence = Number.parseInt(storageGet(env.sessionStorage, ANALYSIS_COUNT_KEY), 10) || 1;
    const isRepeatAnalysis = storageGet(env.localStorage, ACTIVATED_KEY) === "1";
    const sent = trackOnce("result_viewed", `result_viewed:${analysisId}:${analysisSequence}`, {
      ...params,
      analysis_id: analysisId,
      analysis_sequence: analysisSequence,
      is_repeat_analysis: isRepeatAnalysis,
      analysis_stage: "result_viewed",
      analysis_status: "completed"
    });
    storageSet(env.localStorage, ACTIVATED_KEY, "1");
    return sent;
  }

  return {
    getContext: () => ({ anonymousId, sessionId, attribution: { ...attribution } }),
    track,
    trackOnce,
    trackAnalysisStarted,
    trackResultViewed
  };
});
