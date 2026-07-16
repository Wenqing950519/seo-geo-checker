# GeoCheck whitepaper methodology

## Measurement design

The production whitepaper mode combines three evidence layers:

1. Perplexity search evidence: one exact-entity authority query plus two unbranded discovery queries per site.
2. GeoCheck deterministic evidence: crawl access, content citeability, and technical readiness from the shared production pipeline.
3. Gemini Flash-Lite profile: one bounded call that standardizes basic information, industry, business scope, geography, page purpose, structure, and observed topics.

Algorithm V3 computes the GEO score from Perplexity observation (50%), content citeability (30%), and necessary technical access (20%). Gemini does not score and cannot override evidence.

## API budget

| Provider | Calls per new site | Purpose |
|---|---:|---|
| Perplexity | 3 | Entity authority and two unbranded discovery observations |
| Gemini Flash-Lite | 1 | Basic information and structure classification |

The batch requires explicit `--max-perplexity-calls` and `--max-gemini-calls`. It calculates the pending-site budget and aborts before execution when either cap is insufficient. Resume records matching the current pipeline and profile versions do not consume the planned pending budget.

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
- Report the Perplexity model, query templates, date range, measured-query count, and failure rate.
- Keep unavailable searches and crawl failures outside score distributions; do not impute zero.
- Use Gemini profile fields for grouping and context only. Do not publish Gemini-generated recommendations because this mode intentionally does not request them.
- Preserve input list, JSONL, CSV, summary, methodology, source commit, timezone, and dataset hash.

Suggested citation:

> GeoCheck Taiwan industry GEO evidence dataset, n=[measured sites], Algorithm V3 [pipeline version], Perplexity [model] with three fixed queries per site and Gemini Flash-Lite descriptive profiling, collected [dates], dataset SHA-256: [hash].

Use `run-rules-batch.mjs` only for crawl preflight. Rules-only results describe owned-site readiness, not AI visibility.
