# Blind three-model API evaluation

- Target: https://geocheck.lisheng.cv/
- Evaluated at: 2026-08-01T12:00:50.098Z
- Test contract: same evidence, same query-planning prompt, same JSON schema, max 2048 output tokens, one direct API call per candidate, no retries.
- Labels are intentionally blind: this file does not disclose the provider/model mapping.

| Candidate | API status | Input tokens | Output tokens | Total tokens | Reasoning/thought tokens | Latency (ms) | Contract | Queries | Intent types | Invalid queries |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| candidate-b | success | 2804 | 1149 | 3953 | — | 10374 | fail | 7 | 3 | 4 |
| candidate-c | success | 2908 | 1018 | 3926 | — | 4209 | fail | 5 | 3 | 1 |
| candidate-a | failed | — | — | — | — | — | — | — | — | — |

## Automated interpretation

- Token counts are the provider-reported values. A missing value means that provider did not return that metric; it is not treated as zero.
- Contract means: all required fields present, 5–8 non-empty candidate queries, at least two intents, valid 1–5 ratings, and no obvious brand/domain/SEO/GEO forbidden wording.
- This is one controlled observation, not a statistical quality ranking. Read the three candidate files blind before deciding whether to expand to a larger evaluation set.
