const assert = require("node:assert/strict");
const {
  CANDIDATE_QUERY_MIN,
  SELECTED_QUERY_COUNT,
  buildGeoQueryPlanPrompt,
  normalizeGeoQueryPlan,
  normalizeReviewedQueryPlan
} = require("../lib/query-planner");

const input = {
  siteUrl: "https://harbor-sushi.example/",
  siteType: "restaurant",
  homepage: {
    metadata: { title: "海港鮨｜台北壽司餐廳", h1: "海港鮨", description: "台北日式料理與壽司餐廳" },
    text: "台北壽司餐廳，提供握壽司、套餐、訂位與家庭聚餐。網站製作：某某網頁設計。"
  },
  representativePages: []
};

const raw = {
  entity_name: "海港鮨",
  industry: "餐飲／日式壽司餐廳",
  primary_offering: "握壽司、日式套餐與餐廳訂位",
  topic_terms: ["壽司", "日式料理", "餐廳"],
  geography: ["台北"],
  target_audience: ["想找日式料理的消費者"],
  evidence_basis: ["首頁明確出現壽司、套餐與訂位"],
  confidence: "high",
  positioning: { perceived_category_zh: "日式壽司餐廳" },
  query_candidates: [
    { id: "q1", text: "台北適合家庭聚餐的壽司餐廳有哪些？", intent: "recommendation", consumer_relevance: 5, evidence_fit: 5 },
    { id: "q2", text: "台北壽司餐廳的套餐與單點怎麼比較？", intent: "comparison", consumer_relevance: 5, evidence_fit: 5 },
    { id: "q3", text: "台北日式料理餐廳訂位前要比較哪些資訊？", intent: "decision", consumer_relevance: 4, evidence_fit: 5 },
    { id: "q4", text: "台北想吃握壽司有哪些餐廳選擇？", intent: "recommendation", consumer_relevance: 4, evidence_fit: 4 },
    { id: "q5", text: "台北多人聚餐的日式餐廳怎麼選？", intent: "comparison", consumer_relevance: 4, evidence_fit: 4 },
    { id: "q6", text: "台北壽司餐廳是否適合帶小孩用餐？", intent: "decision", consumer_relevance: 4, evidence_fit: 4 },
    { id: "bad_brand", text: "海港鮨的套餐值得吃嗎？", intent: "decision", consumer_relevance: 5, evidence_fit: 5 },
    { id: "bad_footer", text: "台北網站設計服務推薦？", intent: "recommendation", consumer_relevance: 5, evidence_fit: 5 },
    { id: "bad_meta", text: "台北壽司餐廳 SEO 工具推薦？", intent: "recommendation", consumer_relevance: 5, evidence_fit: 5 }
  ]
};

const plan = normalizeGeoQueryPlan(raw, input);
assert.equal(plan.status, "ready");
assert.ok(plan.candidates.length >= CANDIDATE_QUERY_MIN);
assert.equal(plan.selectedQueries.length, SELECTED_QUERY_COUNT);
assert.equal(new Set(plan.selectedQueries.map((item) => item.intent)).size, 2, "selected queries should cover distinct intents when possible");
assert.equal(plan.candidates.some((item) => /海港鮨|網站設計|SEO/.test(item.text)), false, "brand, footer-vendor, and unrelated service-term leakage must be rejected");
assert.ok(plan.queryPlan.queries.every((query) => /壽司|日式|餐廳/.test(query.text)));

const visibilityToolRaw = {
  entity_name: "GeoCheck",
  industry: "AI 搜尋能見度分析工具",
  primary_offering: "GEO 與 SEO 的網站可見度檢測報告",
  topic_terms: ["AI搜尋", "搜尋能見度", "GEO"],
  geography: ["台灣"],
  target_audience: ["中小企業行銷人員"],
  evidence_basis: ["首頁說明 AI 搜尋能見度檢測"],
  confidence: "high",
  query_candidates: [
    { id: "v1", text: "中小企業要怎麼檢查 AI 搜尋能見度？", intent: "recommendation", consumer_relevance: 5, evidence_fit: 5 },
    { id: "v2", text: "GEO 與傳統 SEO 檢測工具差在哪裡？", intent: "comparison", consumer_relevance: 5, evidence_fit: 5 },
    { id: "v3", text: "選擇 AI 搜尋能見度報告前要確認哪些指標？", intent: "decision", consumer_relevance: 5, evidence_fit: 5 },
    { id: "v4", text: "SEO 團隊如何追蹤品牌在 AI 搜尋答案被採用的情況？", intent: "recommendation", consumer_relevance: 4, evidence_fit: 5 },
    { id: "v5", text: "GEO 報告的來源證據與答案採用率怎麼比較？", intent: "comparison", consumer_relevance: 4, evidence_fit: 5 }
  ]
};
const visibilityPlan = normalizeGeoQueryPlan(visibilityToolRaw, {
  siteUrl: "https://geocheck.example/",
  homepage: { metadata: { title: "GeoCheck｜AI 搜尋能見度", h1: "GeoCheck" } }
});
assert.equal(visibilityPlan.status, "ready", "service terms should be allowed only when they describe the actual business");
assert.equal(visibilityPlan.candidates.length, CANDIDATE_QUERY_MIN);

const invalid = normalizeGeoQueryPlan({ ...raw, query_candidates: raw.query_candidates.slice(0, 1) }, input);
assert.equal(invalid.status, "invalid");
assert.equal(invalid.queryPlan, null);

const reviewed = normalizeReviewedQueryPlan({
  query_set_version: "restaurant-taipei-v1",
  review_status: "approved",
  reviewed_by: "tester",
  reviewed_at: "2026-07-21",
  queries: [
    { id: "r1", text: "台北家庭聚餐壽司餐廳推薦", intent: "recommendation" },
    { id: "r2", text: "台北壽司套餐價格與內容比較", intent: "comparison" }
  ]
});
assert.equal(reviewed.status, "ready");
assert.equal(reviewed.source, "human_reviewed_frozen");
assert.equal(reviewed.queryPlan.queries.length, 2);

const prompt = buildGeoQueryPlanPrompt(input);
assert.match(prompt, /先根據頁面證據辨識網站實體/);
assert.match(prompt, /不得把網站頁尾製作商/);
assert.match(prompt, /5 到 8 個候選問題/);

console.log("query planner tests passed");
