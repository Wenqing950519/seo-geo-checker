const assert = require("node:assert/strict");

const { evaluatePerplexityVisibility } = require("../../packages/geo-core/evidence/perplexity-visibility.js");
const { computeAiTrustIndex } = require("../../packages/geo-core/scoring/ai-trust-index.js");

const input = {
  siteUrl: "https://example.com/",
  metadata: {
    title: "Example Service Taiwan",
    description: "Example Service serves Taipei.",
    h1: "Example Service"
  },
  searchEvidence: {
    authority: {
      enabled: true,
      answer: "Example Service is the official brand.",
      citations: ["https://example.com/about"],
      searchResults: []
    },
    discovery: [
      {
        enabled: true,
        queryId: "q1",
        query: "Taipei local service recommendations",
        answer: "Example Service is one option.",
        citations: ["https://example.com/services"],
        searchResults: []
      },
      {
        enabled: true,
        queryId: "q2",
        query: "Taipei local service comparison",
        answer: "Another provider is commonly recommended.",
        citations: ["https://directory.example.org/providers"],
        searchResults: []
      },
      {
        enabled: true,
        queryId: "q3",
        query: "Taipei service with transparent pricing",
        answer: "I cannot answer that request.",
        citations: [],
        searchResults: []
      }
    ]
  }
};

const observation = evaluatePerplexityVisibility(input);
const index = computeAiTrustIndex(observation);

// Characterization contract: these values describe the pre-extraction behavior.
// Changing them requires an explicit scoring/parser version decision, not a refactor.
assert.deepEqual({
  observation: {
    status: observation.status,
    parserVersion: observation.parserVersion,
    mentionRate: observation.mentionRate,
    citationRate: observation.citationRate,
    queryCount: observation.queryCount,
    measuredQueryCount: observation.measuredQueryCount,
    excludedQueryCount: observation.excludedQueryCount,
    answerStatuses: observation.observations.map((item) => item.answerStatus),
    firstPartyCited: observation.observations.map((item) => item.firstPartyCited)
  },
  aiTrustIndex: {
    version: index.version,
    status: index.status,
    value: index.value,
    rawScore: index.raw_score,
    appliedCap: index.applied_cap,
    denominator: index.denominator
  }
}, {
  observation: {
    status: "measured",
    parserVersion: "2.1.0",
    mentionRate: 50,
    citationRate: 50,
    queryCount: 3,
    measuredQueryCount: 2,
    excludedQueryCount: 1,
    answerStatuses: ["answered", "answered", "refusal"],
    firstPartyCited: [true, false, false]
  },
  aiTrustIndex: {
    version: "1.0.0",
    status: "measured",
    value: 50,
    rawScore: 50,
    appliedCap: 100,
    denominator: {
      unit: "valid_visible_answer_query_run",
      valid_runs: 2,
      excluded_runs: 1,
      total_runs: 3,
      query_scope: "approved_unbranded_discovery_queries_only"
    }
  }
});

console.log("geo analysis contract tests passed");
