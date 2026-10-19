const assert = require("node:assert/strict");
const { buildBrandTermSet } = require("../../packages/geo-core/evidence/brand-match.js");
const {
  MCAC_VERSION,
  buildMcacProbes,
  extractSiteFacts,
  extractSiteIdentity,
  normalizePhone,
  normalizeAddress,
  parseFactAnswer,
  judgeFact,
  parseActions,
  evaluateMcac
} = require("../../packages/geo-core/mcac/index.js");

// MCAC replaces four look-alike discovery questions and one blended score with three
// kinds of task, each read on its own (AI 搜尋時代的檢索機制報告, appendix A).

// ---------------------------------------------------------------------------
// 1. Probe set: the report's prompt templates, no domain hints, no total.
// ---------------------------------------------------------------------------
{
  const probes = buildMcacProbes({
    brandName: "範例牛肉麵",
    location: "台北",
    siteHost: "example-noodle.tw",
    discoveryQuestions: ["台北市有哪些值得專程吃的牛肉麵店？", "台北適合帶長輩吃的牛肉麵推薦？", "第三題不應被採用？"]
  });
  assert.deepEqual(probes.map((p) => p.type), ["discovery", "discovery", "fact", "action"], "two discovery, one fact, one action");
  assert.deepEqual(probes.map((p) => p.id), ["d1", "d2", "f1", "a1"]);
  for (const probe of probes) {
    assert.ok(!probe.prompt.includes("example-noodle.tw"), `${probe.id} must not hint the official domain`);
    assert.match(probe.prompt, /只使用公開網頁搜尋所得資料/, `${probe.id} carries the research system instruction`);
  }
  assert.match(probes[0].prompt, /不要假設任何特定品牌必須出現在答案中/);
  assert.ok(!probes[0].prompt.includes("範例牛肉麵"), "discovery questions never name the brand");
  assert.match(probes[2].prompt, /請查證台北的「範例牛肉麵」目前地址與電話/);
  assert.match(probes[2].prompt, /ADDRESS: <地址或 UNKNOWN>；PHONE: <電話或 UNKNOWN>/);
  assert.match(probes[3].prompt, /ACTION: <類型> \| <URL 或電話> \| <由品牌自有或第三方平台提供>/);

  const noBrand = buildMcacProbes({ brandName: "", location: "", siteHost: "x.tw", discoveryQuestions: ["台灣的咖啡廳推薦？"] });
  assert.deepEqual(noBrand.map((p) => p.type), ["discovery"], "without a brand name only discovery can run");
  assert.throws(() => buildMcacProbes({ brandName: "example-noodle.tw", siteHost: "example-noodle.tw", discoveryQuestions: [] }),
    /domain/, "a brand name that is the domain would leak the official site into the question");
}

// ---------------------------------------------------------------------------
// 2. Site truth: the official site's own JSON-LD first, visible text second.
// ---------------------------------------------------------------------------
{
  const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"WebSite","name":"範例牛肉麵"},
    {"@type":"Restaurant","name":"範例牛肉麵","telephone":"+886-2-2700-1234",
     "address":{"@type":"PostalAddress","addressRegion":"台北市","addressLocality":"大安區","streetAddress":"仁愛路四段27巷3號"},
     "openingHours":"Mo-Su 11:00-21:00"}]}</script></head><body>歡迎光臨</body></html>`;
  const facts = extractSiteFacts({ html });
  assert.equal(facts.phone.value, "+886-2-2700-1234");
  assert.equal(facts.phone.source, "json_ld");
  assert.equal(facts.address.value, "台北市大安區仁愛路四段27巷3號");
  assert.equal(facts.hours.source, "json_ld");

  const textOnly = extractSiteFacts({ html: "<p>電話：(02) 2700-1234</p><p>地址：106台北市大安區仁愛路四段27巷3號1樓</p><p>營業時間：11:00–21:00</p>" });
  assert.equal(normalizePhone(textOnly.phone.value), "0227001234");
  assert.equal(textOnly.phone.source, "visible_text");
  assert.match(textOnly.address.value, /仁愛路四段27巷3號/);

  const none = extractSiteFacts({ html: "<p>我們是一家網站設計公司</p>" });
  assert.equal(none.phone, null, "no phone on the site means no truth value, not an empty string");
  assert.equal(none.address, null);

  assert.equal(normalizePhone("+886 2 2700 1234"), "0227001234");
  assert.equal(normalizePhone("02-2700-1234"), "0227001234");
  assert.equal(normalizeAddress("106 臺北市大安區仁愛路四段２７巷３號"), normalizeAddress("台北市大安區仁愛路4段27巷3號"));
}

// ---------------------------------------------------------------------------
// 3. Fact answers: correct, incorrect, not provided, unverifiable are different.
// ---------------------------------------------------------------------------
{
  const parsed = parseFactAnswer("ADDRESS: 台北市大安區仁愛路四段27巷3號1樓；PHONE: 02-2700-1234");
  assert.equal(parsed.address.length, 1);
  assert.equal(judgeFact("phone", "+886-2-2700-1234", parsed.phone), "correct");
  assert.equal(judgeFact("address", "台北市大安區仁愛路4段27巷3號", parsed.address), "correct", "floor suffix and 四段/4段 do not make it wrong");
  assert.equal(judgeFact("address", "台北市大安區仁愛路4段27巷3號", parseFactAnswer("ADDRESS: 大安區仁愛路四段27巷3號\nPHONE: UNKNOWN").address), "correct",
    "a missing city is still the same street address");
  assert.equal(judgeFact("phone", "02-2700-1234", parseFactAnswer("ADDRESS: UNKNOWN\nPHONE: 02-2700-9999").phone), "incorrect");
  assert.equal(judgeFact("address", "台北市大安區仁愛路4段27巷3號", parseFactAnswer("ADDRESS: 台北市中山區南京東路一段10號\nPHONE: UNKNOWN").address), "incorrect");
  assert.equal(judgeFact("phone", "02-2700-1234", parseFactAnswer("ADDRESS: UNKNOWN\nPHONE: UNKNOWN").phone), "not_provided");
  assert.equal(judgeFact("address", "台北市大安區仁愛路4段27巷3號", parseFactAnswer("ADDRESS: 台北市大安區\nPHONE: UNKNOWN").address), "not_provided",
    "an address without a street number cannot be checked");
  assert.equal(judgeFact("phone", null, parsed.phone), "unverifiable", "no truth on the official site means unverifiable, never wrong");
  const free = parseFactAnswer("這家店位於臺北市大安區仁愛路四段27巷3號，電話是(02)2700-1234，另有分店電話02-2700-5678。");
  assert.equal(judgeFact("phone", "02-2700-1234", free.phone), "correct", "unformatted answers are still read");
  // Engines append citation markers to each line (2026-10-20 smoke); the report shows the value without them.
  const marked = parseFactAnswer("ADDRESS: 台北市中山區建國北路二段72號[1][6]  \nPHONE: 02-2500-6850[4][7]");
  assert.deepEqual([marked.address, marked.phone], [["台北市中山區建國北路二段72號"], ["02-2500-6850"]]);
  assert.deepEqual(parseFactAnswer("ADDRESS: 106台北市大安區仁愛路四段27巷3號 [1]\nPHONE: 02 2741 6299 [1]").address, ["106台北市大安區仁愛路四段27巷3號"]);
}

// ---------------------------------------------------------------------------
// 3b. Chains list several official numbers (a store line, a customer-service line).
//     Every value the official site publishes is a correct answer; anything else is not.
//     (chefhungfoods.com: homepage 客服電話 +886-2-22432853, store page 建北店 02-2500-6850.)
// ---------------------------------------------------------------------------
{
  const chain = extractSiteFacts({
    html: "<p>客服電話 / +886-2-22432853</p><p>建北總店：台北市中山區建國北路二段72號</p>",
    texts: ["建北店 電話 +886 (2) 2500-6850 地址 台北市中山區建國北路二段72號", "台中店 電話 04-2255-9111 台中市西屯區範例路100號"]
  });
  assert.equal(chain.phone.value, "+886-2-22432853", "the first official number stays the displayed one");
  assert.deepEqual(chain.phone.values.map(normalizePhone), ["0222432853", "0225006850", "0422559111"]);
  assert.equal(chain.address.values.length, 2);
  assert.equal(judgeFact("phone", chain.phone.values, parseFactAnswer("ADDRESS: UNKNOWN；PHONE: 02-2500-6850").phone), "correct",
    "a branch number the official site lists is correct");
  assert.equal(judgeFact("phone", chain.phone.values, parseFactAnswer("ADDRESS: UNKNOWN；PHONE: 02-2222-0000").phone), "incorrect");
  assert.equal(judgeFact("address", chain.address.values, parseFactAnswer("ADDRESS: 台中市西屯區範例路100號；PHONE: UNKNOWN").address), "correct");

  const identity = extractSiteIdentity('<script type="application/ld+json">{"@type":"Organization","name":"洪師父官方網站"}</script>');
  assert.equal(identity.name, "洪師父", "「官方網站」 is a page label, not part of the business name");
}

// ---------------------------------------------------------------------------
// 4. Action answers: a phone or an address is already a next step.
// ---------------------------------------------------------------------------
{
  const actions = parseActions([
    "ACTION: 官方網站 | https://www.example-noodle.tw/menu | 品牌自有",
    "ACTION: 地圖 | https://maps.google.com/?cid=1 | 第三方平台",
    "ACTION: 電話 | 02-2700-1234 | 品牌自有",
    "ACTION: 訂位 | UNKNOWN | UNKNOWN"
  ].join("\n"), { siteHost: "example-noodle.tw" });
  assert.deepEqual(actions.entries.map((e) => e.type), ["website", "map", "phone"], "UNKNOWN actions are not entries");
  assert.equal(actions.hasActionable, true);
  assert.equal(actions.officialEntry, true, "a first-party URL is an official entry");

  const thirdParty = parseActions("ACTION: 訂位 | https://inline.app/booking/abc | 第三方平台", { siteHost: "example-noodle.tw" });
  assert.deepEqual(thirdParty.entries.map((e) => e.type), ["booking"]);
  assert.equal(thirdParty.officialEntry, false);

  const freeText = parseActions("可以撥打 02-2700-1234 預約。", { siteHost: "example-noodle.tw" });
  assert.equal(freeText.hasActionable, true, "a phone number in free text is actionable");

  const nothing = parseActions("ACTION: UNKNOWN | UNKNOWN | UNKNOWN", { siteHost: "example-noodle.tw" });
  assert.equal(nothing.hasActionable, false);
}

// ---------------------------------------------------------------------------
// 5. Four results, read separately; unknown is never zero; no total.
// ---------------------------------------------------------------------------
const brandTerms = buildBrandTermSet({ host: "example-noodle.tw", metadata: { title: "範例牛肉麵｜台北大安" }, masterTerms: ["範例牛肉麵"] });
const truth = { phone: { value: "02-2700-1234", source: "json_ld" }, address: { value: "台北市大安區仁愛路4段27巷3號", source: "json_ld" }, hours: null };
{
  const result = evaluateMcac({
    siteHost: "example-noodle.tw",
    brandTerms,
    truth,
    probes: [
      { id: "d1", type: "discovery", query: "q1", status: "answered",
        answer: "1. 林東芳牛肉麵：湯頭濃郁。\n2. 範例牛肉麵：紅燒湯頭。\n3. 富宏牛肉麵：24 小時營業。",
        citations: [{ url: "https://food-blog.example/beef" }, { url: "https://www.google.com/maps/place/x" }] },
      { id: "d2", type: "discovery", query: "q2", status: "answered",
        answer: "推薦林東芳牛肉麵與劉山東小吃店。", citations: [{ url: "https://www.dcard.tw/f/food/p/1" }] },
      { id: "f1", type: "fact", query: "q3", status: "answered",
        answer: "ADDRESS: 台北市中山區南京東路一段10號；PHONE: 02-2700-1234",
        citations: [{ url: "https://www.example-noodle.tw/contact" }] },
      { id: "a1", type: "action", query: "q4", status: "answered",
        answer: "ACTION: 電話 | 02-2700-1234 | 品牌自有\nACTION: 地圖 | https://maps.google.com/?cid=1 | 第三方平台",
        citations: [{ url: "https://maps.google.com/?cid=1" }] }
    ]
  });
  assert.equal(result.method, "mcac");
  assert.equal(result.method_version, MCAC_VERSION);
  assert.equal(result.total, null, "MCAC never blends the four results into one score");
  assert.deepEqual([result.mention.hits, result.mention.n, result.mention.flag], [1, 2, "part"]);
  assert.deepEqual(result.mention.ranks, [2, null]);
  assert.deepEqual([result.citation.official_probes, result.citation.n, result.citation.flag], [1, 4, "part"]);
  assert.equal(result.citation.by_type.official, 1);
  assert.equal(result.citation.by_type.maps, 2);
  assert.deepEqual(result.accuracy.fields, { phone: "correct", address: "incorrect", hours: "not_judged" });
  assert.equal(result.accuracy.flag, "incorrect", "any wrong fact marks accuracy as incorrect");
  assert.equal(result.conversion.flag, "yes");
  assert.equal(result.conversion.official_entry, false);
  assert.deepEqual(result.conversion.entries, ["phone", "map"]);
}
{
  const result = evaluateMcac({
    siteHost: "example-noodle.tw",
    brandTerms,
    truth: { phone: null, address: null, hours: null },
    probes: [
      { id: "d1", type: "discovery", query: "q1", status: "failed", error: { code: "provider_timeout" } },
      { id: "d2", type: "discovery", query: "q2", status: "answered", answer: "很抱歉，無法找到相關資訊。", citations: [] },
      { id: "f1", type: "fact", query: "q3", status: "answered", answer: "ADDRESS: 台北市大安區仁愛路四段27巷3號；PHONE: 02-2700-1234", citations: [] },
      { id: "a1", type: "action", query: "q4", status: "failed", error: { code: "provider_timeout" } }
    ]
  });
  assert.equal(result.mention.flag, "unknown", "no valid discovery answer is unknown, not zero");
  assert.equal(result.mention.hits, null);
  assert.equal(result.mention.n, 0);
  assert.equal(result.accuracy.flag, "unverifiable", "the site states nothing to check against");
  assert.equal(result.conversion.flag, "unknown", "a failed action question is unknown");
  assert.equal(result.citation.n, 1, "only answered questions count toward citations");
  assert.equal(result.total, null);
}
// A rank counts the options themselves (2026-10-20 smoke): reasons and sources nested under
// each option are not options, so a shop listed fourth is fourth, and one listed sixth is not lost.
{
  const option = (name) => [`${name}`, "   - 理由：湯頭濃郁。", "   * **來源**：部落格。"];
  const nested = (count) => ["林東芳牛肉麵", "劉山東小吃店", "富宏牛肉麵", "老山東牛肉麵", "清真黃牛肉麵館"].slice(0, count - 1)
    .map((name, index) => option(`${index + 1}. **${name}**`)).flat()
    .concat(option(`${count}. **範例牛肉麵**`), ["", "- 想吃老字號：林東芳、範例牛肉麵"]).join("\n");
  const rankOf = (answer) => evaluateMcac({ siteHost: "example-noodle.tw", brandTerms, truth,
    probes: [{ id: "d1", type: "discovery", query: "q", status: "answered", answer, citations: [] }] }).mention.ranks[0];
  assert.equal(rankOf(nested(4)), 4, "nested reasons and sources are not options");
  assert.equal(rankOf(nested(6)), 6, "an option past the tenth list line still has its rank");
  assert.equal(rankOf("- **林東芳牛肉麵** — 湯頭濃郁\n- **範例牛肉麵** — 紅燒"), 2, "a bullet list counts its top-level bullets");
  assert.equal(rankOf("| 選項 | 理由 |\n|---|---|\n| 林東芳牛肉麵 | 濃郁 |\n| 富宏牛肉麵 | 24 小時 |\n| 範例牛肉麵 | 紅燒 |"), 3, "a table counts its rows");
  assert.equal(rankOf("推薦範例牛肉麵，湯頭濃郁。"), null, "prose without a list has no rank");
}
{
  // A brand mentioned only in the fact or action answer is not a discovery mention.
  const result = evaluateMcac({
    siteHost: "example-noodle.tw",
    brandTerms,
    truth,
    probes: [
      { id: "d1", type: "discovery", query: "q1", status: "answered", answer: "推薦林東芳牛肉麵。", citations: [] },
      { id: "f1", type: "fact", query: "q3", status: "answered", answer: "範例牛肉麵 ADDRESS: UNKNOWN；PHONE: UNKNOWN", citations: [] },
      { id: "a1", type: "action", query: "q4", status: "answered", answer: "ACTION: UNKNOWN | UNKNOWN | UNKNOWN", citations: [] }
    ]
  });
  assert.deepEqual([result.mention.hits, result.mention.n, result.mention.flag], [0, 1, "no"]);
  assert.equal(result.accuracy.flag, "not_provided");
  assert.equal(result.conversion.flag, "no");
  assert.equal(result.citation.flag, "no");
}

console.log("MCAC core tests passed");
