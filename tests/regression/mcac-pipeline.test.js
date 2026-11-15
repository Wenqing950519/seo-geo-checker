const assert = require("node:assert/strict");
const { MCAC_ENGINES, resolveMcacEngine, createMcacEngineClient } = require("../../services/api/application/mcac-engines.js");
const { measureMcacSite, MCAC_PIPELINE_VERSION, pickTruthPages } = require("../../services/api/application/mcac-measurement.js");
const { runMcacAudit } = require("../../apps/web/report/mcac-audit.js");
const { resolveAuditMethod } = require("../../apps/web/report/real-lite-audit.js");
const { mcacReportHtml, mcacReportMarkdown } = require("../../apps/web/report/mcac-report-html.js");
const { reportHtml, reportMarkdown } = require("../../services/api/server.js");
const { KNOWN_REDIRECTORS } = require("../../packages/crawler/citation-resolve.js");

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
    const log = { plannerOptions: null, prompts: [], askOptions: [], attempts: 0 };
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
              { id: "q4", text: "台北有哪些牛肉麵老店推薦？", intent: "recommendation" }
            ] }
          };
        },
        engineClient: {
          id: "perplexity", profileId: "perplexity-sonar", model: "sonar",
          ask: async (prompt, options) => {
            log.attempts += 1;
            log.prompts.push(prompt);
            log.askOptions.push(options || {});
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
  assert.match(MCAC_PIPELINE_VERSION, /^mcac-0\.2\.0-mcac-probes-0\.2\.0/);

  // Discovery asks "which ones would you recommend" (report appendix A): the planner mixes
  // intents for Classic, so recommendation questions come first (2026-10-20 decision).
  assert.deepEqual(result.probes.filter((p) => p.type === "discovery").map((p) => p.query),
    ["台北市有哪些值得專程吃的牛肉麵店？", "台北有哪些牛肉麵老店推薦？"]);
  // Ten options with reasons and sources ran past 1,024 output tokens in 10 of 16 smoke
  // answers, so discovery answers get 2,048; fact and action answers stay short.
  run.log.prompts.forEach((prompt, index) => {
    const limit = run.log.askOptions[index].maxOutputTokens;
    if (/請列出最多 10 個選項/.test(prompt)) assert.equal(limit, 2048, "a discovery answer has room for ten options");
    else assert.equal(limit ?? 1024, 1024, "fact and action answers keep the default limit");
  });
  const rated = deps({
    queryPlanner: async () => ({
      status: "ready", entity_name: "範例牛肉麵", geography: ["台北"],
      candidates: [
        { text: "台北牛肉麵和拉麵哪個適合宵夜？", intent: "comparison", consumer_relevance: 5, evidence_fit: 5 },
        { text: "台北有哪些值得專程吃的牛肉麵店？", intent: "recommendation", consumer_relevance: 5, evidence_fit: 5 },
        { text: "台北有哪些值得專程去吃的牛肉麵店？", intent: "recommendation", consumer_relevance: 5, evidence_fit: 4 },
        { text: "台北米其林推薦的牛肉麵有哪些？", intent: "recommendation", consumer_relevance: 4, evidence_fit: 4 }
      ],
      queryPlan: { queries: [{ text: "台北有哪些值得專程吃的牛肉麵店？", intent: "recommendation" }, { text: "台北牛肉麵和拉麵哪個適合宵夜？", intent: "comparison" }] }
    })
  });
  const ratedResult = await measureMcacSite("https://example-noodle.tw/", rated.options);
  assert.deepEqual(ratedResult.probes.filter((p) => p.type === "discovery").map((p) => p.query),
    ["台北有哪些值得專程吃的牛肉麵店？", "台北米其林推薦的牛肉麵有哪些？"],
    "best-rated recommendation candidates first, near-duplicates skipped, other intents only to fill a gap");

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
  // Without JSON-LD the page title names the business; an h1 is often a slogan
  // (noodle3.com.tw: title 天下三絕, h1 牛肉麵界的勞斯萊斯; 2026-10-20 container check).
  const sloganH1 = deps({
    queryPlanner: async () => { throw Object.assign(new Error("deepseek down"), { stage: "deepseek_api" }); },
    fetchHomepage: async (url) => ({ url, finalUrl: url, html: "<html><head><title>範例牛肉麵</title></head><body><h1>牛肉麵界的勞斯萊斯</h1></body></html>",
      text: "牛肉麵界的勞斯萊斯", metadata: { title: "範例牛肉麵", h1: "牛肉麵界的勞斯萊斯" }, internalLinks: [], statusCode: 200, crawlQuality: { status: "good", scorable: true } })
  });
  assert.equal((await measureMcacSite("https://example-noodle.tw/", sloganH1.options)).entity.name, "範例牛肉麵");
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

  // Gemini cites through Google's grounding redirector and names the source domain in the
  // title (2026-10-20 smoke). Redirects are followed; when one cannot be, the title still
  // tells the official site apart, so Citation is not stuck at "no" on Gemini.
  assert.ok(KNOWN_REDIRECTORS.has("vertexaisearch.cloud.google.com"));
  const redirectUrl = (id) => `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${id}`;
  let resolverOptions = null;
  let resolverUrls = [];
  const grounded = deps({
    resolveCitations: async (urls, options) => {
      resolverOptions = options;
      resolverUrls = urls;
      return { [redirectUrl("followed")]: "https://example-noodle.tw/menu", [redirectUrl("site-link")]: "https://www.example-noodle.tw/" };
    },
    engineClient: { id: "gemini", profileId: "google-web", model: "gemini-3.5-flash-lite",
      ask: async (prompt) => {
        if (/ADDRESS:/.test(prompt)) return { answer: "ADDRESS: 台北市大安區仁愛路四段27巷3號；PHONE: 02-2700-1234", citations: [{ url: redirectUrl("title-only"), title: "example-noodle.tw" }], usage: {}, cost: null };
        // Gemini sometimes writes a grounding redirect, not the site, as the official website.
        if (/ACTION:/.test(prompt)) return { answer: `ACTION: 電話 | 02-2700-1234 | 品牌自有\nACTION: 官方網站 | ${redirectUrl("site-link")} | 品牌自有`, citations: [{ url: redirectUrl("followed"), title: "example-noodle.tw" }], usage: {}, cost: null };
        return { answer: "1. 範例牛肉麵", citations: [{ url: redirectUrl("blog"), title: "food-blog.example" }, { url: redirectUrl("not-a-domain"), title: "美食部落格" }], usage: {}, cost: null };
      } }
  });
  const groundedResult = await measureMcacSite("https://example-noodle.tw/", grounded.options);
  assert.ok(resolverOptions?.limit >= 40, "every grounding redirect of the four questions is followed, not just the first eight");
  const groundedSources = groundedResult.evaluation.probes.flatMap((probe) => probe.sources);
  assert.ok(groundedSources.some((source) => source.url === "https://example-noodle.tw/menu" && source.type === "official"), "a followed redirect is classified by its target");
  assert.ok(groundedSources.some((source) => source.url === "https://example-noodle.tw/" && source.type === "official"), "an unfollowed redirect falls back to the domain in its title");
  assert.ok(groundedSources.some((source) => source.url === redirectUrl("not-a-domain") && source.type === "other"), "a title that is not a domain is not trusted");
  assert.equal(groundedResult.evaluation.citation.flag, "yes");
  assert.equal(groundedResult.evaluation.citation.official_probes, 2);
  assert.ok(resolverUrls.includes(redirectUrl("site-link")), "redirects written into an answer are followed too");
  const website = groundedResult.evaluation.conversion.actions.find((action) => action.type === "website");
  assert.deepEqual([website.target, website.official], ["https://www.example-noodle.tw/", true], "the action shows and credits where the redirect leads");
  assert.equal(groundedResult.evaluation.conversion.official_entry, true);

  // ---------------------------------------------------------------------------
  // 3. Report: method mcac, no blended score, no AI Trust Index
  // ---------------------------------------------------------------------------
  const report = await runMcacAudit("https://example-noodle.tw/", deps().options);
  assert.match(report.id, /^real_lite_/);
  assert.equal(report.method, "mcac");
  assert.equal(report.algorithmVersion, "mcac-0.2.0");
  assert.equal(report.mcac.total, null);
  assert.match(report.pipelineVersion, /perplexity/);
  assert.ok(!JSON.stringify(report).includes("ai_trust"), "an MCAC report carries no AI Trust Index fields");
  assert.ok(Array.isArray(report.siteChecks.issues), "site checks stay, unscored");
  assert.ok(Array.isArray(report.siteChecks.checks) && report.siteChecks.checks.length > 0, "site checks expose deterministic check rows");
  assert.equal(typeof report.mcac.score?.value, "number", "MCAC evaluation carries 0-100 visibility score");

  assert.equal(resolveAuditMethod("mcac"), "mcac");
  assert.equal(resolveAuditMethod(""), "classic");
  assert.equal(resolveAuditMethod(undefined), "classic");
  assert.throws(() => resolveAuditMethod("both"), /GEOCHECK_METHOD/);

  // ---------------------------------------------------------------------------
  // 4. Report page: AI visibility score, four rows, green/gray site checklist, export
  // ---------------------------------------------------------------------------
  report.mcac.probes[0].answer = '<script>alert("x")</script> 範例牛肉麵';
  const html = mcacReportHtml(report);
  for (const label of ["提及", "引用來源", "資訊正確性", "行動資訊"]) assert.match(html, new RegExp(label), `the report shows ${label}`);
  assert.match(html, /AI 可見度/);
  assert.match(html, /✓ 通過/);
  assert.match(html, /下載 Markdown/);
  assert.match(html, /下載 PDF/);
  assert.match(html, /window\.print\(\)/);
  assert.doesNotMatch(html, /AI 信任值|65%|35%|曝光漏斗/, "the MCAC report never shows the old blended score or internal weights");
  assert.doesNotMatch(html, /<script>alert/, "AI answers are escaped");
  assert.match(html, /&lt;script&gt;/);
  const servedHtml = reportHtml(report);
  assert.ok(servedHtml.includes("AI 能見度檢測單") && servedHtml.includes("&lt;script&gt;"), "the shared renderer dispatches MCAC reports to the MCAC page");
  // The served page reports result_viewed to GA4, as the Classic report page did (PR #6 finding 5).
  assert.match(servedHtml, /googletagmanager\.com\/gtag\/js/);
  assert.match(servedHtml, /trackResultViewed/);
  const md = reportMarkdown(report);
  assert.match(md, /AI 能見度檢測單/);
  assert.match(md, new RegExp(`AI 可見度：${report.mcac.score.value} / 100`));
  assert.doesNotMatch(md, /AI 信任值|65%|35%|25%|20%|曝光漏斗/);
  // The site does not say which models or engines run the check (2026-10-21 decision): not in
  // the page header, the footer's pipeline version or the Markdown download.
  for (const [name, page] of [["page", servedHtml], ["download", md]]) {
    assert.doesNotMatch(page, /DeepSeek|Perplexity|Sonar|Gemini/i, `the report ${name} must not name the models behind the check`);
  }
  assert.match(servedHtml, /mcac-0.2.0-/, "the footer still carries the pipeline version");

  // The stored report carries the id the Worker stored it under, so the page and its download
  // link use the URL's id (PR #6 finding 1).
  const stored = await runMcacAudit("https://example-noodle.tw/", { ...deps().options, reportId: "real_lite_stored-id-1" });
  assert.equal(stored.id, "real_lite_stored-id-1");
  const unsafe = await runMcacAudit("https://example-noodle.tw/", { ...deps().options, reportId: "../x" });
  assert.match(unsafe.id, /^real_lite_[0-9a-f-]{36}$/, "only a real_lite_ id is accepted");

  // Site checks are read from their Chinese fields (PR #6 finding 3) and show gray unpassed status.
  report.siteChecks.issues = [{ severity: "high", check: "JavaScript rendering", detail_zh: "首頁大部分文字要等程式跑完才會出現。", impact_zh: "有些 AI 只會讀到空白。" }];
  const checksHtml = mcacReportHtml(report);
  assert.match(checksHtml, /首頁大部分文字要等程式跑完才會出現。/);
  assert.match(checksHtml, /有些 AI 只會讀到空白。/);
  assert.match(checksHtml, /— 未通過|— 待補強/);

  // A value that is not on the owner's page is a mismatch, not an error: the page may be out
  // of date, or another platform (Google Maps) may list something else (2026-10-20 decision).
  const differing = deps({ engineClient: { id: "perplexity", profileId: "perplexity-sonar", model: "sonar",
    ask: async (prompt) => (/ADDRESS:/.test(prompt)
      ? { answer: "ADDRESS: 台北市大安區仁愛路四段27巷3號；PHONE: 02-2700-9999", citations: [], usage: {}, cost: null }
      : { answer: "1. 範例牛肉麵", citations: [], usage: {}, cost: null }) } });
  const differingReport = await runMcacAudit("https://example-noodle.tw/", differing.options);
  assert.deepEqual([differingReport.mcac.accuracy.fields.phone, differingReport.mcac.accuracy.flag], ["mismatch", "mismatch"]);
  const differingHtml = mcacReportHtml(differingReport);
  assert.match(differingHtml, /和你的頁面不一致/);
  assert.match(differingHtml, /02-2700-9999/, "the report lists the value the AI gave");
  assert.match(differingHtml, /統一/, "a mismatch asks the owner to make every platform say the same");
  assert.doesNotMatch(differingHtml, /有錯誤|>錯誤</, "the product cannot tell which value is wrong, so it never says wrong");
  assert.match(mcacReportMarkdown(differingReport), /和你的頁面不一致/);

  // New consultant-style first screen: 30-second answers, dynamic conclusion, 1-3 genuine priorities, no dominant 0-100 ring.
  for (const question of ["AI 有沒有提到你？", "AI 有沒有引用你的網站？", "店家資訊有沒有一致？", "顧客能不能找到聯絡入口？"]) {
    assert.ok(html.includes(question), `the first screen asks: ${question}`);
  }
  assert.ok(html.includes("範例牛肉麵") && html.includes("#method-note"));
  assert.ok(html.includes("#detail-mcac") && html.includes("#detail-probes") && html.includes("#detail-checks"));
  assert.match(html, /class="gauge-wrap"/, "0-100 visibility ring gauge container is present on the first screen");
  assert.match(html, /<svg[^>]*viewBox="0 0 116 116"/, "116x116 circular visibility score ring SVG renders upfront");
  assert.match(differingHtml, /電話資訊有差異/, "one-sentence conclusion states phone discrepancy when phone mismatches");
  assert.match(mcacReportHtml({ ...report, isDemo: true }), /示範資料/);
  const healthyHtml = mcacReportHtml({
    ...report,
    mcac: {
      ...report.mcac,
      mention: { flag: "yes", hits: 2, n: 2, ranks: [1, 2], options_by_probe: [] },
      citation: { flag: "yes", official_probes: 4, n: 4, by_type: { official: 4 }, official_urls: ["https://example-noodle.tw/"] },
      accuracy: { flag: "correct", fields: { phone: "correct", address: "correct", hours: "not_judged" }, claimed: { phone: ["02-2700-1234"], address: ["台北市大安區仁愛路4段27巷3號"] } },
      conversion: { flag: "yes", official_entry: true, entries: ["website", "phone"], actions: [{ type: "website", target: "https://example-noodle.tw/", owner: "品牌自有", official: true }] }
    }
  });
  assert.doesNotMatch(healthyHtml, /<li class="hero-action-item/, "no fabricated priority actions when no measured defect exists");
  const allUnknownHtml = mcacReportHtml({
    ...report,
    limited: true,
    mcac: {
      method: "mcac",
      method_version: "0.2.0",
      probes: [],
      mention: { flag: "unknown", hits: null, n: 0, ranks: [] },
      citation: { flag: "unknown", official_probes: null, n: 0, by_type: {}, official_urls: [] },
      accuracy: { flag: "unknown", fields: { phone: "unknown", address: "unknown", hours: "not_judged" }, claimed: null },
      conversion: { flag: "unknown", entries: [], official_entry: null, actions: [] }
    }
  });
  assert.doesNotMatch(allUnknownHtml, /<li class="hero-action-item/, "no fabricated priority actions when data is unknown");
  assert.doesNotMatch(allUnknownHtml, /基本聯絡資訊與頁面一致/, "unknown results must never be described as consistent");

  // 4d. Lightweight Design System contract: LS-Labs semantic palette tokens, 16px body scale,
  //     light calm report canvas below dark header, and zero decorative bars/glows/nested inset boxes.
  assert.match(html, /href="\/assets\/tokens\.css"/, "report links canonical LS-Labs tokens stylesheet");
  assert.match(html, /--ls-accent-on-light:#1D4ED8/);
  assert.match(html, /--ls-ink:#1E293B/);
  assert.match(html, /--text-body:1rem/);
  assert.match(html, /GeoCheck · AI 能見度檢測單/);
  assert.doesNotMatch(html, /class="rank-scale"/, "decorative 1-10 slot gauge is removed");
  assert.doesNotMatch(html, /class="stack-bar"/, "decorative multi-color citation bar is removed");
  assert.doesNotMatch(html, /class="gc-sky"/, "ambient background glow layer is removed");
  assert.doesNotMatch(html, /class="inset-box"/, "nested box-in-box containers are removed");

  // 4e. Redesigned MCAC four modules & traceable raw evidence contracts.
  for (const heading of ["AI 有沒有提到你？", "AI 有沒有引用你的網站？", "AI 提供的店家資訊正確嗎？", "顧客能找到你的聯絡方式嗎？"]) {
    assert.ok(html.includes(heading), `module heading present: ${heading}`);
  }
  assert.doesNotMatch(html, /class="peer-chip"/, "mention module removes competitor chip wall");
  assert.doesNotMatch(html, /第 \d+ 名/, "mention module avoids calling single list order a fixed ranking");
  assert.match(html, /第 \d+ 項/, "mention module labels listed position cleanly as item order");
  assert.match(html, /出現官網引用的題目數（按題計算）/, "citation module shows question-level denominator");
  assert.match(html, /AI 附上的來源網址紀錄（按筆數計算）/, "citation module separates URL record count");
  assert.doesNotMatch(healthyHtml, /class="source-bar-track"/, "no source distribution bar when only 1 source category exists");
  assert.match(differingHtml, /class="fact-row fact-row--mismatch"/, "accuracy module highlights only differing field");
  assert.match(differingHtml, /資訊不一致／待核對/, "accuracy module uses neutral mismatch/pending status");
  assert.match(html, /entry-badge--yes">已提供</);
  assert.match(html, /entry-badge--no">未提供</);
  assert.match(allUnknownHtml, /entry-badge--untested">未檢測</, "conversion module explicitly marks untested state");
  const platformHtml = mcacReportHtml({
    ...report,
    mcac: {
      ...report.mcac,
      citation: { flag: "unknown", reason: "platform_root_input", official_probes: 0, n: 4, by_type: { social: 2 }, official_urls: [] }
    }
  });
  assert.match(platformHtml, /entry-badge--na">不適用</, "conversion module marks N/A for shared platform domain");
  assert.match(html, /id="probe-1"/);
  assert.match(html, /href="#probe-1"/, "module links directly to corresponding raw probe evidence");
  assert.match(html, /支持結論的關鍵證據/);
  assert.match(html, /AI 原始回答/);
  assert.match(html, /實際引用來源/);
  const noSourceDiff = mcacReportHtml({
    ...differingReport,
    mcac: {
      ...differingReport.mcac,
      probes: differingReport.mcac.probes.map((p) => ({ ...p, sources: [] }))
    }
  });
  assert.match(noSourceDiff, /本題 AI 未提供外部參考來源網址/);

  // 4f. Typography and de-pilled semantic labels: no Google Fonts or 999px pill tokens.
  assert.doesNotMatch(differingHtml, /fonts\.googleapis\.com/);
  assert.doesNotMatch(differingHtml, /--font-(mono|display)/);
  assert.doesNotMatch(differingHtml, /--radius-pill/);
  assert.doesNotMatch(differingHtml, /999px/);

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
  assert.equal(wrangler.vars.AUDIT_ADMISSION_ENABLED, "true", "MCAC opened on 2026-10-21 with the user's go-ahead, after the paid smoke test passed");
  // Limits are kept out of the public repo: they live in the AUDIT_LIMITS secret (LSL-D-006).
  for (const name of ["AUDIT_DAILY_LIMIT", "AUDIT_LIMITS", "AUDIT_IP_PEPPER"]) assert.ok(!(name in wrangler.vars), `${name} is not a public var`);
  assert.equal(wrangler.queues.consumers[0].max_retries, 1, "a failed audit is retried once, not three times");
  // One shared render container plus one audit at a time fits the container ceiling. A
  // container per report left one report's page failing for good (2026-10-21 deploy check).
  assert.equal(wrangler.queues.consumers[0].max_concurrency, 1, "audits run one at a time");
  assert.ok(wrangler.containers[0].max_instances >= 3, "room for the render container, the audit container and one instance still stopping");
  const limits = await import("../../services/cloudflare/audit/src/limits.mjs");
  assert.equal(limits.QUEUE_MAX_RETRIES, wrangler.queues.consumers[0].max_retries, "the Worker knows the queue's retry limit");
  const workerSource = fs.readFileSync(path.resolve(__dirname, "../../services/cloudflare/audit/src/worker.js"), "utf8");
  for (const name of ["GEOCHECK_METHOD", "GEOCHECK_MCAC_ENGINE", "GEMINI_API_KEY", "PERPLEXITY_API_KEY", "DEEPSEEK_API_KEY"]) {
    assert.ok(workerSource.includes(`${name}: workerEnv.${name}`), `the container receives ${name}`);
  }
  assert.doesNotMatch(workerSource, /OPENAI_API_KEY|ANTHROPIC_API_KEY/, "no other engine key reaches the GeoCheck container");
  assert.match(workerSource, /daily_limit_reached/);
  assert.match(workerSource, /rate_limited/);
  assert.ok(!workerSource.includes("`render-${"), "report pages never get a container per report");
  // Report pages and downloads render in the Worker and never wake the container (2026-11-15).
  assert.ok(workerSource.includes("reportHtml(normalizeReportForClient(report))"), "report pages render in the Worker");
  assert.ok(!workerSource.includes("RENDER_CONTAINER"), "report pages and downloads never wake the audit container");
  // Audits share one container too. A container per job kept running after its audit, so the
  // next audits hit the instance ceiling and failed (2026-10-21 launch smoke).
  assert.ok(workerSource.includes("AUDIT_CONTAINER"), "audits share one audit container");
  assert.doesNotMatch(workerSource, /invokeContainer\(env, jobId,/, "an audit never gets a container per job");
  assert.ok(workerSource.includes("parseLimits(env)"), "new audits need the secret limits");
  assert.ok(workerSource.includes("\\/markdown$/"), "the download link has a route (PR #6 finding 2)");
  assert.match(workerSource, /status = 'failed'/, "a job whose last retry fails is marked failed (PR #6 finding 4)");
  assert.match(workerSource, /json_patch/, "completing a job keeps the client key used for the per-client limit");

  // Limits: missing or invalid settings close admission; nothing about the values is public.
  const pepper = "p".repeat(32);
  assert.equal(limits.parseLimits({}), null);
  assert.equal(limits.parseLimits({ AUDIT_LIMITS: "not json", AUDIT_IP_PEPPER: pepper }), null);
  assert.equal(limits.parseLimits({ AUDIT_LIMITS: '{"daily":5,"per_ip":0,"per_ip_hours":2}', AUDIT_IP_PEPPER: pepper }), null);
  assert.equal(limits.parseLimits({ AUDIT_LIMITS: '{"daily":5,"per_ip":1,"per_ip_hours":2}', AUDIT_IP_PEPPER: "short" }), null);
  assert.deepEqual(limits.parseLimits({ AUDIT_LIMITS: '{"daily":5,"per_ip":1,"per_ip_hours":2}', AUDIT_IP_PEPPER: pepper }),
    { daily: 5, perIp: 1, perIpHours: 2, pepper });
  // One IPv6 /64 is one client; addresses are stored only as a peppered hash.
  assert.equal(limits.clientBucket("203.0.113.9"), "203.0.113.9");
  assert.equal(limits.clientBucket("2001:db8:1:2:3:4:5:6"), "2001:db8:1:2");
  assert.equal(limits.clientBucket("2001:db8:1:2::9"), "2001:db8:1:2");
  assert.equal(limits.clientBucket("2001:DB8::1"), "2001:db8:0:0");
  assert.equal(limits.clientBucket(""), "unknown");
  const keyA = await limits.clientKey("2001:db8:1:2:aaaa::1", pepper);
  assert.equal(keyA, await limits.clientKey("2001:db8:1:2:bbbb::2", pepper));
  assert.notEqual(keyA, await limits.clientKey("2001:db8:1:2:aaaa::1", "q".repeat(32)));
  assert.match(keyA, /^[0-9a-f]{32}$/);
  // Queue attempts count from 1: with one retry, the second failure is final.
  assert.equal(limits.isFinalAttempt(1, 1), false);
  assert.equal(limits.isFinalAttempt(2, 1), true);

  console.log("MCAC pipeline tests passed");
  // Requiring services/api/server.js starts its local HTTP server; end explicitly.
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
