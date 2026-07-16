---
name: geo-whitepaper-research
description: Run reproducible GeoCheck industry-whitepaper research using Perplexity search evidence for quantified GEO visibility and Gemini Flash-Lite for basic site, industry, structure, and content classification. Use when Codex needs to measure tens or hundreds of websites, export CSV or JSONL evidence, compare industries, quantify brand mentions or official citations, or prepare concise whitepaper findings without generating optimization advice.
---

# GeoCheck Whitepaper Research

Use the production GeoCheck measurement pipeline. Measure every included whitepaper site with Perplexity, and use Gemini Flash-Lite only to standardize basic information and observed structure. Do not generate optimization suggestions.

## Required contract

- Import the shared production pipeline from `mock-api/lib/geo-measurement.js`; never copy scoring weights into the Skill.
- Run one exact-entity authority query and two unbranded discovery queries per site through Perplexity.
- Run one Gemini Flash-Lite profile call per site for entity name, industry, business scope, geography, page purpose, structure, and observed topics.
- Do not let Gemini change `geo_score`, search observations, citations, or deterministic rule points.
- Do not request or output recommendations, actions, rewrites, expected impact, or optimization copy.
- Preserve failed or unavailable evidence as `null` or `unknown`; never convert it to zero.
- Freeze models, query design, collection period, pipeline/profile versions, failure rate, and dataset SHA-256.
- Limit claims to the tested Perplexity model, fixed query set, and collection window. Do not claim universal visibility across all AI systems.
- Aggregate or anonymize identifiable low-scoring small businesses unless publication consent exists.

## Default research mode

Run from the project root:

```powershell
node .agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs `
  --input research-input/sites.csv `
  --output-dir research-output/taiwan-sme-2026 `
  --max-perplexity-calls 1200 `
  --max-gemini-calls 400 `
  --concurrency 2 `
  --delay-ms 500
```

For 400 new sites, the exact planned maximum is 1,200 Perplexity calls and 400 Gemini calls. State these numbers before execution. The script aborts before the first paid call if either cap is too low.

Use `scripts/run-rules-batch.mjs` only as an optional zero-API crawl preflight. Its `geo_score` remains `null` and it cannot support AI-visibility claims.

## Workflow

1. Define the research question, industries, geography, dates, unit of analysis, and publication boundary.
2. Read [references/methodology.md](references/methodology.md).
3. Prepare a deduplicated UTF-8 TXT or CSV website list.
4. State planned sites, Perplexity calls, Gemini calls, and both hard caps.
5. Run the AI evidence batch. Resume from `results.jsonl` when interrupted.
6. Separate crawl, Perplexity, and Gemini-profile failures in analysis.
7. Use `geo_score`, mention rate, official citation rate, source URLs, and concise deterministic comments for quantitative findings.
8. Use the Gemini profile only for grouping and descriptive context.
9. Cite the dataset version, collection window, models, query set, sample size, failure rate, and SHA-256 hash.

## Outputs

- `results.jsonl`: resumable full evidence, query observations, source URLs, Gemini profile, scores, and hashes.
- `results.csv`: compact quantitative fields and concise comments for analysis.
- `summary.json`: score distributions, mention/citation rates, entity-grounding rate, and industry counts.
- `methodology.json`: models, versions, fixed query design, call budgets, claim boundary, and dataset hash.

The concise comment must describe observed values only. It must not tell a business what to change.
