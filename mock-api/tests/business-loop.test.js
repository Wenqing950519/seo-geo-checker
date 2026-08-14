const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createAuditCache } = require("../lib/audit-cache");
const { createFunnelRecorder } = require("../lib/funnel-events");
const { assertSafePublicUrl, isPrivateIp } = require("../lib/url-safety");
const { createAnalytics } = require("../public/analytics.js");

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

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

  const analyticsCalls = [];
  const analyticsLocalStorage = createMemoryStorage();
  const analyticsSessionStorage = createMemoryStorage();
  const analytics = createAnalytics({
    location: {
      href: "https://geocheck.lisheng.cv/?utm_source=meta&utm_medium=paid_social&utm_campaign=launch&utm_content=video_a",
      pathname: "/"
    },
    document: { referrer: "https://www.facebook.com/path?private=value" },
    navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile" },
    localStorage: analyticsLocalStorage,
    sessionStorage: analyticsSessionStorage,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    gtag: (...args) => analyticsCalls.push(args)
  });
  const context = analytics.getContext();
  assert.equal(context.attribution.utm_source, "meta");
  assert.equal(context.attribution.utm_campaign, "launch");
  assert.equal(context.attribution.referrer, "facebook.com");
  assert.equal(analytics.trackOnce("landing_view", "landing_view", { journey_stage: "landing" }), true);
  assert.equal(analytics.trackOnce("landing_view", "landing_view", { journey_stage: "landing" }), false);
  analytics.track("url_submitted", { site_url: "https://private.example/path", email: "secret@example.com" });
  analytics.trackAnalysisStarted();
  assert.equal(analytics.trackResultViewed("report_cacheable"), true);
  assert.equal(analytics.trackResultViewed("report_cacheable"), false);
  analytics.trackAnalysisStarted();
  assert.equal(analytics.trackResultViewed("report_cacheable"), true);
  const eventCalls = analyticsCalls.filter((call) => call[0] === "event");
  assert.equal(eventCalls.filter((call) => call[1] === "landing_view").length, 1);
  assert.equal(eventCalls.filter((call) => call[1] === "analysis_started").length, 2);
  assert.equal(eventCalls.filter((call) => call[1] === "second_analysis").length, 1);
  assert.equal(eventCalls.filter((call) => call[1] === "result_viewed").length, 2);
  const startedPayloads = eventCalls.filter((call) => call[1] === "analysis_started").map((call) => call[2]);
  const resultPayloads = eventCalls.filter((call) => call[1] === "result_viewed").map((call) => call[2]);
  assert.equal(startedPayloads[0].analysis_sequence, 1);
  assert.equal(startedPayloads[0].is_repeat_analysis, false);
  assert.equal(resultPayloads[0].analysis_sequence, 1);
  assert.equal(resultPayloads[0].is_repeat_analysis, false);
  assert.equal(startedPayloads[1].analysis_sequence, 2);
  assert.equal(startedPayloads[1].is_repeat_analysis, true);
  assert.equal(resultPayloads[1].analysis_sequence, 2);
  assert.equal(resultPayloads[1].is_repeat_analysis, true);
  const submittedPayload = eventCalls.find((call) => call[1] === "url_submitted")[2];
  assert.equal("site_url" in submittedPayload, false);
  assert.equal("email" in submittedPayload, false);
  assert.equal(submittedPayload.device_type, "mobile");

  const homePage = fs.readFileSync(path.resolve(__dirname, "../public/home.html"), "utf8");
  assert.equal(/顧問|付費|報價|NT\$|pilot_fix_pack|服務方案/.test(homePage), false);
  assert.equal(homePage.includes("健檢結果與使用回饋"), true);
  assert.equal(homePage.includes("GEO 量測與研究方法"), true);
  assert.equal(homePage.includes('id="method"'), true);
  assert.equal(homePage.includes("未知不等於零分"), true);
  assert.equal(homePage.includes("目前的 50 / 30 / 20"), false);
  assert.equal(homePage.includes("暫定模型 · 未經校準"), false);
  assert.equal(homePage.includes('src="/analytics.js"'), true);
  assert.equal(homePage.includes("analysis_completed"), true);
  assert.equal(homePage.includes("window.GeoCheckAnalytics?.track"), true);

  const serverSource = fs.readFileSync(path.resolve(__dirname, "../server.js"), "utf8");
  assert.equal(/SEO\/GEO 顧問|#services|服務方案/.test(serverSource), false);
  assert.equal(serverSource.includes("[專案內容](${SITE_ORIGIN}/#project)"), true);
  assert.equal(serverSource.includes("[研究與方法](${SITE_ORIGIN}/#method): 資料流程、當前模型與限制"), true);
  assert.equal(serverSource.includes("result_viewed"), true);
  assert.equal(serverSource.includes("recommendation_clicked"), true);
  assert.equal(serverSource.includes("<title>GeoCheck GEO 健檢報告 - ${escapeHtml(report.url)}</title>"), false);
  assert.equal(serverSource.includes("<title>SEO/GEO 健檢報告 - ${escapeHtml(report.url)}</title>"), false);

  console.log("business-loop tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
