// AI 信任值（AI Trust Index）是對外顯示的綜合指標：AI 回答中是否提到品牌，
// 以及是否引用已驗證的官方網址。它不推論 AI 模型內部的信任狀態。
const AI_TRUST_INDEX_VERSION = "1.0.0";

const WEIGHTS = Object.freeze({
  answer_adoption: 65,
  source_evidence: 35
});

const MIN_FULL_COVERAGE_QUERY_RUNS = 2;
const PARTIAL_COVERAGE_CAP = 69;

function computeAiTrustIndex(observation = {}) {
  const validRuns = Number(observation.measuredQueryCount || 0);
  const totalRuns = Number(observation.queryCount || 0);
  if (!validRuns) {
    return unknownIndex(totalRuns, Number(observation.excludedQueryCount || 0));
  }

  // These two rates are calculated over the same valid, visible-answer runs.
  // A missing citation on an answered run is a measured 0 for source evidence;
  // an unavailable/refused run is excluded rather than treated as 0.
  const answerAdoption = finitePercent(observation.mentionRate);
  const sourceEvidence = finitePercent(observation.citationRate);
  const rawScore = round(answerAdoption * 0.65 + sourceEvidence * 0.35);
  const caps = validRuns < MIN_FULL_COVERAGE_QUERY_RUNS
    ? [{ max: PARTIAL_COVERAGE_CAP, reason: "拿到可判讀回答的題數少於 2 題，資料量還不足以給高分" }]
    : [];
  const appliedCap = caps.length ? Math.min(...caps.map((item) => item.max)) : 100;
  const value = Math.min(rawScore, appliedCap);

  return {
    status: "measured",
    value,
    raw_score: rawScore,
    applied_cap: appliedCap,
    version: AI_TRUST_INDEX_VERSION,
    label: labelFor(value),
    denominator: {
      unit: "valid_visible_answer_query_run",
      valid_runs: validRuns,
      total_runs: totalRuns,
      excluded_runs: Number(observation.excludedQueryCount || 0),
      query_scope: "approved_unbranded_discovery_queries_only"
    },
    components: {
      answer_adoption: {
        value: answerAdoption,
        weight: WEIGHTS.answer_adoption,
        definition_zh: "在拿到可判讀回答的題目中，AI 有提到這個品牌的比例"
      },
      source_evidence: {
        value: sourceEvidence,
        weight: WEIGHTS.source_evidence,
        definition_zh: "在同一批回答中，AI 有引用這個品牌官網的比例"
      }
    },
    caps,
    unknown_follow_up: null,
    summary_zh: `這次的 AI 回答中，有 ${answerAdoption}% 提到你的品牌，有 ${sourceEvidence}% 直接引用你的官網，換算成 AI 信任值是 ${value} 分。`
  };
}

function unknownIndex(totalRuns, excludedRuns) {
  return {
    status: "unknown",
    value: null,
    raw_score: null,
    applied_cap: null,
    version: AI_TRUST_INDEX_VERSION,
    label: "目前無可用證據",
    denominator: {
      unit: "valid_visible_answer_query_run",
      valid_runs: 0,
      total_runs: totalRuns,
      excluded_runs: excludedRuns,
      query_scope: "approved_unbranded_discovery_queries_only"
    },
    components: {
      answer_adoption: { value: null, weight: WEIGHTS.answer_adoption },
      source_evidence: { value: null, weight: WEIGHTS.source_evidence }
    },
    caps: [],
    unknown_follow_up: "重新執行足量 query-run；若仍無可用回答，再檢查 provider、題組與網站可存取性。",
    summary_zh: "這次沒有拿到可判讀的 AI 回答，因此暫時沒有分數；沒有分數不等於 0 分。"
  };
}

function finitePercent(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function labelFor(value) {
  if (value >= 80) return "高";
  if (value >= 65) return "穩定";
  if (value >= 45) return "待改善";
  return "低";
}

module.exports = {
  AI_TRUST_INDEX_VERSION,
  MIN_FULL_COVERAGE_QUERY_RUNS,
  PARTIAL_COVERAGE_CAP,
  WEIGHTS,
  computeAiTrustIndex
};
