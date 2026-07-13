const core = require("./scoring-v2-core");

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
  scored.rawScore = Math.round(scored.rawScore + addedPoints);
  scored.score = Math.min(scored.rawScore, scored.cap);
  if (scored.breakdown.semantic_clarity) {
    scored.breakdown.semantic_clarity.max += 2;
    scored.breakdown.semantic_clarity.points += addedPoints;
  }
  return scored;
}

module.exports = {
  ...core,
  computeScoreV2,
  WEIGHTS
};
