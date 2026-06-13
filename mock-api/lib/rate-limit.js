const ipHits = new Map();
const urlCooldowns = new Map();

const DEFAULTS = {
  ipWindowMs: Number(process.env.RATE_LIMIT_IP_WINDOW_MS || 10 * 60 * 1000),
  ipMax: Number(process.env.RATE_LIMIT_IP_MAX || 3),
  urlCooldownMs: Number(process.env.RATE_LIMIT_URL_COOLDOWN_MS || 30 * 60 * 1000),
  maxActiveAudits: Number(process.env.MAX_ACTIVE_AUDITS || 2)
};

let activeAudits = 0;

function getClientIp(req) {
  // In production behind a trusted reverse proxy (e.g. nginx, Cloudflare), set
  // TRUST_PROXY=true to use x-forwarded-for. Otherwise use the direct socket
  // address to prevent IP spoofing via crafted headers.
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      // Use the rightmost IP added by the trusted proxy (last in chain)
      const ips = forwarded.split(",").map(s => s.trim()).filter(Boolean);
      return ips[ips.length - 1] || req.socket.remoteAddress || "unknown";
    }
  }
  return req.socket.remoteAddress || "unknown";
}

function normalizeAuditUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return String(url || "").trim().toLowerCase();
  }
}

function checkAuditLimit({ req, url }) {
  const now = Date.now();
  const ip = getClientIp(req);
  const normalizedUrl = normalizeAuditUrl(url);

  if (activeAudits >= DEFAULTS.maxActiveAudits) {
    return limited({
      code: "CONCURRENCY_LIMIT",
      message: "目前健檢請求較多，請稍後再試。",
      retryAfterMs: 30_000
    });
  }

  const hits = (ipHits.get(ip) || []).filter((time) => now - time < DEFAULTS.ipWindowMs);
  if (hits.length >= DEFAULTS.ipMax) {
    const oldest = hits[0];
    return limited({
      code: "IP_RATE_LIMIT",
      message: "你在短時間內送出太多健檢請求，請稍後再試。",
      retryAfterMs: Math.max(1000, DEFAULTS.ipWindowMs - (now - oldest))
    });
  }

  const lastRunAt = urlCooldowns.get(normalizedUrl);
  if (lastRunAt && now - lastRunAt < DEFAULTS.urlCooldownMs) {
    return limited({
      code: "URL_COOLDOWN",
      message: "這個網址剛剛已經健檢過，請稍後再試。",
      retryAfterMs: Math.max(1000, DEFAULTS.urlCooldownMs - (now - lastRunAt))
    });
  }

  return {
    allowed: true,
    ip,
    normalizedUrl
  };
}

function recordAuditStart({ ip, normalizedUrl }) {
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter((time) => now - time < DEFAULTS.ipWindowMs);
  hits.push(now);
  ipHits.set(ip, hits);
  urlCooldowns.set(normalizedUrl, now);
  activeAudits += 1;
}

function recordAuditEnd() {
  activeAudits = Math.max(0, activeAudits - 1);
}

function getRateLimitState() {
  return {
    activeAudits,
    ipEntries: ipHits.size,
    urlEntries: urlCooldowns.size,
    config: DEFAULTS
  };
}

function limited({ code, message, retryAfterMs }) {
  return {
    allowed: false,
    statusCode: 429,
    code,
    message,
    retryAfterMs,
    retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
  };
}

module.exports = {
  checkAuditLimit,
  getRateLimitState,
  recordAuditEnd,
  recordAuditStart
};
