# GeoCheck Dashboard UI Specification v1

## Product boundary

Dashboard is the Product A workspace for a marketer tracking a brand's observed
presence in AI answers over time. It is not the Developer Console. The Developer
Console manages API keys, request jobs, usage, costs, SDK documentation, and
technical account settings; none of those concepts appear in Dashboard UI.

Dashboard starts at `/app/...` when a visual client exists. Its browser API is
`/app-api/v1/...`; it never calls `/v1/measurements` or `/v1/console/...` from a
browser.

## Global frame

Desktop is the primary working mode. The persistent controls are Project,
4/12/26-week range, engine filter, question-tag filter, actual data freshness,
and next scheduled run. A manual execution control, future Agent output, and
Actions are secondary controls, not the primary user journey.

Use a persistent left navigation:

1. Overview
2. Performance
3. Tracked Questions
4. Citations & Sources
5. Data Quality

All screens use the same Evidence Drawer. A click on a chart point, source, or
question opens its observation evidence: question, engine, model, actual
observation time, raw answer, brand mention, official citation, and citations.

## Screen behavior

### Overview

The first viewport answers: when was data last updated, is it complete, and what
changed recently? Show four ratio metrics with explicit numerators and
denominators: brand mention rate, official citation rate, distinct citation
domains, and measured observation coverage. Every metric includes a sparkline
and a delta only when the prior run has the same question-set version.

### Performance

Show weekly points, not a fictitious real-time feed. The primary chart compares
engines; secondary tables compare tracked questions. A question-set version
change is a chart boundary and disables deltas across that boundary.

### Tracked Questions

Group questions by the immutable Question Set version. Each row shows intent,
tags, latest four-engine statuses, and a compact trend. Changing questions
creates a new version; it does not rewrite historical runs.

### Citations & Sources

Rank sources by observed citation count, with first-party citations explicitly
marked. The screen describes observed citations only; it does not infer source
authority, traffic impact, or recommendation causality.

### Data Quality

List each scheduled Tracking Run with `complete`, `partial`, or `failed`, plus
expected/measured/unknown/failed coverage. `unknown`, provider failure, and a
measured zero are always distinct visual states.

## State vocabulary

| State | Meaning | UI rule |
|---|---|---|
| `measured` + `false` | A valid observed zero | Include in denominator and display zero |
| `unknown` | No usable answer evidence | Gap in chart; exclude from rate denominator |
| `failed` | Provider or processing failure | Gap in chart; show failure reason |
| `partial` run | Some expected observations are unavailable | Keep valid evidence and show coverage warning |
| no prior run | Baseline only | No delta and no empty trend line |

Do not render an all-engine composite score. The AI Trust Index remains a
separate single-site audit construct and is never synthesized from Dashboard
tracking points.
