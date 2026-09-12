# LS Labs and GeoCheck Product Architecture

Status: Current product and URL architecture
Authority: `docs/DECISION_LOG.md` D-048 (hostnames) and D-049 (layer model and content placement)
Scope: LS Labs brand layer, GeoCheck measurement capability, the three delivery surfaces, public URLs, application hostnames, and SEO content placement
Implementation status: Documentation only; this file does not authorize code, DNS, Cloudflare, OAuth, data migration, or deployment changes.

## 1. Purpose

Two constraints drive this architecture, both confirmed by the user on 2026-09-11:

1. `lslabs.tw` is the parent brand and the primary SEO surface. It is also the entity presented in innovation and startup competitions, so it must read as an organisation with a product family, not as a navigation page in front of one tool.
2. GeoCheck's measurement capability is delivered through three distinct surfaces that must stay separate in session, authorization, and data access.

The earlier revision of this file modelled LS Labs, GeoCheck, and Platform as three sibling business entities. That model is superseded: it mixed an organisation, a product, and a delivery channel on a single axis; it placed two different surfaces (`geocheck.` and `app.`) inside one entity despite D-042 requiring their separation; and it left no slot for a future second capability.

## 2. Layer model

The correct model has three layers, not three siblings.

```text
Brand layer        LS Labs                      lslabs.tw
                   research house, product family, narrative, SEO

Capability layer   GeoCheck                     (concept; no dedicated host)
                   four-engine measurement core, AI Trust Index v1 methodology

Delivery layer     free audit   geocheck.lslabs.tw
                   monitoring   app.lslabs.tw
                   developer    platform.lslabs.tw
```

The capability layer deliberately has no hostname. GeoCheck is what the three surfaces deliver, not a fourth place to visit. This is what keeps the organisation narrative coherent: one measurement engine, three ways to consume it, with room for a second capability under the same brand later.

### 2.1 Benchmark

The structural benchmark is OpenAI, which separates the same three layers:

| Layer | OpenAI | LS Labs |
|---|---|---|
| Brand and research | `openai.com` | `lslabs.tw` |
| Flagship product | `chatgpt.com` | `geocheck.lslabs.tw` + `app.lslabs.tw` |
| Developer platform | `platform.openai.com` | `platform.lslabs.tw` |

The decisive property being copied is that research, methodology, and narrative live on the brand domain, while the product hosts carry product only.

DeepSeek is not a valid benchmark here. In that structure the brand and the model are the same entity, so `deepseek.com` sits at the capability layer. LS Labs is a research house whose capability is GeoCheck; adopting the DeepSeek mapping would demote GeoCheck to a delivery surface and leave the brand layer holding nothing but links.

For SEO content strategy specifically, the benchmark is Ahrefs and Semrush: ranking assets sit on paths of the primary domain, and the tool sits behind a call to action.

### 2.2 Entity table (external and pitch use)

| 層 | 實體 | 網域與入口 | 角色與責任邊界 | 品牌標誌與署名 |
|---|---|---|---|---|
| 品牌層 | LS Labs | `https://lslabs.tw/` | 母品牌／研發總部：組織願景、品牌信念、研究白皮書、方法論、內容行銷與全域跨產品導航（Mega Menu）。承載全站 SEO 權重。不承接個別產品量測表單或 API Key 管理。 | LS-Labs（幾何光學 Monogram 徽章） |
| 能力層 | GeoCheck | 無獨立網域 | 量測能力本體：固定四引擎量測（D-029）、AI 信任指數 v1 評分方法論、證據與資料品質語義。作為概念層存在，由下列三個交付面共用（D-047 內部通道）。 | GeoCheck（能力名稱，非站點） |
| 交付層 | 免費快檢 | `https://geocheck.lslabs.tw/` | 匿名、無登入、一次性短檢測與報告。漏斗頂端轉換工具。 | GeoCheck<br>By LS-Labs |
| 交付層 | Dashboard（Product A） | `https://app.lslabs.tw/` | 登入制 SaaS：Project、追蹤題組、Tracking Run、跨期比較、來源證據抽屜。`gds_` session 與 `/app-api/v1`。 | GeoCheck Track<br>By LS-Labs |
| 交付層 | Platform（Product B） | `https://platform.lslabs.tw/` | 開發者平台：`/v1` API、SDK、技術文檔、API Key、用量與計費控台。`gcs_`／`gck_` 與 `developer_*` 資料表，與 A 完全隔離（D-042）。 | Platform<br>By LS-Labs |

`geocheck.` and `app.` are separate rows because D-042 requires them to be separate in UI, browser API, session, API key, tenant/project authority, and data access. They must not be presented as one entity.

## 3. Content placement and SEO

Google treats subdomains largely as separate sites, so authority does not automatically consolidate from `geocheck.lslabs.tw` into `lslabs.tw`. Because `lslabs.tw` is the primary SEO surface, ranking assets belong on its paths.

### 3.1 Content assets — primary domain paths

```text
https://lslabs.tw/
    Labs homepage, product family index, organisation narrative

https://lslabs.tw/geocheck
    GeoCheck explanation, what is measured, what is not promised,
    method summary, evidence preview; primary CTA into the free audit tool

https://lslabs.tw/product/geocheck-track
    Product A introduction and release status

https://lslabs.tw/product/platform
    Product B introduction and developer entry

https://lslabs.tw/research
    Labs research index

https://lslabs.tw/research/geo-whitepaper
    GEO methodology whitepaper

https://lslabs.tw/blog/*
    Content marketing
```

### 3.2 Tool and application hostnames

```text
https://geocheck.lslabs.tw/
    The free audit tool itself, entered from the lslabs.tw/geocheck CTA

https://app.lslabs.tw/
    Product A authenticated Dashboard; same-origin browser API at /app-api/v1

https://platform.lslabs.tw/
    Product B developer landing, documentation, Console, and same-origin /v1 API
```

### 3.3 The `lslabs.tw/geocheck` and `geocheck.lslabs.tw` pair

Both exist, and they are not duplicates:

| | `lslabs.tw/geocheck` | `geocheck.lslabs.tw` |
|---|---|---|
| Purpose | Explain and rank | Run the audit |
| Audience | Search traffic, evaluators, competition judges | Someone ready to test a site |
| Content | Method, scope, limits, evidence examples | Input form, run state, report output |
| SEO | Canonical, indexed, internally linked | Thin; must not compete with the content page |
| Entry | Organic search, Labs navigation | CTA from the content page |

To avoid keyword cannibalisation, `geocheck.lslabs.tw` must not carry a full duplicate of the marketing copy, and the content page is the canonical target for GeoCheck queries.

## 4. Capability naming under GeoCheck

The existing terms are useful as feature/category labels, but they should not be presented as product names.

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

These capabilities can later receive public landing pages if they develop independent workflows. Until then, they remain sections of the GeoCheck content page and are not placed under `/product/` as separate products.

## 5. Migration map from the current GeoCheck host

The current host should not be cut over by changing every link at once. Establish the new canonical pages, verify them, and then redirect compatible public paths.

| Current surface | Destination | Migration rule |
|---|---|---|
| `geocheck.lisheng.cv/home` | `lslabs.tw/geocheck` | Public canonical migration after parity verification; this is the content page, not the tool |
| `geocheck.lisheng.cv/` (audit form) | `geocheck.lslabs.tw/` | The tool surface, reached from the content page CTA |
| `geocheck.lisheng.cv/whitepaper` | `lslabs.tw/research/geo-whitepaper` | Preserve the research document identity and links |
| `geocheck.lisheng.cv/app/` | `app.lslabs.tw/` | Product A application host; do not merge with Labs homepage |
| `geocheck.lisheng.cv/developers` | `lslabs.tw/product/platform` | Public Developer Platform introduction |
| `geocheck.lisheng.cv/developers/docs` | `platform.lslabs.tw/docs` | Developer documentation surface |
| `api.geocheck.lisheng.cv/developers/console` | `platform.lslabs.tw/console` | Authenticated Developer Console; preserve B session/data boundary |
| `api.geocheck.lisheng.cv` | `platform.lslabs.tw/v1` | API origin migration only after TLS, auth, WAF/rate-limit, and live smoke verification |

Per D-048, `geocheck.lisheng.cv` and `api.geocheck.lisheng.cv` are retained as compatibility entries and must not be removed merely because the new URL tree has been documented. Existing API/SDK non-GET requests must not be answered with a page redirect.

## 6. Where the cross-product screen belongs

The multi-column mega menu belongs to the LS Labs shell:

```text
lslabs.tw/
lslabs.tw/product/*
lslabs.tw/research/*
```

It should not be the main navigation of a product surface, because that would make a single product page carry the entire Labs catalogue.

### 6.1 Labs mega menu

```text
Products
├── GeoCheck
├── GeoCheck Track
└── Platform

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

The `lslabs.tw/geocheck` content page can inherit a small Labs bar, but its product navigation should remain focused:

```text
[GeoCheck]   Overview   AI Visibility   Site Audit   Evidence   Research   [Start audit]
```

It may link to GeoCheck Track and Platform in a product-family switcher, but it should not display all Labs research and personal-site navigation in the primary product bar.

### 6.3 Application shells

The authenticated Dashboard and Developer Console use task-focused shells:

- Product A: Overview, Performance, Tracked Questions, Citations & Sources, Data Quality, Evidence Drawer.
- Product B: Overview, API Keys, Jobs, Usage, Docs, SDKs, Settings.

Neither authenticated shell should use the four-column Labs mega menu as its primary navigation.

## 7. Labs homepage versus the GeoCheck content page

### Put the cross-product screen on `lslabs.tw`

The multi-column discovery screen belongs on the LS Labs homepage and product pages because its purpose is discovery across:

- GeoCheck;
- GeoCheck Track;
- Platform;
- research;
- methods;
- the Lab itself.

### Keep the GeoCheck funnel on `lslabs.tw/geocheck`

The GeoCheck content page should continue to prioritise:

- what the short audit does;
- the report outcome;
- the observation method;
- evidence and limitations;
- the next step into Product A when monitoring is available;
- a single clear CTA into `geocheck.lslabs.tw`.

This prevents the Labs homepage from becoming a second copy of the GeoCheck audit funnel and prevents GeoCheck from looking like a general corporate product catalogue.

## 8. Page specifications

### 8.1 `lslabs.tw/geocheck`

Purpose: public product entry and primary ranking page.

Primary CTA: start a short audit on `geocheck.lslabs.tw`.

Secondary CTAs:

- read how the method works;
- see the research/whitepaper;
- learn about GeoCheck Track, marked by release status.

Required content:

- plain-language product explanation;
- what is measured;
- what is not promised;
- evidence/report preview;
- state semantics for unknown, partial, and failed observations;
- feedback/research contact when approved.

### 8.2 `lslabs.tw/product/geocheck-track`

Purpose: explain why a one-time short audit becomes ongoing monitoring.

Suggested sections:

1. baseline versus later runs;
2. tracked questions and canonical engines;
3. evidence drawer and citations;
4. project history and comparison;
5. scheduled monitoring status;
6. private-beta boundary and app entry.

Do not show this page as a publicly available automated monitoring service until the runtime, admission, provider runner, and user-path smoke are ready.

### 8.3 `lslabs.tw/product/platform`

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

### Product B — Platform

Audience: developers and technical teams.

Primary value: API access, jobs, SDKs, usage, quota, and technical account settings.

Must not become:

- a replacement for Product A's project/evidence Dashboard;
- a second marketing homepage;
- a route for Product A browser sessions or project membership.

### Shared measurement foundation

Product A and Product B share a trusted measurement foundation through the internal channel confirmed in D-047, but public copy and browser routes must keep their product semantics separate.

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

### Step 2 — Add the GeoCheck content page

Create `/geocheck` as the ranking and explanation page, with its CTA pointing at the audit tool host.

### Step 3 — Add product landing pages

Create `/product/geocheck-track` and `/product/platform` as status-aware marketing pages. These pages can exist before their authenticated applications are publicly released.

### Step 4 — Add research index

Move the research discovery layer to `/research` while preserving the GEO whitepaper's method and disclosure context.

### Step 5 — Migrate application hostnames

Only after frontend parity and auth boundary verification, and per the D-048 release boundary (Cloudflare host routing plus exact Google OAuth callbacks):

- free audit tool → `geocheck.lslabs.tw`;
- Product A → `app.lslabs.tw`;
- Product B landing, docs, Console, and `/v1` → `platform.lslabs.tw`.

### Step 6 — Redirect old public routes

After route, SEO, auth, and report-link verification, redirect old public GeoCheck URLs to their new canonical locations. Keep old API compatibility decisions separate from public marketing redirects.

## 12. Decisions still requiring confirmation

The following are proposals, not yet formal decisions:

1. final public name for Product A: `GeoCheck Track`, `GeoCheck Insights`, or another name;
2. whether the Labs research index is public at launch or initially links only to the existing whitepaper;
3. resolution of the existing metric-font rule conflict between the global and Developer-specific decisions before implementing dense metric UI;
4. the concrete Cloudflare Pages routing and file layout for moving `home.html` / `brand.html` into the `lslabs.tw` path structure described in §3.1.

Until these are confirmed, frontend code should use route constants and status labels rather than hard-coding a permanent product naming system into multiple pages.

## 13. Related Labs specification

The Labs shell, mega menu, homepage, responsive behaviour, and acceptance criteria are specified in:

`C:/Users/eason/Documents/LS-Labs/docs/LABS_FRONTEND_ARCHITECTURE.md`
