function createAuditCache(options = {}) {
  const ttlMs = Number.isFinite(options.ttlMs)
    ? Math.max(0, options.ttlMs)
    : Math.max(0, Number(process.env.AUDIT_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000));
  const now = options.now || (() => Date.now());
  const entries = new Map();

  function keyFor(siteUrl) {
    const parsed = new URL(siteUrl);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  }

  function get(siteUrl) {
    if (ttlMs <= 0) return null;
    const key = keyFor(siteUrl);
    const entry = entries.get(key);
    if (!entry) return null;
    const ageMs = now() - entry.storedAt;
    if (ageMs < 0 || ageMs >= ttlMs) {
      entries.delete(key);
      return null;
    }
    return {
      report: structuredClone(entry.report),
      cache: {
        hit: true,
        key,
        ageSeconds: Math.floor(ageMs / 1000),
        expiresAt: new Date(entry.storedAt + ttlMs).toISOString()
      }
    };
  }

  function set(siteUrl, report) {
    if (ttlMs <= 0) return report;
    const key = keyFor(siteUrl);
    const storedAt = now();
    entries.set(key, { report: structuredClone(report), storedAt });
    return {
      ...report,
      cache: {
        hit: false,
        key,
        ageSeconds: 0,
        expiresAt: new Date(storedAt + ttlMs).toISOString()
      }
    };
  }

  function state() {
    return { enabled: ttlMs > 0, ttlMs, entries: entries.size };
  }

  return { get, set, state, keyFor };
}

module.exports = { createAuditCache };
