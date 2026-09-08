const assert = require("node:assert/strict");
const { createAuditCache, isCacheableAuditReport } = require("../../services/api/storage/audit-cache.js");

const successful = { id: "ok", model: "sonar", homepage: { fetchBlocked: false } };
const fetchLimited = { id: "limited", model: "fetch-limited", homepage: { fetchBlocked: true } };
assert.equal(isCacheableAuditReport(successful), true);
assert.equal(isCacheableAuditReport(fetchLimited), false);

const cache = createAuditCache({ ttlMs: 60_000, now: () => 1_000 });
cache.set("https://example.com/", fetchLimited);
assert.equal(cache.get("https://example.com/"), null, "transient fetch failures must remain retryable");
cache.set("https://example.com/", successful);
assert.equal(cache.get("https://example.com/").report.id, "ok");

cache.set("audit:four-question-auto-v1", successful);
assert.equal(cache.get("audit:four-question-auto-v1").report.id, "ok", "opaque cache keys must retain the query-set identity");
assert.equal(cache.get("audit:another-query-set"), null, "different query sets must never share a cached report");

console.log("audit cache tests passed");
