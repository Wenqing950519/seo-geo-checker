const assert = require("node:assert/strict");
const { createAuditCache, isCacheableAuditReport } = require("../lib/audit-cache");

const successful = { id: "ok", model: "sonar", homepage: { fetchBlocked: false } };
const fetchLimited = { id: "limited", model: "fetch-limited", homepage: { fetchBlocked: true } };
assert.equal(isCacheableAuditReport(successful), true);
assert.equal(isCacheableAuditReport(fetchLimited), false);

const cache = createAuditCache({ ttlMs: 60_000, now: () => 1_000 });
cache.set("https://example.com/", fetchLimited);
assert.equal(cache.get("https://example.com/"), null, "transient fetch failures must remain retryable");
cache.set("https://example.com/", successful);
assert.equal(cache.get("https://example.com/").report.id, "ok");

console.log("audit cache tests passed");
