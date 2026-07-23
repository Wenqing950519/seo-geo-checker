const { safeHostname } = require("./brand-match");

// 只處理已知的重導向/短網址服務；一般網址不打網路請求。
const KNOWN_REDIRECTORS = new Set([
  "l.facebook.com", "lm.facebook.com", "fb.me", "bit.ly", "tinyurl.com", "goo.gl",
  "reurl.cc", "lihi.cc", "lihi1.com", "lihi2.com", "lihi3.cc", "pse.is", "t.co",
  "rb.gy", "shorturl.at"
]);

// 部分重導向網址把目的地放在 query 參數，可離線解出、不需網路。
const PARAM_REDIRECTORS = [
  [/^l(?:m)?\.facebook\.com$/, /^\/l\.php$/, "u"],
  [/^(?:www\.)?google\.com$/, /^\/url$/, "q"],
  [/^(?:www\.)?youtube\.com$/, /^\/redirect$/, "q"]
];

function extractParamRedirect(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    for (const [hostPattern, pathPattern, param] of PARAM_REDIRECTORS) {
      if (!hostPattern.test(host) || !pathPattern.test(parsed.pathname)) continue;
      const target = parsed.searchParams.get(param);
      if (target && /^https?:\/\//i.test(target)) return target;
    }
  } catch { /* 非合法網址一律略過 */ }
  return null;
}

async function resolveOne(url, timeoutMs) {
  const paramTarget = extractParamRedirect(url);
  if (paramTarget) return paramTarget;
  if (!KNOWN_REDIRECTORS.has(safeHostname(url))) return null;
  let current = url;
  for (let hop = 0; hop < 2; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current, { method: "HEAD", redirect: "manual", signal: controller.signal });
      const location = response.headers.get("location");
      if (!location || response.status < 300 || response.status >= 400) break;
      current = new URL(location, current).toString();
      if (!KNOWN_REDIRECTORS.has(safeHostname(current))) break;
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
  }
  return current !== url ? current : null;
}

// 回傳 { 原始網址: 解析後網址 }，只含有變化的項目。原始資料不被改寫，供事後稽核。
async function resolveCitationRedirects(urls, { limit = 8, timeoutMs = 4000 } = {}) {
  const unique = [...new Set((urls || []).filter(Boolean))];
  const targets = unique
    .filter((url) => extractParamRedirect(url) || KNOWN_REDIRECTORS.has(safeHostname(url)))
    .slice(0, limit);
  if (!targets.length) return {};
  const resolution = {};
  await Promise.all(targets.map(async (url) => {
    try {
      const resolved = await resolveOne(url, timeoutMs);
      if (resolved && resolved !== url) resolution[url] = resolved;
    } catch { /* 解析失敗保留原始網址 */ }
  }));
  return resolution;
}

module.exports = { KNOWN_REDIRECTORS, extractParamRedirect, resolveCitationRedirects };
