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
    { id: "bad_footer", text: "台北網站設計服務推薦？", intent: "recommendation", consumer_relevance: 5, evidence_fit: 5 }
  ]
};

const plan = normalizeGeoQueryPlan(raw, input);
assert.equal(plan.status, "ready");
assert.ok(plan.candidates.length >= CANDIDATE_QUERY_MIN);
assert.equal(plan.selectedQueries.length, SELECTED_QUERY_COUNT);
assert.equal(new Set(plan.selectedQueries.map((item) => item.intent)).size, 2, "selected queries should cover distinct intents when possible");
assert.equal(plan.candidates.some((item) => /海港鮨|網站設計/.test(item.text)), false, "brand and footer-vendor leakage must be rejected");
assert.ok(plan.queryPlan.queries.every((query) => /壽司|日式|餐廳/.test(query.text)));

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
