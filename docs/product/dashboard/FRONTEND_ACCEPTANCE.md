# Dashboard Frontend Acceptance v1

Implement against fixtures only; do not invoke provider APIs or Developer API
routes from the browser.

## Required fixtures

1. First baseline with no prior comparison.
2. Twelve weekly complete runs from one immutable question set.
3. A partial run containing both a measured zero and an `unknown` observation.
4. A fully failed run with no invented zeroes.
5. A new question-set version that visibly breaks comparison continuity.

## Acceptance checks

- In ten seconds, a marketer can identify data freshness, next scheduled run,
  and whether the latest run is complete.
- In thirty seconds, they can move from an Overview change to its question,
  engine, and raw evidence.
- Every percentage displays its numerator and denominator. Unknown and failed
  data are chart gaps, never values of zero.
- No Dashboard screen, API response, local storage entry, or error UI mentions
  Developer API keys, API quota, cost, tenant, customer job, or SDK usage.
- Keyboard users can reach filters, tables, chart data alternatives, and the
  Evidence Drawer. Color is never the only status signal.
