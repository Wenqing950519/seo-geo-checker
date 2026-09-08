const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadEnvFiles, requireEnv } = require("../../packages/shared/env.js");
const { extractMetadata, stripHtml } = require("../../packages/crawler/html-v2.js");
const { buildGeoQueryPlanPrompt } = require("../../services/api/application/query-planner.js");

// This is an evaluation-only script. It deliberately never writes a mapping from
// candidate label to provider, model, endpoint, or raw HTTP response.
loadEnvFiles();

const MAX_OUTPUT_TOKENS = 2048;
const TIMEOUT_MS = 60_000;
const args = parseArgs(process.argv.slice(2));
const requestedProviders = String(args.providers || "deepseek,gemini,openai").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
const validProviders = new Set(["deepseek", "gemini", "openai"]);
if (!requestedProviders.length || requestedProviders.some((provider) => !validProviders.has(provider))) throw new Error("--providers must contain one or more of: deepseek, gemini, openai");
const candidateLabels = shuffle(["candidate-a", "candidate-b", "candidate-c"].slice(0, requestedProviders.length));
const targetUrl = normalizeUrl(args.url || process.env.SITE_ORIGIN);
const outputDir = path.resolve(args["output-dir"] || path.join("research/outputs", `blind-model-evaluation-${stamp()}`));

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["entity_name", "industry", "primary_offering", "topic_terms", "geography", "target_audience", "evidence_basis", "confidence", "positioning", "query_candidates"],
  properties: {
    entity_name: { type: "string" },
    industry: { type: "string" },
    primary_offering: { type: "string" },
    topic_terms: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 12 },
    geography: { type: "array", items: { type: "string" }, maxItems: 8 },
    target_audience: { type: "array", items: { type: "string" }, maxItems: 8 },
    evidence_basis: { type: "array", items: { type: "string" }, maxItems: 10 },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    positioning: {
      type: "object",
      additionalProperties: false,
      required: ["perceived_category_zh", "perceived_audience_zh", "perceived_use_cases_zh", "misunderstandings_or_risks_zh", "missing_signals_zh"],
      properties: {
        perceived_category_zh: { type: "string" },
        perceived_audience_zh: { type: "array", items: { type: "string" } },
        perceived_use_cases_zh: { type: "array", items: { type: "string" } },
        misunderstandings_or_risks_zh: { type: "array", items: { type: "string" } },
        missing_signals_zh: { type: "array", items: { type: "string" } }
      }
    },
    query_candidates: {
      type: "array",
      minItems: 5,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "intent", "consumer_relevance", "evidence_fit", "rationale_zh"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          intent: { type: "string", enum: ["recommendation", "comparison", "decision"] },
          consumer_relevance: { type: "integer", minimum: 1, maximum: 5 },
          evidence_fit: { type: "integer", minimum: 1, maximum: 5 },
          rationale_zh: { type: "string" }
        }
      }
    }
  }
};

main().catch((error) => {
  console.error(`Blind evaluation failed: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const homepage = await fetchHttpOnlyEvidence(targetUrl);
  const input = {
    siteUrl: homepage.finalUrl || targetUrl,
    homepage: {
      metadata: homepage.metadata,
      text: homepage.text
    },
    representativePages: [],
    siteType: "organization"
  };
  const prompt = buildGeoQueryPlanPrompt(input);
  const evaluationId = `blind_eval_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const evidence = {
    evaluation_id: evaluationId,
    target_url: input.siteUrl,
    fetched_at: new Date().toISOString(),
    prompt_sha256: sha256(prompt),
    input_evidence: {
      title: homepage.metadata?.title || "",
      description: homepage.metadata?.description || "",
      h1: homepage.metadata?.h1 || "",
      text_excerpt: String(homepage.text || "").slice(0, 5000)
    },
    contract: "All candidates receive the identical query-planning prompt, JSON schema, max output-token budget, and one direct API call with no retries.",
    candidate_count: requestedProviders.length
  };
  writeJson(path.join(outputDir, "input-evidence.json"), evidence);

  const calls = requestedProviders.map((provider) => ({
    deepseek: callDeepSeek,
    gemini: callGemini,
    openai: callOpenAi
  })[provider](prompt));
  const settled = await Promise.allSettled(calls);
  const artifacts = settled.map((outcome, index) => toArtifact(outcome, candidateLabels[index], evaluationId, evidence));
  for (const artifact of artifacts) writeJson(path.join(outputDir, `${artifact.candidate}.json`), artifact);

  const comparison = buildComparison(artifacts, evidence);
  fs.writeFileSync(path.join(outputDir, "comparison.md"), comparison, "utf8");
  writeJson(path.join(outputDir, "comparison.json"), {
    evaluation_id: evaluationId,
    target_url: input.siteUrl,
    prompt_sha256: evidence.prompt_sha256,
    candidates: artifacts.map(({ candidate, metrics, quality, status }) => ({ candidate, status, metrics, quality }))
  });
  console.log(`Blind evaluation complete: ${outputDir}`);
}

async function callDeepSeek(prompt) {
  const response = await postJson(`${baseUrl("DEEPSEEK_BASE_URL", "https://api.deepseek.com")}/chat/completions`, {
    headers: { Authorization: `Bearer ${requireEnv("DEEPSEEK_API_KEY")}` },
    body: {
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      messages: [{ role: "system", content: "You must output valid JSON only. Do not output Markdown or explanatory text." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      thinking: { type: "disabled" }
    }
  });
  return normalizeChatResult(response.data?.choices?.[0]?.message?.content, response.data?.usage, response.latencyMs);
}

async function callGemini(prompt) {
  const base = baseUrl("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta");
  const model = encodeURIComponent(process.env.GEMINI_MODEL || "gemini-3.1-flash-lite");
  const response = await postJson(`${base}/models/${model}:generateContent?key=${encodeURIComponent(requireEnv("GEMINI_API_KEY"))}`, {
    body: {
      systemInstruction: { parts: [{ text: "You must output valid JSON only. Do not output Markdown or explanatory text." }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS, responseMimeType: "application/json", responseJsonSchema: schema }
    }
  });
  const text = (response.data?.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("");
  const usage = response.data?.usageMetadata || {};
  return normalizeChatResult(text, {
    inputTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
    totalTokens: usage.totalTokenCount,
    thoughtTokens: usage.thoughtsTokenCount
  }, response.latencyMs);
}

async function callOpenAi(prompt) {
  const response = await postJson(`${baseUrl("OPENAI_BASE_URL", "https://api.openai.com/v1")}/responses`, {
    headers: { Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}` },
    body: {
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: [{ role: "developer", content: "You must output valid JSON only. Do not output Markdown or explanatory text." }, { role: "user", content: prompt }],
      text: { format: { type: "json_schema", name: "geo_query_plan", strict: true, schema } },
      reasoning: { effort: "none" },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false
    }
  });
  const usage = response.data?.usage || {};
  return normalizeChatResult(extractOpenAiOutputText(response.data), {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
    cachedTokens: usage.input_tokens_details?.cached_tokens,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens
  }, response.latencyMs);
}

async function postJson(url, { headers = {}, body }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: controller.signal });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`HTTP ${response.status}: response was not JSON`); }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { data, latencyMs: Date.now() - started };
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`timeout after ${TIMEOUT_MS}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeChatResult(text, usage = {}, latencyMs) {
  const rawText = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  if (!rawText) throw new Error("empty model output");
  let result;
  try { result = JSON.parse(rawText); } catch { throw new Error("model output was not valid JSON"); }
  return {
    result,
    metrics: {
      latency_ms: latencyMs,
      input_tokens: numberOrNull(usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens),
      output_tokens: numberOrNull(usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens),
      total_tokens: numberOrNull(usage.total_tokens ?? usage.totalTokens),
      cached_input_tokens: numberOrNull(usage.cachedTokens),
      reasoning_tokens: numberOrNull(usage.reasoningTokens ?? usage.thoughtTokens),
      max_output_tokens: MAX_OUTPUT_TOKENS,
      api_calls: 1
    }
  };
}

// `output_text` is an SDK convenience accessor. The REST JSON response carries
// assistant text in output[].content[].text instead.
function extractOpenAiOutputText(response = {}) {
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text;
  for (const item of Array.isArray(response.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function toArtifact(outcome, candidate, evaluationId, evidence) {
  if (outcome.status === "rejected") {
    return { evaluation_id: evaluationId, candidate, status: "failed", prompt_sha256: evidence.prompt_sha256, error: "Direct API call failed; provider details intentionally withheld.", metrics: { api_calls: 1 }, quality: null, result: null };
  }
  const quality = assessQuality(outcome.value.result, evidence.target_url);
  return { evaluation_id: evaluationId, candidate, status: "success", prompt_sha256: evidence.prompt_sha256, metrics: outcome.value.metrics, quality, result: outcome.value.result };
}

function assessQuality(result, targetUrl) {
  const required = schema.required;
  const present = required.filter((key) => result && Object.prototype.hasOwnProperty.call(result, key));
  const candidates = Array.isArray(result?.query_candidates) ? result.query_candidates : [];
  const intents = [...new Set(candidates.map((item) => item?.intent).filter(Boolean))];
  const forbidden = buildForbiddenPatterns(result, targetUrl);
  const queryFailures = candidates.filter((item) => !String(item?.text || "").trim() || forbidden.some((pattern) => pattern.test(String(item?.text || "")))).length;
  const ratingsValid = candidates.every((item) => Number.isInteger(item?.consumer_relevance) && item.consumer_relevance >= 1 && item.consumer_relevance <= 5 && Number.isInteger(item?.evidence_fit) && item.evidence_fit >= 1 && item.evidence_fit <= 5);
  return {
    json_schema_required_fields_present: `${present.length}/${required.length}`,
    candidate_query_count: candidates.length,
    candidate_query_count_valid: candidates.length >= 5 && candidates.length <= 8,
    distinct_intents: intents,
    intent_diversity_valid: intents.length >= 2,
    forbidden_or_empty_query_count: queryFailures,
    query_ratings_valid: ratingsValid,
    confidence_valid: ["low", "medium", "high"].includes(result?.confidence),
    automated_contract_pass: present.length === required.length && candidates.length >= 5 && candidates.length <= 8 && intents.length >= 2 && queryFailures === 0 && ratingsValid
  };
}

function buildForbiddenPatterns(result, targetUrl) {
  const host = new URL(targetUrl).hostname.replace(/^www\./, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entity = String(result?.entity_name || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [new RegExp(host, "i"), /\bSEO\b/i, /\bGEO\b/i, /網站設計/i, entity ? new RegExp(entity, "i") : /$^/];
}

function buildComparison(artifacts, evidence) {
  const rows = artifacts.map((artifact) => {
    const m = artifact.metrics || {};
    const q = artifact.quality || {};
    return `| ${artifact.candidate} | ${artifact.status} | ${show(m.input_tokens)} | ${show(m.output_tokens)} | ${show(m.total_tokens)} | ${show(m.reasoning_tokens)} | ${show(m.latency_ms)} | ${q.automated_contract_pass === undefined ? "—" : q.automated_contract_pass ? "pass" : "fail"} | ${show(q.candidate_query_count)} | ${Array.isArray(q.distinct_intents) ? q.distinct_intents.length : "—"} | ${show(q.forbidden_or_empty_query_count)} |`;
  });
  return `# Blind model API evaluation\n\n- Target: ${evidence.target_url}\n- Evaluated at: ${evidence.fetched_at}\n- Test contract: same evidence, same query-planning prompt, same JSON schema, max ${MAX_OUTPUT_TOKENS} output tokens, one direct API call per candidate, no retries.\n- Labels are intentionally blind: this file does not disclose the provider/model mapping.\n\n| Candidate | API status | Input tokens | Output tokens | Total tokens | Reasoning/thought tokens | Latency (ms) | Contract | Queries | Intent types | Invalid queries |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |\n${rows.join("\n")}\n\n## Automated interpretation\n\n- Token counts are the provider-reported values. A missing value means that provider did not return that metric; it is not treated as zero.\n- Contract means: all required fields present, 5–8 non-empty candidate queries, at least two intents, valid 1–5 ratings, and no obvious brand/domain/SEO/GEO forbidden wording.\n- This is one controlled observation, not a statistical quality ranking. Read the candidate files blind before deciding whether to expand to a larger evaluation set.\n`;
}

function writeJson(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
async function fetchHttpOnlyEvidence(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "GeoCheck blind model evaluation/1.0 (+https://geocheck.lisheng.cv)" },
      signal: controller.signal,
      redirect: "follow"
    });
    const html = await response.text();
    if (!response.ok) throw new Error(`target returned HTTP ${response.status}`);
    const text = stripHtml(html);
    if (text.length < 100) throw new Error("target returned insufficient readable HTML");
    return { finalUrl: response.url || url, metadata: extractMetadata(html), text };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("target fetch timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function baseUrl(key, fallback) { return String(process.env[key] || fallback).replace(/\/+$/, ""); }
function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function show(value) { return value === null || value === undefined ? "—" : String(value); }
function sha256(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function stamp() { return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); }
function shuffle(values) { return values.map((value) => ({ value, sort: crypto.randomInt(0, 2 ** 31) })).sort((a, b) => a.sort - b.sort).map((item) => item.value); }
function parseArgs(tokens) { const result = {}; for (let index = 0; index < tokens.length; index += 1) { if (!tokens[index].startsWith("--")) continue; const key = tokens[index].slice(2); const value = tokens[index + 1]; if (value && !value.startsWith("--")) { result[key] = value; index += 1; } else result[key] = true; } return result; }
function normalizeUrl(value) { const url = new URL(String(value || "")); if (!/^https?:$/.test(url.protocol)) throw new Error("Target URL must use HTTP(S)"); return url.toString(); }
