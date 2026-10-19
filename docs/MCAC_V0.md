# GeoCheck MCAC v0.1.0

Status: implemented behind `GEOCHECK_METHOD=mcac`; not yet live. The audit Worker ships with `AUDIT_ADMISSION_ENABLED=false` until a paid smoke test is approved and passes. Flag thresholds are **v0 and provisional** (Human Ownership): they need the user's confirmation and may change after real data.

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

## Probe set `mcac-probes-0.1.0`

| Probe | Count | Prompt | Measures |
|---|---|---|---|
| Discovery | up to 2 | DeepSeek-planned (or user) unbranded questions + "list up to 10 options with verifiable sources; do not assume any brand must appear" | Mention, Citation |
| Fact | 1 | 「請查證{地區}的「{品牌}」目前地址與電話。只輸出兩行：ADDRESS: …；PHONE: …」 | Accuracy, Citation |
| Action | 1 | 「我想前往或聯絡{地區}的「{品牌}」… ACTION: <類型> \| <URL 或電話> \| <品牌自有或第三方>」 | Conversion-readiness, Citation |
| Comparison | 0 | Not run: the report found position-dependent omissions, so comparison is unsuitable for this estimate | — |

Questions never contain the site's domain. Each probe gets at most one retry on a retryable provider error (`provider_rate_limited`, `provider_unavailable`, `provider_timeout`). A site that cannot be fetched produces a limited report with every result unknown and no engine call; that includes the case where every fetch method fails and the last error comes from the Scrapling or Google Translate fallback (`scrapling_fetch`, `translate_fetch`, `translate_challenge`).

## Results and v0 flags (`mcac-flags-v0`)

- **Mention** (discovery answers only): hits / valid discovery answers. All → `yes`, some → `part`, none → `no`, no valid answer → `unknown` (hits `null`). Mention is not endorsement. When the input is a page on a shared platform (a Facebook fan page, for example), brand terms that contain the platform's name are dropped, so an answer that names Facebook is not a mention.
- **Citation** (all answered probes): probes whose sources include the official site / answered probes, plus counts by source type (official, maps, social, booking, ugc, wiki, gov_edu, other). At least half → `yes`, at least one → `part`, none → `no`, no answer or a platform-root site → `unknown`. Source counts are not a trust weight.
- **Accuracy** (fact answer): phone and address compared with the official site's own data (JSON-LD first, visible text second; `packages/geo-core/mcac/facts.js`). Each field is `correct`, `incorrect`, `not_provided` or `unverifiable` (site states nothing). Phone compares digits (+886 → 0); address compares the road-to-number part after normalising 臺/台, full-width characters, postal codes and 四段/4段. Any `incorrect` → `incorrect`; else any `correct` → `correct`; both `unverifiable` → `unverifiable`; else `not_provided`. Hours are recorded, not judged.
- **Conversion-readiness** (action answer): ACTION lines or free-text phone, URL, address, map, booking, ordering or LINE entries. Any actionable entry → `yes`, none → `no`, failed answer → `unknown`. Whether an entry is the official site is reported separately.

The twelve existing site checks stay on the report, unscored.

## Operations

- Cache key: `AUDIT_PIPELINE_VERSION` must equal `${MCAC_PIPELINE_VERSION}-${engine}`; the test fails on drift.
- Queue retries: 1. Daily ceiling: `AUDIT_DAILY_LIMIT` fresh audits per Asia/Taipei day (cached results are not counted).
- Cost: four answer-engine calls plus one DeepSeek planning call per audit (worst case eight engine calls with retries). Estimated at about US$0.02–0.03 per audit on current Sonar list prices; usage goes to the AI usage ledger, never into a result.

## Limits

Each result rests on one or two questions, so the report is a snapshot and not research evidence. Accuracy relies on what the official site publishes; the research version also checked Google Business Profile. Aliases come from the site and the planner only, so Mention may undercount.
