# Opportunity Scoring Rubric

Use this rubric to rank content and technical recommendations. Adjust weights in
`config.scoring.weights` when the business changes.

## Default Formula

```text
opportunity_score =
  business_value * 0.30
+ ai_visibility_gap * 0.20
+ conversion_intent * 0.20
+ evidence_strength * 0.15
+ existing_authority * 0.10
- content_cost * 0.05
```

Score each factor from 0 to 5 unless config overrides it.

## Factor Definitions

- `business_value`: How directly this attracts valuable customers or supports priority offers.
- `ai_visibility_gap`: How important the question is and how absent we are from AI answers/sources.
- `conversion_intent`: How close the query/question is to a buying or evaluation moment.
- `evidence_strength`: Whether we have specific facts, cases, data, or third-party proof.
- `existing_authority`: Whether the site already has a page, backlinks, rankings, or topical depth.
- `content_cost`: Effort/risk to create or improve the content. Higher cost subtracts from score.

## Overrides

Always raise priority when:

- The question maps to the primary ICP and decision-stage intent.
- Competitors are repeatedly cited and the brand has a credible counter-position.
- The content can reuse strong evidence already in `evidence-inventory.md`.

Always lower priority when:

- The topic conflicts with `strategy.md`.
- It attracts users unlikely to buy or trust the product.
- The recommendation would require claims unsupported by evidence.

## Output Requirement

When ranking opportunities, show the top 3 factors driving the score. Do not show fake precision;
round final scores to one decimal place.
