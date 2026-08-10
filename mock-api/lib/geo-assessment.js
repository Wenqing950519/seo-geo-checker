// 涵蓋 perplexity-visibility 的 40/30/0.3 公式與本檔的 20/30/50 合成與 caps。
// 任一計分規則變更都必須同步調升，讓研究資料列可辨識計分版本。
const SCORING_VERSION = "3.1.0";

function computeGeoAssessment(scored, perplexityObservation) {
  const technical = lanePercent(scored.breakdown, ["crawl_access"]);
  const citeability = lanePercent(scored.breakdown, ["content_readability", "citeability"]);
  const lanes = {
    technical_access: { score: technical, weight: 20 },
    content_citeability: { score: citeability, weight: 30 },
    perplexity_observation: { score: perplexityObservation?.score ?? null, weight: 50 }
  };

  if (!perplexityObservation || perplexityObservation.status !== "measured" || !Number.isFinite(perplexityObservation.score)) {
    return {
      score: null,
      rawScore: null,
      label: "Unknown",
      status: "insufficient_evidence",
      lanes,
      caps: [],
      summary_zh: `站內準備度為 ${scored.score} 分，但缺少 Perplexity 非品牌搜尋觀測，因此不產生整體 GEO 分數。`
    };
  }

  const rawScore = Math.round(technical * 0.2 + citeability * 0.3 + perplexityObservation.score * 0.5);
  const caps = [];
  if (perplexityObservation.mentionRate === 0 && perplexityObservation.citationRate === 0) {
    caps.push({ max: 59, reason: "Perplexity 非品牌搜尋未提及品牌且未引用官網" });
  }
  if (perplexityObservation.measuredQueryCount < 2) caps.push({ max: 69, reason: "完成的 Perplexity 實測問題少於 2 題" });
  if (citeability < 50) caps.push({ max: 69, reason: "內容可引用性不足" });
  if (scored.cap < 100) caps.push({ max: scored.cap, reason: scored.caps.map((item) => item.reason).join("、") });
  const cap = caps.length ? Math.min(...caps.map((item) => item.max)) : 100;
  const score = Math.min(rawScore, cap);
  return {
    score,
    rawScore,
    label: labelForGeoScore(score),
    status: "measured",
    lanes,
    caps,
    summary_zh: `Perplexity GEO 實測分數為 ${score} 分；非品牌問題提及率 ${perplexityObservation.mentionRate}%、官網引用率 ${perplexityObservation.citationRate}%、站內準備度 ${scored.score} 分。`
  };
}

function lanePercent(breakdown = {}, names = []) {
  const values = names.map((name) => breakdown[name]).filter(Boolean);
  const points = values.reduce((sum, value) => sum + Number(value.points || 0), 0);
  const max = values.reduce((sum, value) => sum + Number(value.max || 0), 0);
  return max ? Math.round((points / max) * 100) : 0;
}

function labelForGeoScore(score) {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Decent";
  if (score >= 45) return "Needs Work";
  return "Critical";
}

module.exports = { SCORING_VERSION, computeGeoAssessment, lanePercent };
