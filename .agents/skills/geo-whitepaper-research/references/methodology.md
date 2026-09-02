# GeoCheck whitepaper methodology: GEO Core / AI Trust Index v1

`GEO Core` is the research record; `AI Trust Index` is the product-facing aggregate. Neither measures an AI model's internal trust state.

## Measurement design

The production whitepaper mode separates question design from site measurement:

1. DeepSeek question draft: 5-8 consumer-style candidates are generated from representative industry evidence.
2. Human review and freeze: a researcher removes brand leakage, footer-vendor noise, unnatural prompts, duplicates, and off-industry questions. The approved set is versioned and used unchanged for the cohort.
3. Perplexity search evidence: one exact-entity authority query plus every approved unbranded discovery query per site.
4. GeoCheck deterministic evidence: crawl access, content citeability, and technical readiness from the shared production pipeline.
5. DeepSeek V4 Flash profile: one bounded per-site call standardizes basic information, industry, business scope, geography, page purpose, structure, and observed topics.

Each approved unbranded query produces one `query-run`. Only runs with a visible, answerable output enter the denominator. Refusals, unavailable provider results, and unparseable answers are `unknown`: preserve and exclude them, never convert them to zero.

GEO Core keeps two layers separate: answer adoption is the share of valid visible answers that mention the aligned brand; source evidence is the share of those same runs that cite a URL verified as the brand's first-party official domain. The product displays `AI Trust Index = 0.65 × answer adoption + 0.35 × source evidence`. Direct entity/brand-name queries establish entity context and are reported separately; they do not enter this denominator. Fewer than two valid query-runs are capped at 69. A zero on a valid run is a measured zero, not `unknown`. DeepSeek designs or classifies inputs but does not score and cannot override observed evidence.

## Query governance

The paid batch rejects a query set unless it contains:

- `query_set_version`
- `review_status: approved`
- `reviewed_by`
- `reviewed_at`
- at least two frozen unbranded questions with unique IDs

Within one comparison cohort, every site receives the exact same discovery questions. Dynamic per-site questions are appropriate for an individual commercial audit but not for industry comparison, because different questions would create an uncontrolled measurement variable.

## API budget

| Stage and provider | Calls | Purpose |
|---|---:|---|
| DeepSeek query draft | 1 per cohort draft | Produce 5-8 candidates for human review; no Perplexity search |
| Perplexity | `1 + approved query count` per site | Entity authority plus frozen unbranded discovery observations |
| DeepSeek V4 Flash | 1 per site | Basic information and structure classification |

For the default two-question design, 400 sites require at most 1,200 Perplexity calls and 400 per-site DeepSeek calls, plus one DeepSeek drafting call per cohort. The batch requires explicit `--max-perplexity-calls` and `--max-deepseek-calls`. It calculates pending-site budgets and aborts before execution when either cap is insufficient.

## Evidence record

| Field | Meaning |
|---|---|
| `ai_trust_index` | Product aggregate: 65% answer adoption plus 35% verified source evidence; otherwise `null` |
| `answer_adoption_rate` | Share of valid visible unbranded answers mentioning the aligned entity |
| `source_evidence_rate` | Share of the same valid answers citing a verified first-party official URL |
| `geo_core` | Separate answer layer, source layer, and query-run denominator |
| `entity_grounded` | Whether the authority query verified exact-entity alignment |
| `source_urls` | Deduplicated citations and search-result URLs |
| `site_readiness_score` | Deterministic owned-site readiness |
| `deepseek_profile` | Descriptive classification only; never a scoring input |
| `concise_comment_zh` | Deterministic observation summary without advice |
| `measurement_status` | Success, insufficient evidence, or failure |
| `evidence_hash` | SHA-256 of compact measurement evidence |

## Interpretation boundary

- Do not generalize a Perplexity observation to ChatGPT, Gemini Search, Claude, or all AI engines.
- Report the Perplexity model, approved query set, review record, date range, measured-query count, and failure rate.
- Keep unavailable searches and crawl failures outside score distributions; do not impute zero.
- Use DeepSeek profile fields for grouping and context only. Do not publish DeepSeek-generated recommendations because this mode intentionally does not request them.
- Preserve the draft candidates, approval record, input list, JSONL, CSV, summary, methodology, source commit, timezone, and dataset hash.

Suggested citation:

> GeoCheck Taiwan industry GEO Core evidence dataset, n=[measured sites], AI Trust Index v1 [pipeline version], Perplexity [model] with one authority query and [n] human-reviewed frozen discovery questions, DeepSeek V4 Flash descriptive profiling, collected [dates], query set [version], dataset SHA-256: [hash].

Use `run-rules-batch.mjs` only for crawl preflight. Rules-only results describe owned-site readiness, not AI visibility.
