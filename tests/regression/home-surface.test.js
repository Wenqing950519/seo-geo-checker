const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The GeoCheck home page describes the MCAC 0.2.0 quick check and shows a sample MCAC
// report. Every result on the sample must be one MCAC could produce, the sample must not
// be attributed to a real business, and the copy must not contradict LS-Labs' own
// research (AI 搜尋時代的檢索機制報告) or describe the retired Classic score.
const home = fs.readFileSync(path.resolve(__dirname, "../../apps/web/public/home.html"), "utf8");
const visible = home.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
const text = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

// 1. The sample is labelled and anonymous.
const sample = visible.match(/<section id="report"[\s\S]*?<\/section>/);
assert.ok(sample, "home must show the sample report");
assert.match(sample[0], /範例/, "the sample report must be labelled 範例");
assert.doesNotMatch(home, /艾朋|À Point|real-site-apoint/, "the sample must not borrow a real business");

// 2. The sample reads like the MCAC report (apps/web/report/mcac-report-html.js in
//    seo-geo-checker PR #5): the same four rows, labels and flag words, and results that
//    follow the v0 flag rules (docs/MCAC_V0.md, mcac-flags-v0). Discovery has at most two
//    questions and Citation reads all four.
const LABEL = {
  mention: "提及（Mention）",
  citation: "引用來源（Citation）",
  accuracy: "資訊正確性（Accuracy）",
  conversion: "行動資訊（Conversion-readiness）"
};
const FLAG = { yes: "有", part: "部分", no: "無", unknown: "未知", correct: "正確", mismatch: "不一致", not_provided: "未提供", unverifiable: "無法核對" };
const FIELD = { correct: "正確", mismatch: "和你的頁面不一致", not_provided: "未提供", unverifiable: "無法核對" };
const rows = [...sample[0].matchAll(/<tr data-mcac-row="(\w+)"([^>]*)>([\s\S]*?)<\/tr>/g)].map(([, name, attrs, inner]) => ({
  name,
  attr: (key) => (attrs.match(new RegExp(`data-${key}="([^"]*)"`)) || [])[1],
  inner,
  text: text(inner)
}));
assert.deepEqual(rows.map((row) => row.name), Object.keys(LABEL), "the sample lists the four MCAC results in report order");
const flagOf = (row) => {
  const pill = row.inner.match(/class="mcac-flag mcac-flag--(\w+)">([^<]+)</);
  assert.ok(pill, `${row.name} must show its flag`);
  assert.equal(pill[2], FLAG[row.attr("flag")], `${row.name} flag reads ${pill[2]}, the report says ${FLAG[row.attr("flag")]}`);
  return row.attr("flag");
};
for (const row of rows) assert.ok(row.text.startsWith(LABEL[row.name]), `${row.name} must be labelled ${LABEL[row.name]}`);

const [mention, citation, accuracy, conversion] = rows;
const count = (row, max) => {
  const [hits, n] = [Number(row.attr("hits")), Number(row.attr("n"))];
  assert.ok(Number.isInteger(n) && n >= 1 && n <= max && hits >= 0 && hits <= n, `${row.name}: ${hits}/${n} is not an MCAC count`);
  return { hits, n };
};
const m = count(mention, 2);
assert.equal(flagOf(mention), m.hits === m.n ? "yes" : m.hits > 0 ? "part" : "no", "Mention flag must follow mcac-flags-v0");
assert.match(mention.text, new RegExp(`${m.hits} / ${m.n} 題推薦題提到你`));
const c = count(citation, 4);
assert.equal(flagOf(citation), c.hits * 2 >= c.n ? "yes" : c.hits > 0 ? "part" : "no", "Citation flag must follow mcac-flags-v0");
assert.match(citation.text, new RegExp(`官網出現在 ${c.hits} / ${c.n} 題`));

const fields = { phone: accuracy.attr("phone"), address: accuracy.attr("address") };
for (const value of Object.values(fields)) assert.ok(value in FIELD, `unknown Accuracy field value ${value}`);
const judged = Object.values(fields);
const accuracyFlag = judged.includes("mismatch") ? "mismatch" : judged.includes("correct") ? "correct"
  : judged.every((value) => value === "unverifiable") ? "unverifiable" : "not_provided";
assert.equal(flagOf(accuracy), accuracyFlag, "Accuracy flag must follow mcac-flags-v0");
assert.ok(accuracy.text.includes(`電話：${FIELD[fields.phone]}・地址：${FIELD[fields.address]}`), "Accuracy must read like the report row");

const conversionFlag = flagOf(conversion);
assert.ok(["yes", "no"].includes(conversionFlag), "a sample with an answered action question is yes or no");
assert.ok(conversion.text.includes(`官網入口：${conversion.attr("official") === "yes" ? "有" : "沒有"}`), "Conversion must state the official entry");

// The fact check shows what the page says next to what the AI said, and agrees with the row.
const digits = (value) => value.replace(/\D/g, "");
const facts = [...sample[0].matchAll(/<div class="mcac-fact" data-field="(\w+)" data-status="(\w+)">([\s\S]*?)<\/div>/g)];
assert.deepEqual(facts.map((fact) => fact[1]), ["phone", "address"], "the sample shows the phone and address fact check");
for (const [, field, status, inner] of facts) {
  assert.equal(status, fields[field], `${field} fact status must match the Accuracy row`);
  const page = (inner.match(/data-side="page">([^<]+)</) || [])[1];
  const ai = (inner.match(/data-side="ai">([^<]+)</) || [])[1];
  assert.ok(page && ai, `${field} must show the page value and the AI value`);
  const same = field === "phone" ? digits(page) === digits(ai) : page.replace(/\s/g, "") === ai.replace(/\s/g, "");
  assert.equal(same, status === "correct", `${field}: ${status} does not fit page "${page}" vs AI "${ai}"`);
  assert.ok(text(inner).includes(FIELD[status]), `${field} must read ${FIELD[status]}`);
  const contact = sample[0].match(/<p class="sample-site__contact">([\s\S]*?)<\/p>/);
  assert.ok(contact && text(contact[1]).includes(page), `the sample site must show its own ${field}`);
}
if (judged.includes("mismatch")) {
  assert.match(sample[0], /請確認哪一個正確，並把官網、粉專、Google 商家等各平台的資料統一/, "a mismatch carries the report's advice");
}

// 3. No blended score anywhere: MCAC reads four results and has no total (total: null).
assert.doesNotMatch(home, /scoreVal|compact-gauge|id="arc"|\/100</, "the sample must not draw a score gauge");
for (const phrase of ["AI 信任值", "信任值", "AI Trust Index", "65%", "35%", "65／35", "65/35", "摘要分數", "總分只是摘要", "先修清單", "先修哪三件事", "優先 P1", "補成四題"]) {
  assert.ok(!home.includes(phrase), `home must not describe the Classic score: "${phrase}"`);
}

// 4. The method is stated as built: three kinds of question, four results read
//    separately, no total, the two engine pairs, and the Accuracy wording decided on
//    2026-10-20. A value the page does not list is not called an error.
for (const phrase of ["推薦題", "事實題", "行動題", "推薦 2、事實 1、行動 1", "四項分開判讀", "不合成總分", "和你的頁面不一致", "無法核對", "未知不等於 0", "DeepSeek", "Perplexity", "Gemini"]) {
  assert.ok(visible.includes(phrase), `home must explain MCAC: "${phrase}"`);
}
assert.doesNotMatch(visible, /有錯誤|[：:]\s*錯誤|>錯誤</, "a mismatch with the owner's page is not an error");
assert.doesNotMatch(visible, /ChatGPT\s*有提到你|在 ChatGPT 或 Perplexity 詢問/, "GeoCheck does not ask ChatGPT");

// 5. Claims the page cannot back, or that the 2026-09-18 retrieval report contradicts.
assert.doesNotMatch(home, /Top Position Trend|Jan 01/, "a snapshot tool must not draw a trend chart");
assert.doesNotMatch(home, />50\+</, "the checked-site count has no source");
assert.doesNotMatch(home, /app\.lslabs\.tw/, "the paused Dashboard must not be linked");
assert.doesNotMatch(home, /找得到你 ✓/, "Google indexing is not measured, so it cannot be ticked");
assert.doesNotMatch(visible, /閱讀完幾十個網站/, "a source list does not show which pages an answer used");
assert.doesNotMatch(visible, /程式碼範例/, "the MCAC report lists site checks, not code samples");
for (const phrase of ["可重現", "科學維度", "心智第一指名率", "不可撼動", "權威依據", "截流", "能得幾分", "秒懂", "真實反映", "決策清單", "盲測", "雙軌"]) {
  assert.ok(!visible.includes(phrase), `home must not claim "${phrase}"`);
}
assert.match(visible, /https:\/\/lslabs\.tw\/blog\/AI搜尋時代的檢索機制報告\//, "the method section must point to the retrieval report");

// 5a. The daily and per-IP audit limits are unpublished (2026-10-20 decision; the values
//     live only in Worker secrets). The page may say a limit exists, never how large it is.
const whitepaper = fs.readFileSync(path.resolve(__dirname, "../../apps/web/public/whitepaper.html"), "utf8");
for (const [name, page] of [["home", home], ["whitepaper", whitepaper]]) {
  assert.doesNotMatch(page, /AUDIT_DAILY_LIMIT|AUDIT_RATE/, `${name} must not name the limit settings`);
  assert.doesNotMatch(page, /(?:每(?:日|天)|同一(?:個)?\s*(?:IP|網路))[^。<]{0,16}?\d+\s*(?:次|份|個|題)/, `${name} must not publish a limit number`);
  assert.doesNotMatch(page, /\d+\s*(?:次|份)[^。<]{0,8}(?:上限|額度)/, `${name} must not publish a limit number`);
}
for (const phrase of ["名額上限", "太頻繁"]) assert.ok(visible.includes(phrase), `the FAQ must say the limits exist: ${phrase}`);

// 6. The FAQ structured data says what the visible FAQ says, question for question.
const ld = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const faq = ld["@graph"].find((node) => node["@type"] === "FAQPage");
const shown = [...visible.matchAll(/<details>\s*<summary>([\s\S]*?)<svg/g)].map((match) => text(match[1]));
assert.deepEqual(faq.mainEntity.map((item) => item.name), shown, "FAQPage questions must match the visible FAQ");
for (const item of faq.mainEntity) {
  assert.doesNotMatch(item.acceptedAnswer.text, /信任值|先修|65/, `FAQ answer must not describe the Classic score: ${item.name}`);
}

// 7. GA4 CTA names feed existing funnels; content edits keep them.
for (const name of ["nav_start_audit", "hero_start_audit", "report_preview_start_audit", "final_research_open", "final_recheck"]) {
  assert.match(home, new RegExp(`data-track-cta="${name}"`), `home must keep the ${name} CTA event`);
}

// 8. Fonts never block the first paint: Google Fonts stylesheets load as style
//    preloads (a <noscript> copy is allowed).
const outsideNoscript = home.replace(/<!--[\s\S]*?-->/g, "").replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
const fontLinks = outsideNoscript.match(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/g) || [];
assert.ok(fontLinks.length > 0, "home still loads its web fonts");
for (const tag of fontLinks) {
  assert.match(tag, /rel="preload"/, `render-blocking font stylesheet: ${tag}`);
  assert.match(tag, /as="style"/, `font preload must be a style preload: ${tag}`);
}

console.log("home surface tests passed");

// The submit-and-open flow is tested on its own; it runs from here so the npm test line,
// which PR #4 and PR #5 both edit, needs no third change.
require("./home-audit-flow.test.js");
