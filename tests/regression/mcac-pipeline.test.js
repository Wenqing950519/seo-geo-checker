const assert = require("node:assert/strict");
const { MCAC_ENGINES, resolveMcacEngine, createMcacEngineClient } = require("../../services/api/application/mcac-engines.js");
const { measureMcacSite, MCAC_PIPELINE_VERSION, pickTruthPages } = require("../../services/api/application/mcac-measurement.js");
const { runMcacAudit } = require("../../apps/web/report/mcac-audit.js");
const { resolveAuditMethod } = require("../../apps/web/report/real-lite-audit.js");
const { mcacReportHtml } = require("../../apps/web/report/mcac-report-html.js");
const { reportHtml } = require("../../services/api/server.js");

// GeoCheck runs exactly two engine combinations: DeepSeek planning with either
// Perplexity Sonar or Gemini Flash answering. Nothing else may be switched on.

(async () => {
  // ---------------------------------------------------------------------------
  // 1. Engine allowlist
  // ---------------------------------------------------------------------------
  assert.deepEqual(Object.keys(MCAC_ENGINES).sort(), ["gemini", "perplexity"]);
  assert.equal(resolveMcacEngine().id, "perplexity", "Perplexity is the default, as in the published research");
  assert.equal(resolveMcacEngine("gemini").profileId, "google-web");
  for (const name of ["openai", "anthropic", "openai-web", "all", "perplexity,gemini"]) {
    assert.throws(() => resolveMcacEngine(name), (error) => error.code === "mcac_engine_not_allowed", `${name} must be refused`);
  }

  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    if (String(url).includes("generativelanguage")) {
      return new Response(JSON.stringify({
        output_text: "ADDRESS: 台北市大安區仁愛路四段27巷3號；PHONE: 02-2700-1234",
        output: { content: [{ type: "text", text: "x", annotations: [{ type: "url_citation", url: "https://example-noodle.tw/contact" }] }] },
        usage: { input_tokens: 40, output_tokens: 20, total_tokens: 60, grounding_tool_count: [{ type: "google_search", count: 1 }] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      model: "sonar",
      choices: [{ message: { content: "1. 範例牛肉麵" }, finish_reason: "stop" }],
      citations: ["https://food-blog.example/a"],
      search_results: [{ url: "https://food-blog.example/a", title: "a" }],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40, num_search_queries: 1 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  // Only the chosen engine's key is needed; OpenAI and Anthropic keys are never read.
  const gemini = createMcacEngineClient({ engine: "gemini", config: { GEMINI_API_KEY: "test-gemini" }, fetch: fakeFetch });
  const geminiAnswer = await gemini.ask("請查證台北的「範例牛肉麵」目前地址與電話。");
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.deepEqual(calls[0].body.tools, [{ type: "google_search" }], "Gemini answers with Google Search grounding");
  assert.equal(geminiAnswer.citations[0].url, "https://example-noodle.tw/contact");
  const perplexity = createMcacEngineClient({ engine: "perplexity", config: { PERPLEXITY_API_KEY: "test-pplx" }, fetch: fakeFetch });
  const perplexityAnswer = await perplexity.ask("台北牛肉麵推薦？");
  assert.match(calls[1].url, /api\.perplexity\.ai/);
  assert.equal(perplexityAnswer.answer, "1. 範例牛肉麵");
  assert.throws(() => createMcacEngineClient({ engine: "gemini", config: { PERPLEXITY_API_KEY: "x" }, fetch: fakeFetch }),
    (error) => error.code === "missing_provider_api_keys");

  // ---------------------------------------------------------------------------
  // 2. The pipeline: DeepSeek only for planning, four typed questions, one retry max
  // ---------------------------------------------------------------------------
  const siteHtml = `<html><head><title>範例牛肉麵｜台北大安</title>
    <script type="application/ld+json">{"@type":"Restaurant","name":"範例牛肉麵","telephone":"02-2700-1234",
    "address":{"addressRegion":"台北市","addressLocality":"大安區","streetAddress":"仁愛路四段27巷3號"}}</script></head>
    <body><h1>範例牛肉麵</h1><p>紅燒牛肉麵專賣</p></body></html>`;
  const deps = (overrides = {}) => {
    const log = { plannerOptions: null, prompts: [], attempts: 0 };
    let failedOnce = false;
    return {
      log,
      options: {
        engineName: "perplexity",
        pacingMs: 0,
        retryDelayMs: 0,
        fetchHomepage: async (url) => ({ url, finalUrl: url, html: siteHtml, text: "範例牛肉麵 紅燒牛肉麵專賣", metadata: { title: "範例牛肉麵｜台北大安", h1: "範例牛肉麵", description: "紅燒牛肉麵" }, internalLinks: [], statusCode: 200, crawlQuality: { status: "good", scorable: true } }),
        fetchTechnicalSignals: async () => ({ representativeUrls: [], robots: {}, sitemap: {} }),
        fetchRepresentativePages: async () => [{ url: "https://example-noodle.tw/contact", text: "電話：02-2700-1234", metadata: {} }],
        resolveCitations: async () => ({}),
        queryPlanner: async (input, options) => {
          log.plannerOptions = options;
          return {
            status: "ready", entity_name: "範例牛肉麵", industry: "餐飲", geography: ["台北"], confidence: "high",
            provider: "deepseek", model: "deepseek-v4-flash",
            queryPlan: { query_set_version: "dynamic", queries: [
              { id: "q1", text: "台北市有哪些值得專程吃的牛肉麵店？", intent: "recommendation" },
              { id: "q2", text: "台北牛肉麵要怎麼挑？", intent: "decision" },
              { id: "q3", text: "台北牛肉麵哪家湯頭最好？", intent: "comparison" },
              { id: "q4", text: "第四題", intent: "recommendation" }
            ] }
          };
        },
        engineClient: {
          id: "perplexity", profileId: "perplexity-sonar", model: "sonar",
          ask: async (prompt) => {
            log.attempts += 1;
            log.prompts.push(prompt);
            if (!failedOnce && /台北市有哪些/.test(prompt)) { failedOnce = true; throw Object.assign(new Error("rate limited"), { code: "provider_rate_limited" }); }
            if (/ADDRESS:/.test(prompt)) return { answer: "ADDRESS: 台北市大安區仁愛路四段27巷3號；PHONE: 02-2700-1234", citations: [{ url: "https://example-noodle.tw/contact" }], usage: { total_tokens: 50 }, cost: { estimated_usd: 0.006 } };
            if (/ACTION:/.test(prompt)) return { answer: "ACTION: 電話 | 02-2700-1234 | 品牌自有", citations: [], usage: { total_tokens: 40 }, cost: { estimated_usd: 0.006 } };
            return { answer: "1. 林東芳牛肉麵\n2. 範例牛肉麵", citations: [{ url: "https://food-blog.example/a" }], usage: { total_tokens: 60 }, cost: { estimated_usd: 0.006 } };
          }
        },
        ...overrides
      }
    };
  };

  const run = deps();
  const result = await measureMcacSite("https://example-noodle.tw/", run.options);
  assert.equal(run.log.plannerOptions.allowFallback, false, "planning never falls back to OpenAI or Gemini structured calls");
  assert.equal(run.log.attempts, 5, "four questions plus one retry after a retryable failure");
  assert.ok(run.log.prompts.every((prompt) => !prompt.includes("example-noodle.tw")), "no question hints the official domain");
  assert.equal(result.engine.id, "perplexity");
  assert.equal(result.planner.provider, "deepseek");
  assert.equal(result.evaluation.total, null);
  assert.equal(result.evaluation.mention.flag, "yes");
  assert.equal(result.evaluation.accuracy.flag, "correct");
  assert.equal(result.evaluation.conversion.flag, "yes");
  assert.equal(result.truth.phone.source, "json_ld");
  assert.equal(result.usage.engine_calls, 5);
  assert.match(MCAC_PIPELINE_VERSION, /^mcac-0\.1\.0/);

  // Store and contact pages extend the official reference values (chains list store
  // lines away from the homepage); other hosts and unrelated pages are not fetched.
  assert.deepEqual(pickTruthPages([
    "https://example-noodle.tw/about",
    "https://example-noodle.tw/pages/contact-us",
    "https://example-noodle.tw/pages/store",
    "https://example-noodle.tw/%E9%96%80%E5%B8%82",
    "https://other.example/store"
  ], "https://example-noodle.tw/"), ["https://example-noodle.tw/pages/store", "https://example-noodle.tw/%E9%96%80%E5%B8%82"],
  "store pages first, at most two, same host only");
  const fetchedTruth = [];
  const chain = deps({
    fetchHomepage: async (url) => ({ url, finalUrl: url, html: siteHtml.replace(/"telephone":"02-2700-1234",/, ""), text: "範例牛肉麵", metadata: { title: "範例牛肉麵", h1: "範例牛肉麵" },
      internalLinks: ["https://example-noodle.tw/pages/store", "https://example-noodle.tw/blog/1"], statusCode: 200, crawlQuality: { status: "good", scorable: true } }),
    fetchTruthPage: async (url) => { fetchedTruth.push(url); return { url, finalUrl: url, html: "<p>大安店 電話 02-2700-1234</p><p>信義店 電話 02-2700-9876</p>" }; }
  });
  const chainResult = await measureMcacSite("https://example-noodle.tw/", chain.options);
  assert.deepEqual(fetchedTruth, ["https://example-noodle.tw/pages/store"]);
  assert.equal(chainResult.truth.phone.values.length, 2, "both store lines are official reference values");
  assert.equal(chainResult.evaluation.accuracy.fields.phone, "correct");

  // Custom questions replace planned discovery questions (two at most).
  const custom = deps();
  const customResult = await measureMcacSite("https://example-noodle.tw/", { ...custom.options, customQueries: ["自訂一？", "自訂二？", "自訂三？"] });
  assert.deepEqual(customResult.probes.filter((p) => p.type === "discovery").map((p) => p.query), ["自訂一？", "自訂二？"]);

  // If DeepSeek fails, discovery is unknown but fact and action still run on the site's own name.
  const plannerDown = deps({ queryPlanner: async () => { throw Object.assign(new Error("deepseek down"), { stage: "deepseek_api" }); } });
  const downResult = await measureMcacSite("https://example-noodle.tw/", plannerDown.options);
  assert.equal(downResult.evaluation.mention.flag, "unknown");
  assert.deepEqual(downResult.probes.map((p) => p.type), ["fact", "action"]);
  assert.equal(downResult.entity.name, "範例牛肉麵", "the JSON-LD name stands in for the planner's entity name");

  // A site that cannot be read costs nothing: no engine call, everything unknown.
  const blocked = deps({ fetchHomepage: async () => { throw Object.assign(new Error("blocked"), { stage: "fetch_homepage" }); } });
  const blockedResult = await measureMcacSite("https://example-noodle.tw/", blocked.options);
  assert.equal(blocked.log.attempts, 0);
  assert.equal(blockedResult.limited, true);
  assert.equal(blockedResult.evaluation.accuracy.flag, "unknown");

  // When every fetch method fails, the error comes from the last fallback (Google Translate or
  // Scrapling). A Facebook fan page did this in the 2026-10-20 smoke; it is still an unreadable
  // site, not a failed audit.
  for (const stage of ["translate_fetch", "translate_challenge", "scrapling_fetch"]) {
    const fallback = deps({ fetchHomepage: async () => { throw Object.assign(new Error("fallback failed"), { stage }); } });
    const fallbackResult = await measureMcacSite("https://www.facebook.com/pages/example/1", fallback.options);
    assert.equal(fallback.log.attempts, 0, `${stage} costs no engine call`);
    assert.equal(fallbackResult.limited, true, `${stage} returns the limited result`);
    assert.equal(fallbackResult.limitedReason, stage);
  }

  // A fan page lives on a shared platform: the platform's name (host, "| Facebook" title
  // suffix) is not the brand, so an answer that names Facebook does not mention the shop.
  const fanTitle = "範例牛肉麵 - 舊名牛肉麵 | Facebook";
  const fanPage = deps({
    fetchHomepage: async (url) => ({ url, finalUrl: url, html: `<html><head><title>${fanTitle}</title></head><body>範例牛肉麵 電話 02 2700 1234</body></html>`,
      text: "範例牛肉麵 電話 02 2700 1234", metadata: { title: fanTitle, h1: "" }, internalLinks: [], statusCode: 200, crawlQuality: { status: "complete", scorable: true } }),
    queryPlanner: async () => ({ status: "ready", entity_name: "範例牛肉麵", geography: ["台北"],
      queryPlan: { queries: [{ text: "台北牛肉麵推薦？" }, { text: "台北牛肉麵怎麼挑？" }] } }),
    engineClient: { id: "perplexity", profileId: "perplexity-sonar", model: "sonar",
      ask: async (prompt) => (/ADDRESS:|ACTION:/.test(prompt)
        ? { answer: "UNKNOWN", citations: [], usage: {}, cost: null }
        : { answer: "1. 林東芳牛肉麵（營業時間可到 Facebook 粉專查看）", citations: [], usage: {}, cost: null }) }
  });
  const fanResult = await measureMcacSite("https://www.facebook.com/example-noodle", fanPage.options);
  assert.ok(!fanResult.entity.terms.some((term) => /facebook/i.test(term)), "the platform is not a brand term");
  assert.ok(fanResult.entity.terms.includes("舊名牛肉麵"), "the page's own names still count");
  assert.equal(fanResult.evaluation.mention.flag, "no", "naming Facebook is not mentioning the shop");
  assert.equal(fanResult.evaluation.citation.flag, "unknown", "a platform page cannot be credited as the official source");

  // ---------------------------------------------------------------------------
  // 3. Report: method mcac, no blended score, no AI Trust Index
  // ---------------------------------------------------------------------------
  const report = await runMcacAudit("https://example-noodle.tw/", deps().options);
  assert.match(report.id, /^real_lite_/);
  assert.equal(report.method, "mcac");
  assert.equal(report.algorithmVersion, "mcac-0.1.0");
  assert.equal(report.mcac.total, null);
  assert.match(report.pipelineVersion, /perplexity/);
  assert.ok(!JSON.stringify(report).includes("ai_trust"), "an MCAC report carries no AI Trust Index fields");
  assert.ok(Array.isArray(report.siteChecks.issues), "site checks stay, unscored");

  assert.equal(resolveAuditMethod("mcac"), "mcac");
  assert.equal(resolveAuditMethod(""), "classic");
  assert.equal(resolveAuditMethod(undefined), "classic");
  assert.throws(() => resolveAuditMethod("both"), /GEOCHECK_METHOD/);

  // ---------------------------------------------------------------------------
  // 4. Report page: four rows read separately, raw answers escaped
  // ---------------------------------------------------------------------------
  report.mcac.probes[0].answer = '<script>alert("x")</script> 範例牛肉麵';
  const html = mcacReportHtml(report);
  for (const label of ["提及", "引用來源", "資訊正確性", "行動資訊"]) assert.match(html, new RegExp(label), `the report shows ${label}`);
  assert.match(html, /不合成總分/);
  assert.doesNotMatch(html, /AI 信任值|65%|35%/, "the MCAC report never shows the old blended score");
  assert.doesNotMatch(html, /<script>alert/, "AI answers are escaped");
  assert.match(html, /&lt;script&gt;/);
  assert.equal(reportHtml(report), html, "the shared renderer dispatches MCAC reports to the MCAC page");

  // ---------------------------------------------------------------------------
  // 5. Deployment config: MCAC with one allowlisted engine, a cache key that changes
  //    with method and engine, one queue retry, a daily ceiling, admission still off.
  // ---------------------------------------------------------------------------
  const fs = require("node:fs");
  const path = require("node:path");
  const wrangler = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../services/cloudflare/audit/wrangler.jsonc"), "utf8")
    .replace(/^\s*\/\/.*$/gm, ""));
  assert.equal(wrangler.vars.GEOCHECK_METHOD, "mcac");
  assert.ok(Object.keys(MCAC_ENGINES).includes(wrangler.vars.GEOCHECK_MCAC_ENGINE), "the deployed engine is on the allowlist");
  assert.equal(wrangler.vars.AUDIT_PIPELINE_VERSION, `${MCAC_PIPELINE_VERSION}-${wrangler.vars.GEOCHECK_MCAC_ENGINE}`,
    "the Worker cache key must match the container's MCAC pipeline version");
  assert.equal(wrangler.vars.AUDIT_ADMISSION_ENABLED, "false", "MCAC ships closed until the paid smoke test passes");
  assert.ok(Number(wrangler.vars.AUDIT_DAILY_LIMIT) > 0);
  assert.equal(wrangler.queues.consumers[0].max_retries, 1, "a failed audit is retried once, not three times");
  const workerSource = fs.readFileSync(path.resolve(__dirname, "../../services/cloudflare/audit/src/worker.js"), "utf8");
  for (const name of ["GEOCHECK_METHOD", "GEOCHECK_MCAC_ENGINE", "GEMINI_API_KEY", "PERPLEXITY_API_KEY", "DEEPSEEK_API_KEY"]) {
    assert.ok(workerSource.includes(`${name}: workerEnv.${name}`), `the container receives ${name}`);
  }
  assert.doesNotMatch(workerSource, /OPENAI_API_KEY|ANTHROPIC_API_KEY/, "no other engine key reaches the GeoCheck container");
  assert.match(workerSource, /daily_limit_reached/);

  console.log("MCAC pipeline tests passed");
  // Requiring services/api/server.js starts its local HTTP server; end explicitly.
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
