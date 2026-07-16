const core = require("./scoring-v2-core");

const ALGORITHM_VERSION = "3.0.0";

const WEIGHTS = Object.freeze({
  ...core.WEIGHTS,
  valid_schema: 3,
  relevant_schema: 3
});

function computeScoreV2(signals) {
  const scored = core.computeScoreV2(signals);
  let addedPoints = 0;
  for (const id of ["valid_schema", "relevant_schema"]) {
    const check = scored.checks.find((item) => item.id === id);
    if (!check) continue;
    check.weight = WEIGHTS[id];
    if (check.status === "pass") {
      check.points += 1;
      addedPoints += 1;
    }
  }
  if (scored.breakdown.semantic_clarity) {
    scored.breakdown.semantic_clarity.max += 2;
    scored.breakdown.semantic_clarity.points += addedPoints;
  }
  const totalWeight = scored.checks.reduce((sum, check) => sum + check.weight, 0);
  const knownChecks = scored.checks.filter((check) => check.status !== "unknown");
  const knownWeight = knownChecks.reduce((sum, check) => sum + check.weight, 0);
  const knownPoints = knownChecks.reduce((sum, check) => sum + check.points, 0);
  scored.rawScore = knownWeight ? Math.round((knownPoints / knownWeight) * 100) : 0;
  scored.score = Math.min(scored.rawScore, scored.cap);
  scored.evidenceCoverage = totalWeight ? Math.round((knownWeight / totalWeight) * 1000) / 10 : 0;
  scored.evidenceConfidence = scored.evidenceCoverage >= 95 ? "high" : scored.evidenceCoverage >= 80 ? "medium" : "low";
  return scored;
}

module.exports = {
  ...core,
  computeScoreV2,
  WEIGHTS,
  ALGORITHM_VERSION
};
