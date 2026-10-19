# GeoCheck MCAC v0.2.0

Status: implemented behind `GEOCHECK_METHOD=mcac`; not yet live. The audit Worker ships with `AUDIT_ADMISSION_ENABLED=false` until deployment is authorised. Flag thresholds are **v0 and provisional** (Human Ownership): they need the user's confirmation and may change after real data.

Version 0.2.0 (2026-10-20) follows the paid smoke of 0.1.0 (four sites, Perplexity and Gemini; record in the workspace at `work/2026-10-20-mcac-backend/smoke/`). The user decided four changes: Accuracy reports a value missing from the owner's page as `mismatch`, not `incorrect`; discovery asks recommendation questions first; discovery answers get 2,048 output tokens; Perplexity stays the default engine. The smoke also led to fixes for Gemini citations, option ranks, fan-page inputs and citation markers in fact answers (described below).

Method source: LS-Labs, *AI 搜尋時代的檢索機制報告* (2026-09-18; `docs/reports/ai-search-website-value/report.md` in the workspace), appendix A prompt templates and the pilot analysis rules in `research/mcac-website-value-pilot-2026-09-16/`.

## What changes from AI Trust Index v1

AI Trust Index v1 asks four unbranded discovery questions that all measure the same thing and blends mention and official citation into one 65/35 score. MCAC asks three kinds of task and reads four results separately. There is **no total**: the data contract's `total` is always `null`, enforced by `tests/regression/mcac-core.test.js`. Classic code stays for research batches; the two methods never fall back to each other.

## Engines

Exactly two combinations (`services/api/application/mcac-engines.js`):

| `GEOCHECK_MCAC_ENGINE` | Planning | Answer engine |
|---|---|---|
| `perplexity` (default) | DeepSeek | Perplexity Sonar (`perplexity-sonar`) |
| `gemini` | DeepSeek | Gemini Flash with Google Search grounding (`google-web`, `gemini-3.5-flash-lite` unless `GEOCHECK_MCAC_GEMINI_MODEL` is set) |

Any other value is refused. Planning calls DeepSeek with `allowFallback: false`, so the structured router never falls back to OpenAI or Gemini. Only the chosen engine's key is read (`createOfficialProvider`).

Perplexity stays the default (decided 2026-10-20 after the paid smoke): once Gemini's citations were read correctly, both engines judged the four sites alike, and Gemini cost about five times as much per audit because each question ran about two billed Google searches.

## Probe set `mcac-probes-0.2.0`

| Probe | Count | Prompt | Measures |
|---|---|---|---|
| Discovery | up to 2 | User questions first, then DeepSeek-planned unbranded questions, recommendation intent first + "list up to 10 options with verifiable sources; do not assume any brand must appear" | Mention, Citation |
| Fact | 1 | 「請查證{地區}的「{品牌}」目前地址與電話。只輸出兩行：ADDRESS: …；PHONE: …」 | Accuracy, Citation |
| Action | 1 | 「我想前往或聯絡{地區}的「{品牌}」… ACTION: <類型> \| <URL 或電話> \| <品牌自有或第三方>」 | Conversion-readiness, Citation |
| Comparison | 0 | Not run: the report found position-dependent omissions, so comparison is unsuitable for this estimate | — |

The planner picks four questions of mixed intent for Classic and forces the second to differ from the first, so MCAC takes its own pick: the planner's recommendation candidates, best rated (consumer relevance plus evidence fit) first, skipping near-duplicates; other questions only fill a gap. In the smoke, the planner's second question was often "which is better" or "how do I check opening hours", whose answers list no businesses. Discovery answers may use 2,048 output tokens (fact and action answers keep 1,024): with 1,024, ten of the sixteen smoke discovery answers stopped mid-list.

Questions never contain the site's domain. Each probe gets at most one retry on a retryable provider error (`provider_rate_limited`, `provider_unavailable`, `provider_timeout`). A site that cannot be fetched produces a limited report with every result unknown and no engine call; that includes the case where every fetch method fails and the last error comes from the Scrapling or Google Translate fallback (`scrapling_fetch`, `translate_fetch`, `translate_challenge`).

## Results and v0 flags (`mcac-flags-v0`)

- **Mention** (discovery answers only): hits / valid discovery answers. All → `yes`, some → `part`, none → `no`, no valid answer → `unknown` (hits `null`). Mention is not endorsement. When the input is a page on a shared platform (a Facebook fan page, for example), brand terms that contain the platform's name are dropped, so an answer that names Facebook is not a mention. A rank counts the options themselves: the outermost list lines, and of those only the numbered ones (including `### 1.` headings) when any are numbered; without a list, table rows. Reasons and sources nested under an option, rules (`---`) and italic notes are not options.
- **Citation** (all answered probes): probes whose sources include the official site / answered probes, plus counts by source type (official, maps, social, booking, ugc, wiki, gov_edu, other). At least half → `yes`, at least one → `part`, none → `no`, no answer or a platform-root site → `unknown`. Source counts are not a trust weight. Gemini cites every source through Google's grounding redirector (`vertexaisearch.cloud.google.com`): all of an audit's redirects are followed (up to 40), and one that cannot be followed is classified by the domain Gemini gives as its title.
- **Accuracy** (fact answer): phone and address compared with what the owner's own page states (the official site, or the fan page when that is the input; JSON-LD first, visible text second; `packages/geo-core/mcac/facts.js`). Each field is `correct` (a value the page lists), `mismatch` (a value the page does not list), `not_provided` or `unverifiable` (the page states nothing). A mismatch is not called an error: in the smoke, both engines gave a fan-page shop the phone and address Google Maps lists, while the fan page listed another number, so the tool cannot tell which is right. The report says 「和你的頁面不一致」, shows the AI's value and asks the owner to make every platform say the same. Phone compares digits (+886 → 0); address compares the road-to-number part after normalising 臺/台, full-width characters, postal codes and 四段/4段. Any `mismatch` → `mismatch`; else any `correct` → `correct`; both `unverifiable` → `unverifiable`; else `not_provided`. Hours are recorded, not judged. Citation markers such as `[1][6]` are removed from the answer's values first.
- **Conversion-readiness** (action answer): ACTION lines or free-text phone, URL, address, map, booking, ordering or LINE entries. Any actionable entry → `yes`, none → `no`, failed answer → `unknown`. Whether an entry is the official site is reported separately; a redirect written into the answer (Gemini sometimes gives its grounding link as the website) is shown and credited by where it leads.

The twelve existing site checks stay on the report, unscored.

## Operations

- Cache key: `AUDIT_PIPELINE_VERSION` must equal `${MCAC_PIPELINE_VERSION}-${engine}`; the test fails on drift.
- Queue retries: 1. Daily ceiling: `AUDIT_DAILY_LIMIT` fresh audits per Asia/Taipei day (cached results are not counted).
- Cost: four answer-engine calls plus one DeepSeek planning call per audit (worst case eight engine calls with retries). Measured in the 2026-10-20 smoke: about US$0.021–0.023 per audit with Perplexity (reported by Perplexity) and US$0.10–0.12 with Gemini (list price with every Google search billed; a free allowance may apply), plus under US$0.001 for DeepSeek. Usage goes to the AI usage ledger, never into a result.

## Limits

Each result rests on one or two questions, so the report is a snapshot and not research evidence. Accuracy relies on what the owner's page publishes; the research version also checked Google Business Profile. Aliases come from the site and the planner only, so Mention may undercount.
