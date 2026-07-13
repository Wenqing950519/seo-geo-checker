const assert = require("assert");
const { createAuditCache } = require("../lib/audit-cache");
const { createFunnelRecorder } = require("../lib/funnel-events");
const { assertSafePublicUrl, isPrivateIp } = require("../lib/url-safety");

async function main() {
  let clock = 1_700_000_000_000;
  const cache = createAuditCache({ ttlMs: 1000, now: () => clock });
  const original = { id: "r1", score: { value: 75 } };
  const stored = cache.set("https://example.com/page", original);
  assert.equal(stored.cache.hit, false);
  assert.equal(cache.get("https://example.com/other").cache.hit, true);
  clock += 1001;
  assert.equal(cache.get("https://example.com"), null);

  assert.equal(isPrivateIp("127.0.0.1"), true);
  assert.equal(isPrivateIp("10.2.3.4"), true);
  assert.equal(isPrivateIp("8.8.8.8"), false);
  await assert.rejects(() => assertSafePublicUrl("http://localhost"), /安全考量/);
  await assert.rejects(() => assertSafePublicUrl("http://192.168.1.2"), /安全考量/);
  await assertSafePublicUrl("https://example.com", {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }]
  });

  const lines = [];
  const recorder = createFunnelRecorder({ write: (line) => lines.push(line) });
  recorder.record("lead_submitted", { email: "secret@example.com", interest: "pilot_fix_pack" });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes("secret@example.com"), false);
  assert.equal(lines[0].includes("pilot_fix_pack"), true);

  console.log("business-loop tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
