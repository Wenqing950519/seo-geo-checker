# GeoCheck whitepaper methodology

## Measurement design

The production whitepaper mode separates question design from site measurement:

1. Gemini question draft: 5-8 consumer-style candidates are generated from representative industry evidence.
2. Human review and freeze: a researcher removes brand leakage, footer-vendor noise, unnatural prompts, duplicates, and off-industry questions. The approved set is versioned and used unchanged for the cohort.
3. Perplexity search evidence: one exact-entity authority query plus every approved unbranded discovery query per site.
4. GeoCheck deterministic evidence: crawl access, content citeability, and technical readiness from the shared production pipeline.
5. Gemini Flash-Lite profile: one bounded per-site call standardizes basic information, industry, business scope, geography, page purpose, structure, and observed topics.

Algorithm V3 computes the GEO score from Perplexity observation (50%), content citeability (30%), and necessary technical access (20%). Gemini designs or classifies inputs but does not score and cannot override observed evidence.

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
| Gemini query draft | 1 per cohort draft | Produce 5-8 candidates for human review; no Perplexity search |
| Perplexity | `1 + approved query count` per site | Entity authority plus frozen unbranded discovery observations |
| Gemini Flash-Lite | 1 per site | Basic information and structure classification |

For the default two-question design, 400 sites require at most 1,200 Perplexity calls and 400 per-site Gemini calls, plus one Gemini drafting call per cohort. The batch requires explicit `--max-perplexity-calls` and `--max-gemini-calls`. It calculates pending-site budgets and aborts before execution when either cap is insufficient.

## Evidence record

| Field | Meaning |
|---|---|
| `geo_score` | Algorithm V3 score when Perplexity evidence is measurable; otherwise `null` |
| `perplexity_score` | Search-observation component |
| `mention_rate` | Share of measured unbranded queries mentioning the aligned entity |
| `official_citation_rate` | Share of measured queries citing the official domain |
| `entity_grounded` | Whether the authority query verified exact-entity alignment |
| `source_urls` | Deduplicated citations and search-result URLs |
| `site_readiness_score` | Deterministic owned-site readiness |
| `gemini_profile` | Descriptive classification only; never a scoring input |
| `concise_comment_zh` | Deterministic observation summary without advice |
| `measurement_status` | Success, insufficient evidence, or failure |
| `evidence_hash` | SHA-256 of compact measurement evidence |

## Interpretation boundary

- Do not generalize a Perplexity observation to ChatGPT, Gemini Search, Claude, or all AI engines.
- Report the Perplexity model, approved query set, review record, date range, measured-query count, and failure rate.
- Keep unavailable searches and crawl failures outside score distributions; do not impute zero.
- Use Gemini profile fields for grouping and context only. Do not publish Gemini-generated recommendations because this mode intentionally does not request them.
- Preserve the draft candidates, approval record, input list, JSONL, CSV, summary, methodology, source commit, timezone, and dataset hash.

Suggested citation:

> GeoCheck Taiwan industry GEO evidence dataset, n=[measured sites], Algorithm V3 [pipeline version], Perplexity [model] with one authority query and [n] human-reviewed frozen discovery questions, Gemini Flash-Lite descriptive profiling, collected [dates], query set [version], dataset SHA-256: [hash].

Use `run-rules-batch.mjs` only for crawl preflight. Rules-only results describe owned-site readiness, not AI visibility.
