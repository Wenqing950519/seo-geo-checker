# GeoCheck Product and URL Architecture

Status: Proposed product and migration architecture  
Scope: GeoCheck public product, Product A monitoring application, Product B Developer Platform, public URLs, application hostnames, and Labs integration  
Implementation status: Documentation only; this file does not authorize code, DNS, Cloudflare, OAuth, data migration, or deployment changes.

## 1. Purpose

GeoCheck currently exists as the primary product in the LS Labs direction. The next frontend task has two parallel goals:

1. establish `lslabs.tw` as the Labs and product-discovery front door;
2. keep GeoCheck's product architecture clear while Product A and Product B are developed and later exposed through their own application surfaces.

The public Labs shell and the GeoCheck product shell must be related, but they must not become the same page or the same authenticated application.

## 2. Correct product model

The product model is:

```text
LS Labs
└── GeoCheck
    ├── Public GeoCheck
    │   └── one-time short audit and evidence-based report
    ├── Product A: GeoCheck Monitor (working name)
    │   └── scheduled monitoring and evidence-centred SaaS Dashboard
    └── Product B: GeoCheck Developer Platform (working name)
        └── API, SDKs, jobs, usage, API keys, and Developer Console
```

This is a product family, not three unrelated products named `ai-visibility`, `site-audit`, and `competitors`.

### 2.1 Public GeoCheck

The current live GeoCheck public product is the short-audit and report experience currently available at:

`https://geocheck.lisheng.cv/home`

Its future Labs canonical entry is:

`https://lslabs.tw/geocheck`

The public product can explain:

- observable AI-search visibility;
- website technical and content readiness signals;
- competitor mentions or comparison observed in the answer evidence;
- the report method and limitations;
- how a reader can inspect the evidence.

It must not promise search ranking, guaranteed AI recommendations, acquisition outcomes, or changes to a customer's website.

### 2.2 Product A — GeoCheck Monitor

`GeoCheck Monitor` is a working product name for the future monitoring product. The name can be changed later, but the product role is already clear: it extends the public short audit into repeated, project-scoped observation.

Product A owns:

- projects;
- tracked questions;
- baseline and later Runs;
- cross-period comparison;
- citations and sources;
- evidence drawer;
- data quality and incomplete coverage states;
- scheduled monitoring when the runtime is admitted.

`Dashboard` is the application surface, not the most useful product name. The product page should therefore be `GeoCheck Monitor`, while the authenticated hostname can remain `app.lslabs.tw`.

### 2.3 Product B — GeoCheck Developer Platform

`GeoCheck Developer Platform` is a working product name for the technical product. It includes the API and its developer-facing account surface.

Product B owns:

- API documentation;
- API keys;
- SDKs;
- request jobs;
- usage and quota;
- result retrieval;
- developer account settings;
- webhook or automation features only when actually released.

The human-facing management UI is the `Developer Console`. `Developments` is not used: it does not describe a developer product or console.

## 3. Capability naming under GeoCheck

The existing terms are useful as feature/category labels, but they should not be presented as three product names.

| Existing term | Product meaning | Recommended use |
|---|---|---|
| `AI Visibility` | The observable outcome being measured | GeoCheck capability and menu item |
| `Site Audit` | Website diagnosis workflow | GeoCheck report/capability section |
| `Competitor Comparison` | Comparison of competitor mentions in observed AI answers | GeoCheck report/capability section |
| `Competitors` | Too broad; implies a competitor database or monitoring tool | Do not use as a standalone product name |

Recommended GeoCheck capability menu:

```text
GeoCheck
├── Overview
├── AI Visibility
├── Site Audit
└── Competitor Comparison
```

These capabilities can later receive public landing pages if they develop independent workflows. Until then, they should remain sections of GeoCheck and not be placed under `/product/` as separate products.

## 4. Canonical URL structure

### 4.1 Public and marketing URLs

```text
https://lslabs.tw/
    Labs homepage and product index

https://lslabs.tw/geocheck
    GeoCheck public product entry and short-audit entry

https://lslabs.tw/product/geocheck-monitor
    Product A introduction and release status

https://lslabs.tw/product/developer-platform
    Product B introduction and developer entry

https://lslabs.tw/research
    Labs research index

https://lslabs.tw/research/geo-whitepaper
    GeoCheck methodology whitepaper entry
```

### 4.2 Application and service hostnames

```text
https://app.lslabs.tw/
    Product A authenticated SaaS Dashboard

https://developers.lslabs.tw/
    Product B Developer Platform front door, documentation, and Console entry

https://developers.lslabs.tw/console
    Product B authenticated Developer Console

https://api.lslabs.tw/
    API origin and service endpoints; no general Labs navigation
```

The exact hostname choice for the Developer Console is still a proposal. The important invariant is that Product A and Product B remain separate in UI, browser API, session, API key, tenant/project authority, and data access.

## 5. Migration map from the current GeoCheck host

The current host should not be cut over by changing every link at once. Establish the new canonical pages, verify them, and then redirect compatible public paths.

| Current surface | Proposed destination | Migration rule |
|---|---|---|
| `geocheck.lisheng.cv/home` | `lslabs.tw/geocheck` | Public canonical migration after parity verification |
| `geocheck.lisheng.cv/` | `lslabs.tw/geocheck` | Preserve old entry as redirect or compatibility page |
| `geocheck.lisheng.cv/whitepaper` | `lslabs.tw/research/geo-whitepaper` | Preserve the research document identity and links |
| `geocheck.lisheng.cv/app/` | `app.lslabs.tw/` | Product A application host; do not merge with Labs homepage |
| `geocheck.lisheng.cv/developers` | `lslabs.tw/product/developer-platform` | Public Developer Platform introduction |
| `geocheck.lisheng.cv/developers/docs` | `developers.lslabs.tw/docs` | Developer documentation surface |
| `api.geocheck.lisheng.cv/developers/console` | `developers.lslabs.tw/console` | Authenticated Developer Console; preserve B session/data boundary |
| `api.geocheck.lisheng.cv` | `api.lslabs.tw` | API origin migration only after TLS, auth, WAF/rate-limit, and live smoke verification |

The old `geocheck.lisheng.cv` and `api.geocheck.lisheng.cv` hosts should not be removed merely because the new URL tree has been documented.

## 6. Where the Ahrefs-like screen belongs

The multi-column mega menu belongs primarily to the LS Labs shell:

```text
lslabs.tw/
lslabs.tw/product/*
lslabs.tw/research/*
```

It should not be the main navigation of the current GeoCheck public audit page because it would make a single product page carry the entire Labs catalogue.

### 6.1 Labs mega menu

```text
Products
├── GeoCheck
├── GeoCheck Monitor
└── Developer Platform

GeoCheck capabilities
├── AI Visibility
├── Site Audit
└── Competitor Comparison

Research
├── Research Index
├── GEO Whitepaper
└── Methods & Evidence

Platform
├── SaaS Dashboard
├── Developer Console
└── API Docs
```

### 6.2 GeoCheck product navigation

The GeoCheck page can inherit a small Labs bar, but its product navigation should remain focused:

```text
[GeoCheck]   Overview   AI Visibility   Site Audit   Evidence   Research   [Start audit]
```

It may link to GeoCheck Monitor and Developer Platform in a product-family switcher, but it should not display all Labs research and personal-site navigation in the primary product bar.

### 6.3 Application shells

The authenticated Dashboard and Developer Console use task-focused shells:

- Product A: Overview, Performance, Tracked Questions, Citations & Sources, Data Quality, Evidence Drawer.
- Product B: Overview, API Keys, Jobs, Usage, Docs, SDKs, Settings.

Neither authenticated shell should use the four-column Labs mega menu as its primary navigation.

## 7. Labs homepage versus GeoCheck homepage

### Put the cross-product screen on `lslabs.tw`

The screenshot-style screen should be implemented on the LS Labs homepage and product pages because its purpose is discovery across:

- GeoCheck;
- GeoCheck Monitor;
- Developer Platform;
- research;
- methods;
- the Lab itself.

### Keep GeoCheck's existing product experience on `lslabs.tw/geocheck`

The GeoCheck page should continue to prioritise:

- the short audit;
- the report outcome;
- the observation method;
- evidence and limitations;
- the next step into Product A when monitoring is available.

This prevents the Labs homepage from becoming a second copy of the GeoCheck audit funnel and prevents GeoCheck from looking like a general corporate product catalogue.

## 8. Page specifications

### 8.1 `lslabs.tw/geocheck`

Purpose: public product entry.

Primary CTA: start a short audit.

Secondary CTAs:

- read how the method works;
- see the research/whitepaper;
- learn about GeoCheck Monitor, marked by release status.

Required content:

- plain-language product explanation;
- what is measured;
- what is not promised;
- evidence/report preview;
- state semantics for unknown, partial, and failed observations;
- feedback/research contact when approved.

### 8.2 `lslabs.tw/product/geocheck-monitor`

Purpose: explain why a one-time short audit becomes ongoing monitoring.

Suggested sections:

1. baseline versus later runs;
2. tracked questions and canonical engines;
3. evidence drawer and citations;
4. project history and comparison;
5. scheduled monitoring status;
6. private-beta boundary and app entry.

Do not show this page as a publicly available automated monitoring service until the runtime, admission, provider runner, and user-path smoke are ready.

### 8.3 `lslabs.tw/product/developer-platform`

Purpose: explain the technical product without confusing it with Product A.

Suggested sections:

1. what the API measures;
2. fixed-engine measurement contract;
3. API keys and authentication;
4. jobs and results;
5. SDKs and documentation;
6. usage, quota, and failure semantics;
7. Developer Console entry.

Do not describe fixtures, health endpoints, or a static console as general customer API availability.

## 9. Cross-product boundary rules

### Product A — Monitor

Audience: marketing implementers and site owners.

Primary value: project history, repeated Runs, change detection, citations, and evidence.

Must not expose:

- Developer API keys;
- Developer tenant data;
- API cost details;
- Developer job IDs;
- raw provider secrets.

### Product B — Developer Platform

Audience: developers and technical teams.

Primary value: API access, jobs, SDKs, usage, quota, and technical account settings.

Must not become:

- a replacement for Product A's project/evidence Dashboard;
- a second marketing homepage;
- a route for Product A browser sessions or project membership.

### Shared measurement foundation

Product A and Product B may share a trusted measurement foundation, but public copy and browser routes must keep their product semantics separate.

## 10. Release labels

Every Labs product card and cross-link must use an explicit state:

| Label | Meaning |
|---|---|
| `Public` | Publicly usable path with the relevant runtime verified |
| `Public experiment` | Public research/product experience with bounded claims |
| `Private beta` | Access controlled or release-gated product |
| `Developer preview` | Technical surface available only to an approved group |
| `Research` | Research artifact or method page |
| `Planned` | A named concept without a released implementation |

Do not use `Live`, `Available`, or `Automated monitoring` as generic marketing labels when only a static page, fixture, or gated health endpoint exists.

## 11. Recommended implementation sequence

### Step 1 — Build LS Labs shell

Create the `lslabs.tw` homepage and global navigation first. It may link to the current GeoCheck host while migration is pending.

### Step 2 — Add GeoCheck as the active project

Create the `/geocheck` product entry and keep the current short-audit/report meaning intact.

### Step 3 — Add product landing pages

Create `/product/geocheck-monitor` and `/product/developer-platform` as status-aware marketing pages. These pages can exist before their authenticated applications are publicly released.

### Step 4 — Add research index

Move the research discovery layer to `/research` while preserving the GeoCheck whitepaper's method and disclosure context.

### Step 5 — Migrate application hostnames

Only after frontend parity and auth boundary verification:

- Product A → `app.lslabs.tw`;
- Product B → `developers.lslabs.tw`;
- API origin → `api.lslabs.tw`.

### Step 6 — Redirect old public routes

After route, SEO, auth, and report-link verification, redirect old public GeoCheck URLs to their new canonical locations. Keep old API compatibility decisions separate from public marketing redirects.

## 12. Decisions still requiring confirmation

The following are proposals, not yet formal product naming decisions:

1. final public name for Product A: `GeoCheck Monitor`, `GeoCheck Insights`, or another name;
2. final public name for Product B: `GeoCheck Developer Platform` or `GeoCheck API`;
3. whether the Developer Console should be `developers.lslabs.tw/console` or remain under the API host;
4. whether the Labs research index is public at launch or initially links only to the existing whitepaper;
5. resolution of the existing metric-font rule conflict between the global and Developer-specific decisions before implementing dense metric UI.

Until these are confirmed, frontend code should use route constants and status labels rather than hard-coding a permanent product naming system into multiple pages.

## 13. Related Labs specification

The Labs shell, mega menu, homepage, responsive behaviour, and acceptance criteria are specified in:

`C:/Users/eason/Documents/LS-Labs/docs/LABS_FRONTEND_ARCHITECTURE.md`

