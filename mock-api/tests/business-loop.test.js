const assert = require("assert");
const fs = require("fs");
const path = require("path");
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
  recorder.record("lead_submitted", { email: "secret@example.com", interest: "audit_feedback" });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes("secret@example.com"), false);
  assert.equal(lines[0].includes("audit_feedback"), true);

  const homePage = fs.readFileSync(path.resolve(__dirname, "../public/home.html"), "utf8");
  assert.equal(/顧問|付費|報價|NT\$|pilot_fix_pack|服務方案/.test(homePage), false);
  assert.equal(homePage.includes("健檢結果與使用回饋"), true);
  assert.equal(homePage.includes("GEO 量測與研究方法"), true);
  assert.equal(homePage.includes('id="method"'), true);
  assert.equal(homePage.includes("未知不等於零分"), true);
  assert.equal(homePage.includes("目前的 50 / 30 / 20"), false);
  assert.equal(homePage.includes("暫定模型 · 未經校準"), false);

  const serverSource = fs.readFileSync(path.resolve(__dirname, "../server.js"), "utf8");
  assert.equal(/SEO\/GEO 顧問|#services|服務方案/.test(serverSource), false);
  assert.equal(serverSource.includes("[專案內容](${SITE_ORIGIN}/#project)"), true);
  assert.equal(serverSource.includes("[研究與評分方法](${SITE_ORIGIN}/#method): 報告資料流程與解讀限制"), true);

  console.log("business-loop tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
