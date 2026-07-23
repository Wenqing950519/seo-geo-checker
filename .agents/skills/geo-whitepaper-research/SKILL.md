---
name: geo-whitepaper-research
description: Run reproducible GeoCheck industry-whitepaper research using human-reviewed Gemini question design, Perplexity search evidence for quantified GEO visibility, and Gemini Flash-Lite for basic site, industry, structure, and content classification. Use when Codex needs to measure tens or hundreds of websites, export CSV or JSONL evidence, compare industries, quantify brand mentions or official citations, or prepare concise whitepaper findings without generating optimization advice.
---

# GeoCheck Whitepaper Research

Use the production GeoCheck measurement pipeline. Gemini may draft industry search questions, but a human must review and freeze the cohort question set before any paid Perplexity batch. Per-site Gemini calls only standardize observed site information and never generate optimization advice.

## Required contract

- Import the shared production pipeline from `mock-api/lib/geo-measurement.js`; never copy scoring weights into the Skill.
- Question design follows `Gemini candidate generation -> human review -> frozen query-set JSON -> Perplexity batch search`.
- Never run the whitepaper batch with dynamically generated per-site questions. Every site in the same comparison cohort must receive the same approved unbranded questions.
- Require `review_status=approved`, `reviewed_by`, `reviewed_at`, a pinned `query_set_version`, and at least two questions.
- Run one exact-entity authority query plus every approved unbranded query through Perplexity for each site.
- Run one Gemini Flash-Lite profile call per site for entity name, industry, business scope, geography, page purpose, structure, and observed topics.
- Do not let Gemini change `geo_score`, search observations, citations, or deterministic rule points.
- Do not request or output recommendations, actions, rewrites, expected impact, or optimization copy.
- Preserve failed or unavailable evidence as `null` or `unknown`; never convert it to zero.
- Freeze models, query design, collection period, pipeline/profile versions, failure rate, and dataset SHA-256.
- Limit claims to the tested Perplexity model, approved query set, and collection window. Do not claim universal visibility across all AI systems.
- Aggregate or anonymize identifiable low-scoring small businesses unless publication consent exists.

## Question-design stage

Generate a draft from a representative site. This makes one Gemini call and zero Perplexity calls:

```powershell
node .agents/skills/geo-whitepaper-research/scripts/draft-query-set.mjs `
  --site https://representative.example/ `
  --output research-input/restaurant-query-set.draft.json `
  --max-gemini-calls 1
```

Review all candidates as a researcher. Remove brand names, domains, page-footer vendors, unnatural source requests, duplicates, and questions that do not represent the industry. Copy the approved questions into a separate JSON file based on [references/query-set.example.json](references/query-set.example.json), set `review_status` to `approved`, and record reviewer and date. Never pass the draft file directly to the paid batch.

## Default research mode

Run from the project root after human approval:

```powershell
node .agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs `
  --input research-input/sites.csv `
  --query-set research-input/restaurant-query-set.approved.json `
  --output-dir research-output/taiwan-sme-2026 `
  --max-perplexity-calls 1200 `
  --max-gemini-calls 400 `
  --concurrency 2 `
  --delay-ms 500
```

With 400 new sites and two approved discovery questions, the exact batch maximum is 1,200 Perplexity calls and 400 Gemini calls. The separate drafting stage adds one Gemini call per cohort. State both budgets before execution. The scripts abort before the first paid call if a cap is insufficient or the query set is not approved.

Use `scripts/run-rules-batch.mjs` only as an optional zero-API crawl preflight. Its `geo_score` remains `null` and it cannot support AI-visibility claims.

## Workflow

1. Define the research question, industries, geography, dates, unit of analysis, and publication boundary.
2. Read [references/methodology.md](references/methodology.md).
3. Use Gemini to draft 5-8 candidate questions from representative evidence.
4. Human-review the candidates, freeze an approved cohort query set, and preserve both draft and approval record.
5. Prepare a deduplicated UTF-8 TXT or CSV website list.
6. State planned sites, Perplexity calls, per-site Gemini calls, drafting calls, and all hard caps.
7. Run the AI evidence batch with the approved `--query-set`. Resume from `results.jsonl` when interrupted.
8. Separate crawl, Perplexity, and Gemini-profile failures in analysis.
9. Use `geo_score`, mention rate, official citation rate, source URLs, and concise deterministic comments for quantitative findings.
10. Use the Gemini profile only for grouping and descriptive context.
11. Cite the dataset version, collection window, models, approved query set, sample size, failure rate, reviewer record, and SHA-256 hash.

## Outputs

- Query draft JSON: Gemini candidates, suggested pair, model/version, and mandatory review checklist.
- Approved query-set JSON: human reviewer, review date, pinned version, and frozen comparison questions.
- `results.jsonl`: resumable full evidence, query observations, source URLs, Gemini profile, scores, and hashes.
- `results.csv`: compact quantitative fields and concise comments for analysis.
- `summary.json`: score distributions, mention/citation rates, entity-grounding rate, and industry counts.
- `methodology.json`: models, versions, approved query design, call budgets, claim boundary, and dataset hash.

The concise comment must describe observed values only. It must not tell a business what to change.
