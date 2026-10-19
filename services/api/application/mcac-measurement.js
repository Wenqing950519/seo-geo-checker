// GeoCheck MCAC measurement: read the official site, let DeepSeek plan two unbranded
// discovery questions, ask one allowlisted engine four typed questions (discovery x2,
// fact, action), then read Mention, Citation, Accuracy and Conversion-readiness
// separately. No blended score; a site that cannot be read costs no engine call.

const { fetchHomepage, fetchRepresentativePages } = require("../../../packages/crawler/html-v2.js");
const { fetchTechnicalSignals } = require("../../../packages/crawler/technical-signals.js");
const { resolveCitationRedirects } = require("../../../packages/crawler/citation-resolve.js");
const { collectScoringSignals, computeScoreV2 } = require("../../../packages/geo-core/scoring/scoring-v2.js");
const { classifySite } = require("../../../packages/geo-core/site-analyzer/site-type.js");
const {
  PARSER_VERSION,
  buildBrandTermSet,
  getRegistrableDomain,
  isSharedPlatformHost
} = require("../../../packages/geo-core/evidence/brand-match.js");
const {
  MAX_DISCOVERY_PROBES,
  MCAC_FLAG_RULES_VERSION,
  MCAC_PROBE_SET_VERSION,
  MCAC_VERSION,
  buildMcacProbes,
  evaluateMcac,
  extractSiteFacts,
  extractSiteIdentity
} = require("../../../packages/geo-core/mcac/index.js");
const { recordAiUsage } = require("../../../packages/ai-providers/usage-meter.js");
const { QUERY_PLANNER_VERSION, buildGeoQueryPlanResolved } = require("./query-planner.js");
const { createMcacEngineClient, resolveMcacEngine } = require("./mcac-engines.js");

const MCAC_PIPELINE_VERSION = `mcac-${MCAC_VERSION}-${MCAC_PROBE_SET_VERSION}-${MCAC_FLAG_RULES_VERSION}-planner${QUERY_PLANNER_VERSION}-p${PARSER_VERSION}`;
const MAX_ATTEMPTS_PER_QUESTION = 2;
// The fetcher throws the last fallback's error when every method fails, so Scrapling and
// Google Translate stages mean an unreadable site too (a Facebook page, 2026-10-20 smoke).
const FETCH_LIMITED_STAGES = new Set([
  "fetch_homepage", "browser_fetch", "browser_challenge", "crawl_quality",
  "scrapling_fetch", "translate_fetch", "translate_challenge"
]);
const RETRYABLE_CODES = new Set(["provider_rate_limited", "provider_unavailable", "provider_timeout"]);

async function measureMcacSite(siteUrl, options = {}) {
  const started = Date.now();
  const deps = {
    fetchHomepage: options.fetchHomepage || fetchHomepage,
    fetchTechnicalSignals: options.fetchTechnicalSignals || fetchTechnicalSignals,
    fetchRepresentativePages: options.fetchRepresentativePages || fetchRepresentativePages,
    resolveCitations: options.resolveCitations || resolveCitationRedirects,
    queryPlanner: options.queryPlanner || buildGeoQueryPlanResolved,
    fetchTruthPage: options.fetchTruthPage || fetchHomepage
  };
  const engine = options.engineClient
    ? { id: options.engineClient.id, profileId: options.engineClient.profileId }
    : resolveMcacEngine(options.engineName ?? process.env.GEOCHECK_MCAC_ENGINE);
  const pipelineVersion = `${MCAC_PIPELINE_VERSION}-${engine.id}`;

  let homepage;
  try {
    homepage = options.homepage || await deps.fetchHomepage(siteUrl);
  } catch (error) {
    if (FETCH_LIMITED_STAGES.has(error?.stage)) return limitedResult(siteUrl, engine, pipelineVersion, error, started);
    throw error;
  }
  if (homepage?.fetchBlocked) return limitedResult(siteUrl, engine, pipelineVersion, { stage: "fetch_homepage", message: "fetch blocked" }, started);

  const finalUrl = homepage.finalUrl || homepage.url || siteUrl;
  const host = new URL(finalUrl).hostname.toLowerCase().replace(/^www\./, "");
  const siteType = safely(() => classifySite({ url: finalUrl, metadata: homepage.metadata, text: homepage.text }), "organization");
  const technical = await safelyAsync(() => deps.fetchTechnicalSignals(siteUrl, homepage), {});
  const representativePages = await safelyAsync(() => deps.fetchRepresentativePages(technical.representativeUrls || [], 3), []);
  const signals = safely(() => collectScoringSignals({ homepage, technical, representativePages }), null);
  const siteReadiness = signals ? safely(() => computeScoreV2(signals), null) : null;

  // DeepSeek only: the planner's OpenAI/Gemini structured fallback stays off.
  const custom = cleanQuestions(options.customQueries);
  let plan = null;
  let plannerError = null;
  try {
    plan = await deps.queryPlanner({ siteUrl: finalUrl, homepage, representativePages, siteType }, {
      ...(options.queryPlannerOptions || {}),
      allowFallback: false,
      preferredQueries: custom
    });
  } catch (error) {
    plannerError = error;
  }
  const planned = plan?.status === "ready" ? cleanQuestions((plan.queryPlan?.queries || []).map((query) => query?.text ?? query)) : [];
  const discoveryQuestions = [...custom, ...planned.filter((question) => !custom.includes(question))].slice(0, MAX_DISCOVERY_PROBES);

  const identity = extractSiteIdentity(homepage.html);
  const plannedName = plan?.entity_name && !/^unknown$/i.test(plan.entity_name) ? plan.entity_name : null;
  const brandName = plannedName || identity.name || titleName(homepage.metadata);
  const location = (plan?.geography || []).find((place) => place && !/^(?:unknown|台灣|臺灣)$/i.test(place))
    || identity.locality || identity.region || "台灣";
  // A fan page lives on a shared platform: the platform's own name (the host, a "| Facebook"
  // title suffix) is not the brand, and an answer that names it is not a mention.
  const platformName = isSharedPlatformHost(host) ? getRegistrableDomain(host).split(".")[0] : "";
  const brandTerms = buildBrandTermSet({
    host,
    metadata: homepage.metadata || {},
    aliases: [brandName, identity.name, ...identity.alternateNames].filter(Boolean)
  }).filter((term) => platformName.length < 3 || !term.compact.includes(platformName));
  // Store, location and contact pages carry the numbers a chain's homepage leaves out.
  const truthUrls = pickTruthPages(homepage.internalLinks || [], finalUrl, representativePages.map((page) => page?.url));
  const truthPages = (await Promise.all(truthUrls.map((url) => safelyAsync(() => deps.fetchTruthPage(url), null)))).filter(Boolean);
  const truth = extractSiteFacts({
    html: homepage.html,
    extraHtml: truthPages.map((page) => page.html).filter(Boolean),
    texts: representativePages.map((page) => page?.text).filter(Boolean)
  });
  truth.pages = [finalUrl, ...truthPages.map((page) => page.finalUrl || page.url).filter(Boolean)];

  let probes;
  try {
    probes = buildMcacProbes({ brandName, location, siteHost: host, discoveryQuestions });
  } catch {
    // A brand name that is just the domain would hint the official site; skip the named questions.
    probes = buildMcacProbes({ brandName: "", location, siteHost: host, discoveryQuestions });
  }

  const client = probes.length ? (options.engineClient || createMcacEngineClient({ engine: engine.id })) : null;
  const results = [];
  let engineCalls = 0;
  let estimatedUsd = 0;
  for (const probe of probes) {
    if (results.length && options.pacingMs !== 0) await sleep(options.pacingMs ?? 800);
    let response = null;
    let lastError = null;
    let attempts = 0;
    while (attempts < MAX_ATTEMPTS_PER_QUESTION) {
      attempts += 1;
      engineCalls += 1;
      const callStarted = Date.now();
      try {
        response = await client.ask(probe.prompt, { timeoutMs: options.timeoutMs || 45_000 });
        recordUsage(engine, response, probe, "success", Date.now() - callStarted);
        break;
      } catch (error) {
        lastError = error;
        recordUsage(engine, null, probe, "error", Date.now() - callStarted, error);
        if (!isRetryable(error) || attempts >= MAX_ATTEMPTS_PER_QUESTION) break;
        await sleep(options.retryDelayMs ?? 1_500);
      }
    }
    estimatedUsd += costOf(response?.cost);
    results.push(response
      ? { id: probe.id, type: probe.type, query: probe.query, status: "answered", answer: response.answer, citations: response.citations, model: response.model, attempts }
      : { id: probe.id, type: probe.type, query: probe.query, status: "failed", answer: "", citations: [], attempts, error: { code: safeCode(lastError?.code || lastError?.stage) } });
  }

  const urls = results.flatMap((result) => result.citations.map((citation) => (typeof citation === "string" ? citation : citation?.url))).filter(Boolean);
  const redirects = urls.length ? await safelyAsync(() => deps.resolveCitations(urls), {}) : {};
  const evaluation = evaluateMcac({
    probes: results,
    brandTerms,
    siteHost: host,
    officialDomains: [],
    truth,
    resolveUrl: (url) => redirects?.[url] || url
  });

  return {
    method: "mcac",
    methodVersion: MCAC_VERSION,
    pipelineVersion,
    limited: false,
    siteUrl,
    finalUrl,
    engine: { id: engine.id, profileId: engine.profileId, model: results.find((result) => result.model)?.model || client?.model || null },
    planner: {
      provider: "deepseek",
      status: plan?.status || (plannerError ? "unavailable" : "unknown"),
      model: plan?.model || null,
      version: QUERY_PLANNER_VERSION,
      error: plannerError ? safeCode(plannerError.code || plannerError.stage) : null
    },
    entity: { name: brandName || null, location, terms: brandTerms.map((term) => term.value) },
    truth,
    probes: results.map(({ id, type, query, status, attempts }) => ({ id, type, query, status, attempts })),
    evaluation,
    siteType,
    homepage,
    technical,
    representativePages,
    signals,
    siteReadiness,
    usage: { engine_calls: engineCalls, estimated_usd: Math.round(estimatedUsd * 1e6) / 1e6 },
    latencyMs: Date.now() - started
  };
}

function limitedResult(siteUrl, engine, pipelineVersion, error, started) {
  return {
    method: "mcac",
    methodVersion: MCAC_VERSION,
    pipelineVersion,
    limited: true,
    limitedReason: safeCode(error?.stage || error?.code) || "fetch_homepage",
    siteUrl,
    finalUrl: siteUrl,
    engine: { id: engine.id, profileId: engine.profileId, model: null },
    planner: { provider: "deepseek", status: "skipped", model: null, version: QUERY_PLANNER_VERSION, error: null },
    entity: { name: null, location: null, terms: [] },
    truth: { phone: null, address: null, hours: null },
    probes: [],
    evaluation: evaluateMcac({ probes: [] }),
    siteType: null,
    homepage: null,
    technical: null,
    representativePages: [],
    signals: null,
    siteReadiness: null,
    usage: { engine_calls: 0, estimated_usd: 0 },
    latencyMs: Date.now() - started
  };
}

const TRUTH_PAGE_PATTERNS = [
  /\/(?:pages\/)?(?:stores?|shops?|locations?|branch(?:es)?|access|門市(?:資訊)?|分店|據點)(?:[/?#.]|$)/i,
  /\/(?:pages\/)?(?:contact(?:-?us)?|聯絡(?:我們)?)(?:[/?#.]|$)/i
];

function pickTruthPages(links, baseUrl, exclude = []) {
  let base;
  try { base = new URL(baseUrl); } catch { return []; }
  const host = base.hostname.replace(/^www\./, "");
  const seen = new Set(exclude.filter(Boolean).map((url) => String(url).replace(/[#?].*$/, "").replace(/\/$/, "")));
  const picked = [];
  for (const pattern of TRUTH_PAGE_PATTERNS) {
    for (const link of Array.isArray(links) ? links : []) {
      let url;
      try { url = new URL(String(link), base); } catch { continue; }
      if (url.hostname.replace(/^www\./, "") !== host) continue;
      let path = url.pathname;
      try { path = decodeURIComponent(path); } catch { /* keep the raw path */ }
      if (!pattern.test(path)) continue;
      const key = url.href.replace(/[#?].*$/, "").replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(url.href);
      if (picked.length >= 2) return picked;
    }
  }
  return picked;
}

function recordUsage(engine, response, probe, status, latencyMs, error) {
  try {
    const usage = response?.usage || {};
    recordAiUsage({
      provider: engine.id,
      model: response?.model || engine.profileId,
      operation: `mcac_${probe.type}`,
      status,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      totalTokens: usage.total_tokens,
      latencyMs,
      errorStage: error ? safeCode(error.code || error.stage) : undefined
    });
  } catch { /* the usage ledger must never break a measurement */ }
}

function isRetryable(error) {
  return Boolean(error?.retryable) || RETRYABLE_CODES.has(error?.code);
}

function costOf(cost) {
  if (!cost) return 0;
  const value = cost.provider_reported_usd ?? cost.estimated_usd ?? cost.estimated_max_usd;
  return Number.isFinite(value) ? value : 0;
}

function cleanQuestions(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function titleName(metadata = {}) {
  return String(metadata.h1 || metadata.title || "").split(/[|｜—–:：\-]/)[0].trim() || null;
}

function safeCode(value) {
  return /^[a-z0-9_]{1,80}$/i.test(String(value || "")) ? String(value) : "mcac_question_failed";
}

function safely(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

async function safelyAsync(fn, fallback) {
  try { return (await fn()) ?? fallback; } catch { return fallback; }
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

module.exports = { MAX_ATTEMPTS_PER_QUESTION, MCAC_PIPELINE_VERSION, measureMcacSite, pickTruthPages };
