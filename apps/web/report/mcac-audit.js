// Builds the stored GeoCheck report for an MCAC measurement. The report carries the
// four MCAC results and the unscored site checks; it has no blended score.

const { randomUUID } = require("node:crypto");
const { measureMcacSite } = require("../../../services/api/application/mcac-measurement.js");
const { MCAC_PROBE_SET_VERSION, MCAC_VERSION } = require("../../../packages/geo-core/mcac/index.js");
const {
  buildDeterministicActions,
  buildDeterministicCiteability,
  buildDeterministicIssues,
  rankDeterministicActions
} = require("./real-lite-audit-v2-core.js");

async function runMcacAudit(siteUrl, options = {}) {
  const measurement = await measureMcacSite(siteUrl, options);
  const signals = measurement.signals;
  return {
    id: `real_lite_${randomUUID()}`,
    url: siteUrl,
    finalUrl: measurement.finalUrl,
    createdAt: new Date().toISOString(),
    method: "mcac",
    algorithmVersion: `mcac-${MCAC_VERSION}`,
    pipelineVersion: measurement.pipelineVersion,
    probeSetVersion: MCAC_PROBE_SET_VERSION,
    provider: measurement.engine.id,
    model: measurement.engine.model || measurement.engine.profileId,
    interpretationProvider: measurement.planner.provider,
    interpretationModel: measurement.planner.model,
    latencyMs: measurement.latencyMs,
    limited: measurement.limited,
    limitedReason: measurement.limitedReason || null,
    engine: measurement.engine,
    planner: measurement.planner,
    entity: measurement.entity,
    truth: measurement.truth,
    mcac: measurement.evaluation,
    siteChecks: signals ? {
      readiness: Number.isFinite(measurement.siteReadiness?.score) ? measurement.siteReadiness.score : null,
      issues: safeList(() => buildDeterministicIssues(signals)),
      citeability: safeValue(() => buildDeterministicCiteability(signals), { strengths_zh: [], gaps_zh: [] }),
      actions: safeList(() => rankDeterministicActions(buildDeterministicActions(signals)))
    } : { readiness: null, issues: [], citeability: { strengths_zh: [], gaps_zh: [] }, actions: [] },
    homepage: measurement.homepage ? {
      metadata: measurement.homepage.metadata,
      statusCode: measurement.homepage.statusCode,
      fetchMethod: measurement.homepage.fetchMethod || "http",
      crawlQuality: measurement.homepage.crawlQuality
    } : null,
    usage: measurement.usage
  };
}

function safeList(fn) {
  try { return fn() || []; } catch { return []; }
}

function safeValue(fn, fallback) {
  try { return fn() || fallback; } catch { return fallback; }
}

module.exports = { runMcacAudit };
