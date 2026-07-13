const core = require("./real-lite-audit-v2-core");
const { fetchHomepage } = require("./html-v2");
const { fetchTechnicalSignals } = require("./technical-signals");

async function runRealLiteAudit(siteUrl) {
  try {
    return await core.runRealLiteAudit(siteUrl);
  } catch (error) {
    if (!isModelProviderFailure(error)) throw error;
    return runDeterministicFallback(siteUrl, error);
  }
}

async function runDeterministicFallback(siteUrl, providerError) {
  const startedAt = Date.now();
  const homepage = await fetchHomepage(siteUrl);
  const technical = await fetchTechnicalSignals(siteUrl, homepage);
  const audit = core.applyV2Audit({
    score: { summary_zh: "技術與內容規則已完成；AI 定位解讀暫時無法使用，因此未用猜測補值。" },
    positioning: {
      perceived_category_zh: "未知",
      perceived_audience_zh: [],
      perceived_use_cases_zh: [],
      misunderstandings_or_risks_zh: ["語言模型暫時無法使用，定位與受眾判讀未執行。"],
      missing_signals_zh: [],
      confidence: "low"
    },
    technical_seo: { issues: [] },
    geo_questions: [
      { question_zh: "這間店提供什麼服務，適合誰？", intent: "awareness", business_value: 3 },
      { question_zh: "這間店與附近同類店家有什麼差別？", intent: "consideration", business_value: 3 },
      { question_zh: "如何預約、購買或聯絡這間店？", intent: "decision", business_value: 4 }
    ],
    content_citeability: { strengths_zh: [], gaps_zh: [] },
    priority_actions: [],
    limitations_zh: [
      `AI 定位解讀暫停：${safeProviderMessage(providerError)}。客觀分數不受影響。`
    ]
  }, { homepage, technical });

  return {
    id: `real_lite_${Date.now()}`,
    url: siteUrl,
    createdAt: new Date().toISOString(),
    algorithmVersion: "2.0",
    provider: "local-deterministic-fallback",
    model: "rules-v2",
    latencyMs: Date.now() - startedAt,
    attempts: 0,
    repairedJson: false,
    homepage: {
      metadata: homepage.metadata,
      textLength: homepage.text.length,
      initialTextLength: homepage.initialTextLength,
      renderGain: homepage.renderGain || 0,
      renderAttempted: Boolean(homepage.renderAttempted),
      fetchMethod: homepage.fetchMethod || "http",
      statusCode: homepage.statusCode
    },
    technical,
    search: { enabled: false, fallbackReason: "model_provider_unavailable" },
    audit
  };
}

function isModelProviderFailure(error) {
  return error && ["agnes_api", "agnes_parse", "agnes_config"].includes(error.stage);
}

function safeProviderMessage(error) {
  if (error?.stage === "agnes_config") return "未設定 AI 供應商";
  if (error?.stage === "agnes_parse") return "AI 回傳格式無法解析";
  return "AI 供應商暫時連線失敗";
}

module.exports = {
  ...core,
  runRealLiteAudit
};
