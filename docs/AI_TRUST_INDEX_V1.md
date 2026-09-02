# AI Trust Index v1.0.0

## What the score means

`AI Trust Index` is the product score. It measures two observable outcomes: whether AI adopts a brand in visible answers, and whether that answer captures a URL verified as the brand's first-party official source. It does not measure an AI model's internal trust.

`GEO Core` is the research record behind it. It retains every query-run, answer/source layer, direct entity query, provider/model, parser version, and `unknown` status.

## Calculation

For each approved unbranded discovery query-run with a visible, answerable output:

- Answer adoption rate = runs mentioning the verified brand / valid visible-answer runs.
- Source evidence rate = those same runs citing a verified first-party official URL / valid visible-answer runs.
- AI Trust Index = `0.65 × answer adoption rate + 0.35 × source evidence rate`.

The direct entity query can confirm entity context and aliases, but is separately recorded and excluded from this denominator. This prevents a direct brand-name search from inflating a general discovery score.

## Missing data and caps

`unknown` is not zero. A refusal, provider failure, unavailable output, or unparseable answer is recorded but excluded from the denominator. If there are no valid visible-answer runs, the index is `null`, product UI says 「目前無可用證據」, and whitepaper aggregates exclude the row while reporting its count.

When a valid answer is present but it does not adopt the brand or cite a verified official URL, that component is a measured `0`.

With fewer than two valid query-runs, the raw index remains visible but the displayed score is capped at `69`, labelled as insufficient coverage. This makes a one-run result actionable without presenting it as stable.

## Version and providers

The implementation exposes `ai-trust-1.0.0`, its component values, denominator, cap, provider/model, query-set version, and raw evidence references. Perplexity supplies observable answer/citation evidence; DeepSeek may propose or classify queries, but never contributes score points. A whitepaper freezes provider/model, approved query-set version, collection window, pipeline/parser/profile versions, failures, and dataset hash.
