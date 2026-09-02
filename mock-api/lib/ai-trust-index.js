// AI Trust Index is a product-facing aggregate of observed answer adoption and
// verified first-party source capture. It intentionally does not infer an AI
// model's internal trust state.
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
    ? [{ max: PARTIAL_COVERAGE_CAP, reason: "有效 query-run 少於 2 次，覆蓋不足" }]
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
        definition_zh: "有效且可見的 AI 回答中，品牌被採用／提及的比例"
      },
      source_evidence: {
        value: sourceEvidence,
        weight: WEIGHTS.source_evidence,
        definition_zh: "同一批有效回答中，已驗證為第一方官方網域的 URL 被引用的比例"
      }
    },
    caps,
    unknown_follow_up: null,
    summary_zh: `AI 對答案的採用率 ${answerAdoption}%、已驗證官方來源的引用率 ${sourceEvidence}%；依 65%／35% 合成為 ${value} 分。`
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
    summary_zh: "本次沒有可判定的可見 AI 回答；unknown 不等於 0，也不納入白皮書分數統計。"
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
