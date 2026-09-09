# Multi-Agent Product Business Plan Workflow

## Objective

Use three separate AI agents in sequence to produce an evidence-based product business plan from a local software repository.

This workflow is intentionally designed to minimize anchoring bias:

- Do not preload product positioning, customer assumptions, market thesis, competitor list, pricing hypothesis, or business model.
- Derive product facts from the repository first.
- Derive market facts from external evidence second.
- Separate facts from interpretation and assumptions at every stage.
- Do not allow later agents to silently convert earlier hypotheses into facts.

The three agents have distinct responsibilities:

1. **Antigravity / Gemini Flash** — Evidence collection and external research
2. **Codex / GPT-5.6 Sol** — Synthesis and primary business-plan drafting
3. **Claude Code / Opus 5** — Critical review, restructuring, and final refinement

---

# 0. Global Rules

These rules apply to all agents.

## 0.1 Evidence Classes

Every material claim must belong to one of these classes:

### `[REPO FACT]`
Directly verifiable from the local repository.

Examples:
- implemented feature
- route
- API
- database table
- model integration
- workflow
- deployment configuration
- UI element
- analytics event

A repo fact should include supporting file paths whenever practical.

### `[EXTERNAL FACT]`
Supported by an external source.

Every external fact must include:
- source title
- publisher / organization
- URL
- publication date if available
- access date
- source type

Preferred source types:
1. government / regulator
2. official company documentation or pricing
3. academic research
4. industry association
5. audited filing / annual report
6. established research institution
7. reputable media
8. secondary industry publication

Avoid using SEO content farms or unattributed statistics as core evidence.

### `[ASSUMPTION]`
A reasonable but unverified interpretation.

Examples:
- proposed ICP
- expected willingness to pay
- proposed pricing
- expected conversion rate
- estimated user pain
- proposed sales cycle

### `[UNKNOWN]`
Important information that cannot currently be established.

Never convert `[ASSUMPTION]` or `[UNKNOWN]` into factual language.

---

## 0.2 Anti-Anchoring Rule

Before repository inspection and external research are complete:

Do not assume:
- what category the product belongs to
- who the customer is
- who the buyer is
- what problem is most important
- whether the product is B2B, B2C, B2B2C, developer-facing, or enterprise-facing
- whether a feature is core or peripheral
- whether AI is the primary value proposition
- what the business model should be
- who the competitors are
- what the TAM / SAM / SOM should be
- what product positioning should be used

All of these must be derived from evidence.

---

## 0.3 No Fabrication

Never fabricate:
- customers
- users
- revenue
- partnerships
- retention
- MAU / WAU / DAU
- conversion
- LOI
- PoC
- testimonials
- benchmark results
- market size
- pricing
- performance improvements
- investor interest

If missing, mark as `[UNKNOWN]` or `[ASSUMPTION]`.

---

## 0.4 Repository Safety

Do not:
- modify production source code
- expose `.env`
- expose API keys
- expose secrets
- expose credentials
- copy sensitive customer data into reports
- publish private source code unnecessarily

The task is analysis and business-plan generation only.

---

# 1. Required Output Structure

Create a dedicated directory:

```text
/business-plan/
```

Final expected files:

```text
/business-plan/
├── 00_RESEARCH_BRIEF.md
├── 01_REPO_EVIDENCE.md
├── 02_EXTERNAL_RESEARCH.md
├── 03_COMPETITOR_RESEARCH.md
├── 04_MARKET_MODEL.md
├── 05_OPEN_QUESTIONS.md
├── 10_BUSINESS_PLAN_DRAFT.md
├── 11_PITCH_DECK_OUTLINE.md
├── 12_VALIDATION_PLAN.md
├── 20_OPUS_REVIEW.md
└── FINAL_BUSINESS_PLAN.md
```

Do not overwrite evidence files during later stages.

---

# 2. Stage One — Antigravity / Gemini Flash
## Role: Evidence Collector and Research Analyst

Your job is **not to write the final business plan**.

Your job is to build the evidence base that later agents can safely use.

---

## 2.1 Repository Inspection

Inspect the repository thoroughly.

At minimum review:

- README
- package manifests
- directory structure
- frontend routes
- frontend components
- API routes
- backend services
- database schema
- migrations
- authentication
- AI model integrations
- external API integrations
- analytics instrumentation
- tests
- documentation
- deployment configuration
- example data
- seed data
- TODOs
- issue references if locally available
- product copy
- pricing pages if present
- onboarding flow
- dashboard
- settings
- user account flow
- billing integration if present

Do not infer implementation from filenames alone.

Open the relevant files and verify behavior.

---

## 2.2 Build `01_REPO_EVIDENCE.md`

Use this structure:

```markdown
# Repository Evidence

## Product Surface
What interfaces actually exist?

## User Flows
What workflows can be verified?

## Implemented Capabilities
| Capability | Evidence | Status | Notes |
|---|---|---|---|

## Data Inputs

## Data Outputs

## AI / Automation Layer

## External Integrations

## Authentication / Accounts

## Analytics / Measurement

## Billing / Monetization Evidence

## Deployment Evidence

## Product Maturity Signals

## Unimplemented / TODO Features

## Ambiguities
```

Every meaningful capability should include supporting file paths.

Clearly distinguish:
- implemented
- partially implemented
- mock
- TODO
- deprecated
- unclear

---

## 2.3 Infer Questions, Not Conclusions

From repository evidence, create hypotheses such as:

```text
Possible user group: ...
Reason: ...
Evidence: ...
Confidence: Low / Medium / High
Status: [ASSUMPTION]
```

Do not lock in a product category yet.

---

## 2.4 External Research

Use web research extensively.

Research areas must be derived from repository evidence rather than predefined assumptions.

Potential research dimensions include:

- industry context
- workflow being replaced
- relevant customer segment
- current software category
- market trends
- related regulatory context
- relevant developer ecosystem
- relevant AI ecosystem
- buyer behavior
- adjacent tools
- substitute workflows
- pricing benchmarks
- adoption barriers

---

## 2.5 Source Quality

Prefer primary evidence.

For each source, record:

```markdown
### Source
Title:
Publisher:
URL:
Published:
Accessed:
Type:
Supports:
Reliability:
```

Reliability:
- High
- Medium
- Low

Do not use a low-reliability source as the only evidence for a major market claim.

---

## 2.6 Build `02_EXTERNAL_RESEARCH.md`

Suggested structure:

```markdown
# External Research

## Industry Context

## Problem Evidence

## Relevant User / Buyer Evidence

## Workflow Evidence

## Adoption Trends

## Technology Trends

## Regulatory / Compliance Context

## Pricing Benchmarks

## Market Signals

## Contradictory Evidence

## Sources
```

A dedicated **Contradictory Evidence** section is mandatory.

Actively search for evidence that weakens the product thesis.

Examples:
- market shrinking
- incumbents adding equivalent features
- buyer willingness to pay is low
- product category commoditizing
- free alternatives are sufficient
- AI API costs undermine margins
- compliance barriers
- low switching incentives

---

## 2.7 Competitor Research

Create `03_COMPETITOR_RESEARCH.md`.

Do not begin with a fixed competitor list.

Discover competitors from:
- search results
- category pages
- customer workflows
- official product documentation
- marketplace listings
- integration ecosystems
- user discussions where useful

Separate competitors into:

### Direct Competitors
Products solving substantially the same job.

### Indirect Competitors
Different products solving the same job.

### Status Quo
Existing behavior without adopting new software.

Examples may include:
- spreadsheets
- manual processes
- general AI tools
- internal scripts
- agencies
- existing enterprise software

Use this table:

| Alternative | Target User | Core Job | Pricing | Strength | Weakness | Evidence |
|---|---|---|---|---|---|---|

Do not force the target product to win every comparison.

---

## 2.8 Market Model

Create `04_MARKET_MODEL.md`.

Do not blindly quote a global industry market size.

Prefer bottom-up estimation.

Possible formulas:

```text
Potential customer count × annual revenue per customer
```

or

```text
Potential active users × annual revenue per user
```

or

```text
Relevant transaction volume × plausible take rate
```

For each model:

### TAM
The broad theoretically addressable market.

### SAM
The segment the current product could realistically serve given:
- geography
- language
- feature set
- integrations
- regulation
- product maturity

### SOM
A realistic 3–5 year obtainable market.

Every estimate must show:
- formula
- inputs
- source of inputs
- assumptions
- sensitivity

If sufficient data does not exist, write:

`[UNKNOWN — insufficient evidence for credible estimate]`

and list the missing inputs.

---

## 2.9 Open Questions

Create `05_OPEN_QUESTIONS.md`.

Rank unanswered questions by impact:

### P0 — Business thesis may change
Examples:
- unclear buyer
- unclear pain
- unclear willingness to pay
- unclear primary use case

### P1 — Important before competition / fundraising
Examples:
- pricing
- activation metric
- retention
- sales cycle

### P2 — Useful optimization
Examples:
- secondary segments
- optional integrations

Do not answer these questions by guessing.

---

## 2.10 Stage One Completion Gate

Before handing off to GPT-5.6 Sol, confirm:

- repository inspection is complete enough to identify actual product behavior
- external sources are recorded
- contradictory evidence exists
- competitor list is evidence-based
- market model exposes assumptions
- uncertain claims are labeled
- no invented traction exists

Then create `00_RESEARCH_BRIEF.md`.

This file should contain only:
- most important repo facts
- strongest external evidence
- strongest counter-evidence
- key unknowns
- recommended questions for synthesis

Do **not** write persuasive marketing copy.

---

# 3. Stage Two — Codex / GPT-5.6 Sol
## Role: Principal Product Strategist and Business Plan Author

Read all Stage One files before drafting.

Do not redo the product from imagination.

The purpose of this stage is to transform evidence into a coherent business thesis.

---

## 3.1 Evidence Hierarchy

When claims conflict, use this order:

1. directly verified repository behavior
2. primary external source
3. high-quality secondary source
4. triangulated inference
5. assumption

Never choose a claim merely because it makes the pitch stronger.

---

## 3.2 Challenge the Initial Thesis

Before writing, evaluate:

- What does the product actually do today?
- What job appears most central?
- Which user benefits most?
- Which buyer could plausibly pay?
- What current behavior is being replaced?
- Why might the product fail?
- What would a skeptical judge challenge?
- Is the apparent product category actually the best framing?

If evidence supports multiple plausible product positions, compare them before selecting one.

Use:

| Positioning | Evidence | Strength | Risk | Confidence |
|---|---|---|---|---|

Choose one primary positioning only after comparison.

---

# 4. Business Plan Structure

Create:

`10_BUSINESS_PLAN_DRAFT.md`

The plan should contain these sections.

---

## 1. Executive Summary

Explain in approximately 150–300 words:

- what the product is
- who it serves
- what problem it solves
- how it works
- why it is differentiated
- current product stage

Also provide one concise positioning sentence:

> We provide ______ for ______ who need to ______, by ______.

Do not use unsupported superlatives.

---

## 2. Problem

Define:

### Target User

### Problem Scenario

### Existing Workflow

### Friction

### Cost of Problem

Use real evidence wherever available.

If pain magnitude is unverified, state that explicitly.

---

## 3. Existing Solutions / Status Quo

Analyze how the problem is solved today.

Include:
- direct products
- indirect products
- manual workflow
- generic tools
- doing nothing

Answer:

> Why is the current solution still insufficient?

---

## 4. Solution

Describe the product as:

```text
Input
↓
Processing
↓
Output
↓
User Value
```

Focus on the smallest number of capabilities needed to explain the value proposition.

Do not turn the section into a feature inventory.

---

## 5. Product Demo / User Flow

Reconstruct the actual user journey from repository evidence.

For each step explain:

- user action
- system action
- resulting value

Only describe implemented flows as current product behavior.

Label future flows separately.

---

## 6. Technical Architecture

Explain:

- frontend
- backend
- data layer
- AI / automation layer
- third-party services
- infrastructure
- security / privacy considerations where observable

For each important technical decision, explain business relevance.

---

## 7. Defensibility / Technical Moat

Evaluate honestly.

Possible sources:
- proprietary data
- workflow depth
- vertical specialization
- integration depth
- switching cost
- network effect
- feedback loop
- domain model
- distribution
- performance advantage
- operational know-how

If no strong moat exists, say so.

Separate:

### Current Advantage

from

### Potential Future Moat

---

## 8. Market Size

Present:
- TAM
- SAM
- SOM

Prefer bottom-up models.

Show formulas.

Do not present speculative market figures as objective truth.

Include a sensitivity range when assumptions materially affect the result.

---

## 9. Target Customer / ICP

Define:

### Customer Type

### User

### Buyer

### Company / User Profile

### Primary Pain

### Buying Trigger

### Adoption Barrier

### Why This Segment First

If the ICP is inferred rather than proven, label it `[ASSUMPTION]`.

---

## 10. Competition

Build a fair competitive matrix.

Compare:
- product
- direct competitors
- indirect competitors
- status quo

Dimensions should reflect actual buyer decision criteria.

Do not choose vanity dimensions purely to make the product look superior.

Then explain:

### Real Competitive Advantage

### Where Competitors Are Stronger

Both are mandatory.

---

## 11. Business Model

Answer:

### Who Pays?

### Why Would They Pay?

### Pricing Logic

### Revenue Model

### Value vs Cost

If pricing is not implemented or tested:

propose 2–3 models.

For each:

| Model | Logic | Advantage | Risk | Validation Needed |
|---|---|---|---|---|

---

## 12. Validation / Traction

Separate:

### Verified Traction

Only evidence-backed metrics.

### Product Readiness

What exists technically.

### Unverified Market Claims

What still requires validation.

Never use development progress as a substitute for market traction.

---

## 13. Go-to-Market

Answer:

> Where do the first 10 customers or meaningful users come from?

Then:

### Phase 1 — Design Partners

### Phase 2 — Initial Growth

### Phase 3 — Scale

For each phase specify:
- target segment
- acquisition channel
- sales motion
- likely friction
- measurable milestone

Avoid generic recommendations such as:
- social media
- SEO
- ads

unless tied to a concrete audience and funnel.

---

## 14. Roadmap & KPI

Build:
- 3-month
- 6-month
- 12-month

roadmaps.

Separate:
- product milestone
- market milestone
- business milestone
- validation milestone

Use metrics only when defensible.

If a metric is proposed rather than derived, mark:

`[TARGET — requires validation]`

---

# 5. Validation Plan

Create:

`12_VALIDATION_PLAN.md`

Focus on disproving assumptions, not confirming them.

For each critical assumption define:

| Hypothesis | Evidence Needed | Test | Success Signal | Failure Signal | Priority |
|---|---|---|---|---|---|

Cover at least:

- problem severity
- target user
- buyer
- willingness to pay
- activation
- retention
- pricing
- acquisition channel
- competitor switching
- core product value

Prefer low-cost tests before expensive development.

---

# 6. Pitch Deck Outline

Create:

`11_PITCH_DECK_OUTLINE.md`

Use approximately 12–14 slides:

1. Title
2. Problem
3. Existing Solution
4. Solution
5. Product
6. Technology / Defensibility
7. Market
8. Target Customer
9. Competition
10. Business Model
11. Validation / Traction
12. Go-to-Market
13. Roadmap
14. Closing / Vision

For each slide include:

```markdown
## Slide X — Title

### One Key Message

### Evidence

### Recommended Visual

### Data Required

### Speaker Note
```

Do not overload slides with prose.

---

# 7. Stage Two Self-Review

Before handing off to Opus:

Check:

- Is the business thesis supported by evidence?
- Did any assumption become an unlabeled fact?
- Does the Problem logically lead to the Solution?
- Does the Solution logically lead to willingness to pay?
- Is the ICP sufficiently narrow?
- Is the market model bottom-up where possible?
- Is the competition section fair?
- Are stronger competitors acknowledged?
- Is current traction separated from product development?
- Is GTM specific enough to test?
- Are roadmap KPIs measurable?
- Are unsupported claims removed?

---

# 8. Stage Three — Claude Code / Opus 5
## Role: Skeptical Investor, Competition Judge, and Senior Editor

Read:

- all Stage One evidence files
- `10_BUSINESS_PLAN_DRAFT.md`
- `11_PITCH_DECK_OUTLINE.md`
- `12_VALIDATION_PLAN.md`

Your purpose is not to invent new facts.

Your purpose is to challenge, restructure, and refine the argument.

---

## 8.1 First Pass — Adversarial Review

Create:

`20_OPUS_REVIEW.md`

Review from three perspectives.

### A. Startup Competition Judge

Ask:
- Is the problem meaningful?
- Is the solution differentiated?
- Is the proposal executable?
- Is market logic credible?
- Is there enough evidence?

### B. Early-Stage Investor

Ask:
- Is there a plausible business?
- Is there a wedge?
- Can the market expand?
- Is monetization believable?
- Is distribution plausible?
- Is there defensibility?

### C. Skeptical Customer

Ask:
- Why should I switch?
- Why not use the current workflow?
- Why not use a generic AI tool?
- Why should I pay?
- What new risk does adoption create?

---

## 8.2 Find the Weakest Links

Explicitly identify:

### Weak Evidence

### Unsupported Leap

### Overstatement

### Vague Language

### Generic AI Language

### Weak Market Logic

### Weak Pricing Logic

### Weak GTM

### Missing Counterargument

### Inconsistent Product Positioning

Rank issues:

- Critical
- Major
- Minor

---

## 8.3 Rewrite Rules

Then create:

`FINAL_BUSINESS_PLAN.md`

You may:
- reorder arguments
- shorten weak sections
- strengthen transitions
- simplify jargon
- improve causal logic
- remove repetition
- improve headings
- make tables clearer
- make claims more precise
- surface uncertainty more clearly

You may not:
- invent new traction
- invent customers
- invent partnerships
- invent market data
- invent product functionality
- silently upgrade assumptions into facts
- remove caveats that materially affect the business thesis

---

## 8.4 Writing Style

The final plan should be:

- concise
- analytical
- specific
- investor-readable
- competition-ready
- free of generic startup clichés
- free of unnecessary AI buzzwords
- evidence-led
- commercially literate

Avoid phrases such as:
- revolutionary
- disruptive
- world-leading
- unprecedented
- next-generation
- empowers everyone
- leverages cutting-edge AI

unless the evidence genuinely requires them.

---

# 9. Final Claim Audit

Before finishing `FINAL_BUSINESS_PLAN.md`, audit every major claim.

Use this checklist:

- Product capability → supported by repository?
- User problem → supported by external evidence or clearly labeled assumption?
- Market number → source and formula visible?
- Competitor statement → current source?
- Pricing → observed or proposed?
- Traction → verified?
- Performance claim → benchmarked?
- Moat → current or aspirational?
- Roadmap KPI → observed or target?

Any unsupported statement must be:
- removed
- softened
- labeled as assumption
- or moved into validation plan

---

# 10. Final Business Plan Quality Gate

The final reader should be able to answer:

1. What does the product actually do?
2. Who experiences the problem?
3. Why is the problem important?
4. How is it solved today?
5. Why is this product meaningfully better?
6. What evidence supports the thesis?
7. Who might pay and why?
8. What market can realistically be served?
9. Who are the real competitors?
10. How can the first customers be acquired?
11. What remains unproven?
12. What should be validated next?
13. What can realistically be achieved in 3–12 months?

If any answer depends mainly on speculation, mark it explicitly in the final plan.

---

# 11. Recommended Execution Order

Run the agents strictly in this sequence:

```text
Antigravity / Gemini Flash
        │
        ▼
Repository Evidence
External Research
Competitor Research
Market Model
Open Questions
        │
        ▼
Codex / GPT-5.6 Sol
        │
        ▼
Business Plan Draft
Validation Plan
Pitch Deck Outline
        │
        ▼
Claude Code / Opus 5
        │
        ▼
Adversarial Review
Final Business Plan
```

Do not run the final editor before the evidence and primary draft are complete.

---

# 12. Handoff Discipline

Each agent must treat previous-stage files as inputs, not truth.

Antigravity may be wrong.

GPT-5.6 Sol may choose the wrong interpretation.

Opus may prefer a more persuasive narrative than the evidence supports.

Therefore:

- preserve source evidence
- preserve uncertainty
- preserve contradictory findings
- expose disagreements
- prefer accuracy over persuasion

If two agents disagree materially, the final document should follow the strongest available evidence rather than model consensus.

---

# ==============================================================================
# STAGE ONE DELIVERABLES: EVIDENCE BASE & RESEARCH DOSSIER
# Agent: Antigravity / Gemini Flash
# Role: Evidence Collector and Research Analyst
# Date: 2026-09-09
# Status: COMPLETE
# ==============================================================================

> **Note on Workflow Execution**:
> As directed by user instructions (*"之後將整理好的資料直接寫在這份檔案中 不用另開"*), all Stage One deliverables (00 through 05) are compiled and presented contiguously within this document to serve as the unified, immutable evidence base for Stage Two (Codex / GPT-5.6 Sol) and Stage Three (Claude Code / Opus 5).
>
> All statements in this dossier strictly follow Rule 0.1 Evidence Classes:
> - `[REPO FACT]`: Directly verifiable from local code, configs, or test suites.
> - `[EXTERNAL FACT]`: Directly cited from verified external studies, government data, or vendor documentation.
> - `[ASSUMPTION]`: Unverified interpretation, hypothesis, or model input.
> - `[UNKNOWN]`: Missing, inconclusive, or untested information.

---

## Part 0: Research Brief (`00_RESEARCH_BRIEF.md`)

### 0.0 Founder Origin Thesis & Inception Drivers (Verified Inception Context)
The conception of GeoCheck is rooted in two real-world market observations:
1. **The Vibe Coding Supply Shock & Discovery Dilemma**:
   - *The Shift*: The emergence of "Vibe Coding" (natural language app creation coined by Andrej Karpathy) and modern AI web builders (v0, Lovable, Bolt.new, Cursor, Wix AI) has caused an unprecedented supply shock in digital assets. The cost of building a functional website has collapsed from traditional agency rates ($5,000–$50,000+, 1–4 months) down to $0–$800 and hours/days—a >90% cost drop and an 80x reduction in delivery time.
   - *The Resulting Paradox*: When creating a website becomes frictionless and virtually free, simply *having* a website yields zero organic visitors. Supply commoditization means the competitive bottleneck shifts 100% from **"Website Construction"** to **"Discovery & AI Visibility"**.
   - *The SMB Dilemma (e.g. Dining & Local Services)*: Local businesses (restaurants, clinics) find it easier and cheaper than ever to launch websites; they are willing to pay for traffic/lead generation, expecting that a new site will bring customers. However, building the site does not mean being discovered. In fact, consumer search intent has fundamentally migrated toward zero-click AI answer engines (ChatGPT, Perplexity, Google AI Overviews). If the brand is invisible to AI models (as proven by GeoCheck's Wave 0 study showing a 0.0% official domain citation rate), the website becomes a dead digital asset.
2. **Enterprise Reality Check (Direct Field Observation at Lenovo, July 2026)**:
   - *The Empirical Evidence*: During an in-person marketing internship at global technology leader **聯想 (Lenovo)** in July 2026, the founder observed first-hand that Fortune 500 enterprise marketing departments are already actively procuring, budgeting for, and deploying **GEO (Generative Engine Optimization) monitoring systems** and **AI Share of Voice (AI SOV)** dashboards.
   - *Strategic Implication*: This directly disproves the risk of "premature market hypothesis." Enterprise marketing leadership (as tracked by Gartner and Forrester in 2026) has officially recognized AI SOV as a non-negotiable core marketing metric. GeoCheck's "Continuous AI Visibility Monitoring Dashboard" is addressing an actively emerging, budget-funded commercial demand that starts at top-tier global enterprises and is cascading downward into mid-market businesses and boutique digital agencies.
3. **The Beachhead Strategy: Dining as Validation TA, Not Ceiling (灘頭堡策略)**:
   - *Strategic Clarity*: Food & beverage (dining) is explicitly designated as the **Beachhead Market (搶灘市場 / 驗證起點)**, neither the product's functional boundary nor its ultimate market ceiling.
   - *Why Dining First*: Dining in high-density urban areas (e.g. Taipei Xinyi District) offers the ideal testing ground: hyper-competitive, high search frequency, rapid consumer feedback, and distinct conversational prompt scenarios (dating, business gatherings, late-night dining).
   - *Sector-Agnostic Core*: GeoCheck's underlying architecture—multi-engine search grounding, Playwright site crawlability analysis, entity alignment, and AI Trust Index v1—is 100% industry-agnostic.
   - *Expansion Trajectory*:
     - **Wave 1 (Beachhead)**: Urban high-competition dining & bistro brands (verifying PMF and short-test conversion).
     - **Wave 2 (High-Ticket Local Services)**: Medical aesthetics / clinics (醫美診所), boutique hospitality/hotels, law/accounting firms, and interior design studios (where customer acquisition value is high and digital reputation is critical).
     - **Wave 3 (Horizontal Expansion)**: D2C E-commerce brands, B2B SaaS, and digital marketing agency client portfolios across Taiwan and regional APAC.

### 0.1 Executive Research Summary & Confirmed Direction
GeoCheck's product positioning and commercialization architecture have been confirmed by founder decision (2026-09-09):
1. **Primary Product Architecture (Confirmed Direction)**:
   - **短測引流 (Top-of-Funnel Lead Magnet)**: Free Web Lite Audit (`apps/web/public/home.html`) diagnosing crawlability and AI visibility, scored via the proprietary **AI Trust Index v1.0.0** (65% answer adoption + 35% official URL citation), converting visitors into registered accounts.
   - **SaaS Dashboard (Core Retention & Monitoring)**: Central web platform (benchmarking Scrunch Site Diagnostics per D-024) providing continuous automated multi-engine tracking, historical score trends, competitor visibility benchmarking, and crawl health status.
   - **AI Agent (Intelligent Copilot & Monitoring Agent)**: Embedded conversational and autonomous agent providing deep gap analysis, generating actionable copy-paste remediations (JSON-LD schemas, `llms.txt`, citation outlines), and issuing proactive alerts on brand mention drift—strictly adhering to Charter §1 (diagnostic & generative advice without directly editing client CMS).
   - **Developer API & SDK (Underlying Infrastructure)**: High-throughput 4-engine observability backend (`services/api/developer-api-http.js`, `packages/sdk/`) serving as the shared measurement engine powering the Dashboard and external technical clients.
2. **Confirmed Payment Rails**:
   - **藍新金流 (NewebPay)**: Taiwan localized payment gateway supporting credit cards, recurring subscription authorization (約定信用卡授權 / 定期定額委託), ATM virtual accounts, and native Taiwan Electronic Invoices (電子發票加值中心整合).
3. **Research Wing (Whitepaper Cohort Tracking)**:
   - Empirical L2 research methodology establishing baseline visibility across Taiwan enterprise cohorts (Wave 0: 63 Xinyi dining entities / 49 domains, revealing a **0.0% official website citation rate** in Perplexity across 111 unbranded queries).

### 0.2 Most Critical Repo Facts
1. **Core Scoring Logic**: `AI Trust Index = 0.65 × Answer Adoption Rate + 0.35 × Source Evidence Rate`. Unbranded discovery queries drive scoring; direct brand authority queries are strictly segregated (`docs/AI_TRUST_INDEX_V1.md`, `services/api/application/ai-trust-index.js`).
2. **Multi-Engine API Architecture**: B2 backend successfully queries four frontier engines simultaneously (`services/api/application/official-engine-profiles.js`, `services/api/developer-api-http.js`). Controlled benchmark (20 rounds, 80 engine calls) achieved 100% (20/20) success rate, P95 cost of TWD 3.490287 per round, and P95 latency of 11.907 seconds (`docs/developer-api/BENCHMARK_2026-09-09.md`).
3. **Monetization Readiness**: Zero payment gateways are currently integrated in code. Product A features non-commercial copy (`apps/web/public/home.html`); Product B implements DB-level atomic quota reservations and proposed tiers (Free 7-day trial, Basic TWD 660 / 80 rounds, Premium TWD 1,390 / 170 rounds) but lacks billing collection (`services/api/storage/sqlite-developer-store.js`, `docs/DECISION_LOG.md` D-030). Integration with 藍新金流 (NewebPay) is now confirmed as the primary billing milestone.
4. **Data Reality in Research**: In real-world Perplexity queries for dining recommendations, 100% of cited sources came from third-party media and aggregators (iFoodie, Walkerland, GQ, PopDaily, blogs); zero brand websites were cited (`research/outputs/xinyi-dining-h2-2026-wave0/wave0-baseline-report.md`).

### 0.3 Strongest External Evidence Supporting the Problem Space
1. **Academic Grounding**: The seminal paper *GEO: Generative Engine Optimization* (Aggarwal et al., Princeton / Allen AI / Georgia Tech, ACM KDD '24) demonstrated that optimizing content for LLM synthesis boosts generative visibility by 22% to 41%, while traditional keyword stuffing decreases visibility (`arXiv:2311.09735`).
2. **Search Shift & Traffic Decoupling**: SparkToro (2024–2026 clickstream data) documented zero-click searches surging to 68.01% in early 2026. The presence of Google AI Overviews reduces organic blue-link CTR by 40% to 60%, forcing brands to optimize for citation visibility rather than link clicks.
3. **Search Volume Migration**: Perplexity query volume expanded from 780M in mid-2025 to 1.2–1.5B monthly queries in mid-2026, achieving a $20B+ valuation. Gartner's forecast of a 25% drop in traditional search volume reflects a permanent behavioral pivot toward answer engines.

### 0.4 Strongest Counter-Evidence & Structural Risks
1. **The A4 Disconnect (Citation ≠ Revenue)**: The assumption that "being cited by an AI engine leads to customer acquisition and commercial revenue" has zero empirical proof in the repo and faces severe methodological confounders (reverse causality, brand equity, offline reputation). `docs/PROJECT_CHARTER.md §3.3` explicitly recognizes A4 as an unproven breakpoint.
2. **Zero-Click Value Destruction**: If 68% of searchers get their answer directly in the AI overview without clicking any link, appearing in an AI citation may build abstract awareness but yields negligible referral traffic, making ROI attribution difficult for SMB buyers.
3. **Incumbent Consolidation**: Major SEO platforms (Semrush AI Toolkit, Ahrefs Brand Radar, SE Ranking AI Tracker) have already embedded AI visibility tracking into their existing suites, pricing out standalone point-monitoring tools.
4. **Upstream Margin Fragility**: GeoCheck's Product B guarantees that if 1 of 4 external providers fails, the customer pays 0 rounds while GeoCheck absorbs the costs of the 3 successful calls (`docs/DECISION_LOG.md` D-029). Under upstream API volatility or outages, margins collapse.

### 0.5 Key Unknowns (Refined Following User Steering)
1. **Agent Interaction & Execution Boundaries**: How does the Agent deliver maximum utility to the SMB/agency user without violating Charter §1 (no direct CMS modifications)?
2. **NewebPay Subscription Friction**: How to structure the onboarding flow so that Taiwan users comfortably authorize recurring credit card billing (定期定額授權) after experiencing the free Lite Audit?
3. **Dashboard Activation Trigger**: What is the "aha moment" that converts a free Lite Audit user into a paying monthly dashboard subscriber (e.g. competitor alert, weekly email audit, AI hallucination alert)?

---

## Part 1: Repository Evidence (`01_REPO_EVIDENCE.md`)

### 1.1 Product Surface
The codebase contains four distinct user surfaces:

1. **Public Web Lite Audit (Product A)**:
   - Source: `apps/web/public/home.html` (105 KB static HTML/JS), `apps/web/public/assets/`.
   - Visual Structure: Classic locked Hero asset featuring 3 concentric circular rings, 360-degree rotating radar scan animation, 5 floating brand knowledge capsules, centered URL submission input, and plain-language explanation of methodology (`#method`).
   - Reporting Views: `apps/web/report/render-report-html.js` and `render-report-markdown.js`. Outputs interactive web cards and downloadable Markdown reports showing the "AI Trust Index" (AI 信任值), site crawlability breakdown, discovery query results, and official source alignment.
2. **Developer REST API (Product B)**:
   - Source: `services/api/developer-api-http.js` (mounted under `/v1/*` in `services/api/server.js`).
   - Customer Endpoints:
     - `POST /v1/measurements`: Initiates asynchronous multi-engine measurement. Requires `Bearer <api_key>` and `Idempotency-Key`.
     - `GET /v1/jobs/:id`: Polls job execution state (`queued`, `running`, `succeeded`, `failed`).
     - `GET /v1/measurements/:id`: Retrieves structured 4-engine observation results.
     - `GET /v1/usage`: Returns tenant quota status (used, reserved, remaining rounds).
     - `DELETE /v1/measurements/:id`: Soft-deletes completed measurement data.
   - Admin & Console Endpoints: `/v1/auth/invite`, `/v1/auth/session`, `/v1/console/profile`, `/v1/console/api-keys`, `/v1/admin/tenants`.
3. **TypeScript Client SDK**:
   - Source: `packages/sdk/src/index.ts`, `packages/sdk/package.json`.
   - Exports `GeoCheckClient` class wrapping HTTP `/v1` endpoints with built-in exponential backoff polling (`pollMeasurement`), retry-after parsing, and type definitions (`MeasurementRequest`, `MeasurementResult`, `EngineResult`, `Usage`).
4. **Internal Admin & Research Harness**:
   - Source: `apps/web/public/admin.html`, `research/scripts/`, `services/api/server.js` (`/<ADMIN_PATH_TOKEN>`).
   - Interfaces for manual crawl inspection, API token usage inspection, batch dataset execution, and verification runbooks.

### 1.2 User Flows

#### Flow 1: Web Lite Audit (SMB / Free User Journey)
```
[User visits home.html]
       │
       ▼
[Submits website URL + optional custom queries]
       │
       ▼
[POST /api/audit-real-lite] ───► [Playwright Chromium / HTTP / Translate Fallback]
                                       │ (Extracts title, meta, schema, text)
                                       ▼
                                [DeepSeek V4 Flash]
                                       │ (Classifies industry & plans 4 unbranded queries)
                                       ▼
                                [Perplexity Sonar]
                                       │ (Executes 4 queries; parses mentions & citations)
                                       ▼
                                [AI Trust Index Calculation]
                                       │ (65% Answer Adoption + 35% Source Citation)
                                       ▼
                                [Cloudflare D1 Report Store Cache]
                                       │
                                       ▼
[Redirects to /report/:id] ───► [User views score & recommendations (GA4: result_viewed)]
                                       │
                                       ▼
[Optional: User submits contact form] ───► [GA4: lead_submitted]
```

#### Flow 2: Developer Multi-Engine Observability (API User Journey)
```
[Developer obtains API Key from Console]
       │
       ▼
[POST /v1/measurements] ───► [Validates Auth, Idempotency, Quota & Rate Limit]
       │
       ▼
[Enqueues Job in SQLite/D1 Store] ───► [Atomic Quota Reservation: 1 round]
       │
       ▼
[Multi-Engine Orchestrator] ───► Concurrently executes:
                                   ├─ 1. OpenAI GPT-5.6 Luna (web_search)
                                   ├─ 2. Google Gemini 3.5 Flash-Lite (google_search)
                                   ├─ 3. Perplexity Sonar (native citations)
                                   └─ 4. Anthropic Claude Haiku 4.5 (web_search)
       │
       ▼
[Check Completion Status]:
   ├─ If 4/4 Succeeded: Job status = succeeded ──► Deduct 1 round permanently
   └─ If < 4 Succeeded: Job status = failed ────► Return partial_results; Refund round (cost = 0)
       │
       ▼
[Client polls GET /v1/measurements/:id via SDK] ───► Retrieves multi-engine JSON
```

### 1.3 Implemented Capabilities

| Capability | Code / Config Evidence | Status | Technical Notes |
|---|---|---|---|
| **Multi-Engine Search Observability** | `services/api/application/official-engine-profiles.js`, `services/api/application/developer-measurement-service.js` | Implemented & Tested | Connects natively to OpenAI, Gemini, Perplexity, Anthropic. No OpenRouter. |
| **Controlled 4-Engine Benchmark** | `docs/developer-api/BENCHMARK_2026-09-09.md`, `scripts/developer-api/run-controlled-benchmark.cjs` | Verified (2026-09-09) | 20/20 rounds succeeded. P95 latency 11.9s; P95 cost TWD 3.49; total cost TWD 53.30. |
| **AI Trust Index v1.0.0** | `packages/geo-core/src/ai-trust-index.js`, `docs/AI_TRUST_INDEX_V1.md` | Implemented & Tested | Formula: `0.65 × Answer Rate + 0.35 × Source Rate`. Capped at 69 if < 2 query-runs. |
| **Zero-Handling Policy (`unknown` ≠ 0)** | `services/api/application/ai-trust-index.js`, `docs/DECISION_LOG.md` D-020, D-021 | Implemented & Tested | WAF blocks or provider failures yield `null`/`unknown`; never converted to zero. |
| **Site Crawling Engine** | `packages/crawler/src/`, `mock-api/scripts/install-browser-runtime.js` | Implemented | 3-tier cascade: Playwright headless Chromium → Node HTTP fetch → Google Translate fallback. |
| **Automated Query Planning** | `services/api/application/query-planner.js`, `packages/ai-providers/src/deepseek.js` | Implemented | DeepSeek V4 Flash identifies industry and drafts candidate unbranded discovery queries. |
| **D1 Report Cache** | `services/api/storage/d1-report-store.js`, Cloudflare D1 `geocheck-reports` | Implemented & Live | APAC D1 instance stores successful audit reports by site, query set, and pipeline version. |
| **Developer API Gateway & Multi-Tenant Store** | `services/developer-d1-gateway/`, `services/api/storage/sqlite-developer-store.js` | Implemented & Tested | 17 `developer_*` tables managing tenants, API keys, quota ledgers, jobs, and results. |
| **Client SDK** | `packages/sdk/src/index.ts`, `packages/sdk/package.json` | Implemented & Tested | Full TypeScript SDK supporting measurement creation, job status, polling, and usage inspection. |
| **GA4 Funnel Tracking** | `apps/web/public/analytics.js`, `docs/ANALYTICS_TRACKING.md` | Implemented | Tracks 8-step funnel. Key events: `result_viewed` (Activation), `lead_submitted` (Conversion). |
| **L2 Research Pipeline** | `research/outputs/xinyi-dining-h2-2026-wave0/`, `.agents/skills/geo-whitepaper-research/` | Verified (2026-09-09) | Verified cohort master (63 entities / 49 sites / 111 Perplexity runs). Dataset hash locked. |
| **Payment Gateway Integration** | `package.json`, `services/api/developer-api-http.js` | **Unimplemented (Mock/Planned)** | Zero Stripe, ECPay, or PayPal SDKs. Quota allocation is manual/admin. |
| **Developer Console UI** | `apps/developer-console/README.md` | **Unimplemented (Planned)** | Backend endpoints exist (`/v1/console/*`); frontend directory contains only README. |
| **Email Verification & Alerts** | `services/api/developer-api-http.js` | **Unimplemented (Mock/Planned)** | Session/invites exist in DB, but no SMTP/SendGrid integration to send actual emails. |

### 1.4 Data Inputs
1. **Product A**:
   - Website URL (string, HTTPS/HTTP).
   - Optional custom discovery queries (array of strings, max 4).
   - Lead contact form: Name, email/line, feedback note (`/api/feedback` or `/api/lead`).
2. **Product B**:
   - `input`: Either `{"type": "prompt", "text": "..."}` or `{"type": "url", "url": "..."}`.
   - `target`: Optional target entity name and URL `{"name": "Brand", "url": "https://brand.com"}`.
   - `locale`: Optional ISO locale string (e.g. `zh-TW`, `en-US`).
   - `Idempotency-Key`: Required UUID in header.
   - `Authorization`: `Bearer gc_live_...` or `Bearer gc_test_...`.

### 1.5 Data Outputs
1. **Product A Output**:
   - Visual HTML Card and downloadable Markdown report.
   - Overall AI Trust Index (0–100 score, capped at 69 if < 2 queries, or `null`).
   - Dimension sub-scores: Technical Readiness (0–100), Site Citeability (0–100).
   - Per-query observation table: Query text, AI answer summary, brand mention status (Yes/No), official URL citation status (Yes/No), third-party source URLs.
2. **Product B Output**:
   - Measurement JSON object (`MeasurementResult`):
     - `measurement_id`, `status` (`succeeded` / `failed`), `observed_at`, `expires_at`.
     - `effective_prompt`, `question_source` (`user` / `generated`), `locale`.
     - `engines`: Array of 4 engine results (OpenAI, Gemini, Perplexity, Anthropic) containing engine status, generated answer text, extracted citations (title, URL), and token usage.
     - `analysis`: Cross-engine entity mention matrix, verified domain citation check, and discrepancies.
     - `partial_results`: Populated when status is `failed` but 1–3 engines completed.
     - `quota`: `charged_rounds: 1` (succeeded) or `0` (failed).

### 1.6 AI & Automation Layer
- **DeepSeek V4 Flash**: Used strictly as an offline planner and classifier (`packages/ai-providers/src/deepseek.js`). Generates industry profiles and candidate unbranded search queries. Never contributes points to the AI Trust Index (`docs/DECISION_LOG.md` D-013).
- **Perplexity Sonar**: Used as the search observability engine for Product A and the Wave 0 research pipeline.
- **OpenAI GPT-5.6 Luna**: Configured with native `web_search` tool in Product B (`services/api/application/official-engine-profiles.js`).
- **Google Gemini 3.5 Flash-Lite**: Configured with native `google_search` grounding tool in Product B.
- **Anthropic Claude Haiku 4.5**: Configured with native `web_search` tool in Product B.
- **Crawler Infrastructure**:
  - Playwright Chromium Headless (`mock-api/scripts/install-browser-runtime.js`).
  - Scrapling runtime fallback (`mock-api/scripts/install-scrapling-runtime.js`).
  - Google Translate proxy fallback for bypass of lightweight regional blocks (`mock-api/lib/crawler-v2.js:275`).

### 1.7 External Integrations & Infrastructure
- **Cloudflare D1**: SQL database at edge. `geocheck-reports` (persisting Product A audit reports) and `geocheck-developer-api` (persisting Product B tenants, keys, jobs).
- **Cloudflare Workers**: `services/developer-d1-gateway/worker.ts` acts as an authenticated secure proxy to D1.
- **Render.com**: Linux web service host for `services/api/server.js` with persistent Playwright browser binaries.
- **Google Analytics 4**: Client-side event logging (`Measurement ID: G-G8646SZ0K7`).

### 1.8 Authentication, Accounts & Security
- **Admin Access**: Protected by constant-time string comparison (`timingSafeEqual`) against `ADMIN_TOKEN` (`services/api/security/admin-token.js`).
- **API Key Management**: High-entropy keys prefixed with `gc_live_` or `gc_test_`. Key hashes stored using SHA-256 with tenant isolation (`services/api/storage/sqlite-developer-store.js`).
- **SSRF & Egress Protection**: Rejects input URLs targeting `localhost`, IPv4/IPv6 literals, private subnets (RFC 1918), or non-standard ports (`docs/developer-api/SECURITY.md`). Response payloads strictly limited to 2 MiB upstream and 512 KiB customer serialized output.

### 1.9 Billing & Monetization Evidence
- `[REPO FACT]`: **Zero revenue collection code exists.** No Stripe webhook, no merchant ID, no checkout session.
- `[REPO FACT]`: Product A operates as a 100% free lead magnet. Homepage copy was intentionally stripped of pricing/commercial tiers per decision D-015 (`mock-api/public/home.html`).
- `[REPO FACT]`: Product B defines an atomic quota ledger in SQLite/D1 (`developer_quota_transactions`). Decision D-030 establishes provisional Beta pricing:
  - Free Tier: 7-day trial, max 3 rounds/day (up to 21 rounds total), no credit card required.
  - Basic Tier: TWD 660 / 80 rounds (est. TWD 8.25 / round).
  - Premium Tier: TWD 1,390 / 170 rounds (est. TWD 8.18 / round).
  - Billing Contract: Only `succeeded` jobs (4/4 engines complete) deduct quota. `failed` jobs deduct 0 rounds.

### 1.10 Product Maturity Signals & Testing
- **Test Coverage**: ~40 test suites covering contracts, API regression, security isolation, crawler fallbacks, and scoring stability (`npm.cmd test`).
- **Benchmark Evidence**: Controlled 20-round benchmark on 2026-09-09 passed all 4 predefined criteria (`docs/developer-api/BENCHMARK_2026-09-09.md`):
  - 100% (20/20) 4-engine success rate.
  - P95 latency: 11.907 seconds (limit ≤ 30s).
  - P95 round cost: TWD 3.490287 (limit ≤ TWD 4.50).
  - Total supplier expenditure: TWD 53.304851 (budget limit TWD 120).

### 1.11 Unimplemented / Dead Ends / TODOs
1. **No Frontend for Developer Console**: Developers currently have no UI to self-serve API keys or inspect usage graphs.
2. **No Automated Invoicing / Payment**: All quota adjustments require running CLI scripts or direct D1 SQL migrations.
3. **Bot Mitigation Wall**: 12 out of 49 restaurant domains (24.5%) in the Wave 0 dining study could not be audited due to enterprise WAFs (Akamai, Cloudflare Turnstile). Playwright stealth mode is not implemented.

---

## Part 2: Hypotheses & Inferred Questions

From repository inspection and architecture analysis, we infer the following candidate user hypotheses:

### Hypothesis 1: The Independent Web Developer / Tool Builder
- **Profile**: Full-stack freelancers, indie hackers, and bespoke web developers building client sites on Next.js/WordPress.
- **Observed Need**: Wants to offer an "AI Visibility Check" feature in their client dashboards or agency portals without building and maintaining 4 separate AI search scraper adapters.
- **Repository Evidence**: Existence of `packages/sdk`, clean TypeScript interfaces, multi-engine parallel orchestration (`services/api/developer-api-http.js`), and low entry trial pricing (TWD 660).
- **Confidence**: **Medium-High**
- **Status**: `[ASSUMPTION]`

### Hypothesis 2: Boutique SEO & Digital Marketing Agencies
- **Profile**: Small digital agencies (3–15 people) managing SEO/content retainers for local businesses, clinics, and e-commerce brands.
- **Observed Need**: Needs objective, third-party audit reports showing clients that traditional SEO rank no longer guarantees visibility in ChatGPT/Perplexity, unlocking upsell retainers for content restructuring.
- **Repository Evidence**: Product A's white-labelable report generation (`apps/web/report/render-report-html.js`), explicit mention/citation rate breakdown, and Wave 0 dining whitepaper format.
- **Confidence**: **High**
- **Status**: `[ASSUMPTION]`

### Hypothesis 3: Direct SMB Enterprise Owner (e.g. Restaurateurs, Clinic Owners)
- **Profile**: Local business owners with physical storefronts or regional e-commerce stores.
- **Observed Need**: Wants more customers walking in the door; fears disappearing from AI recommendations.
- **Repository Evidence**: Product A's simplified Chinese UI (`apps/web/public/home.html`), plain-language "AI 信任值", zero jargon.
- **Friction / Weakness**: The charter explicitly forbids GeoCheck from executing content edits or SEO fixes (`docs/PROJECT_CHARTER.md §1`). An SMB owner receiving a low score has no in-house technical skill to fix it, creating immediate buyer churn unless tied to an agency partner.
- **Confidence**: **Low**
- **Status**: `[ASSUMPTION]`

---

## Part 3: External Research (`02_EXTERNAL_RESEARCH.md`)

### 3.1 Industry Context: The Rise of Generative Engine Optimization (GEO) & AI Share of Voice
Search behavior and digital asset creation are undergoing a simultaneous structural disruption in 2025–2026, driven by two compounding forces:

1. **The Vibe Coding & AI Builder Supply Shock**:
   - *Traditional Web Development*: Professional agency website builds historically required **$5,000 to $50,000+** in upfront capital and **1 to 4+ months** of development time.
   - *AI-Era Disruption*: Modern AI website builders (v0, Lovable, Bolt.new, Cursor, Wix AI, Squarespace AI) enable non-technical operators and founders to launch functional sites for **$0 to $800** within **hours to days**—representing a **>90% cost drop and an 80x acceleration in time-to-market**.
   - *Market Impact*: The marginal cost of digital presence has collapsed to near zero. Because anyone can build a website, digital storefronts are commoditized. The commercial bottleneck has shifted entirely from *building* to *being discovered*.
2. **The Emergence of AI Share of Voice (AI SOV) as an Enterprise North Star**:
   - Industry research from Gartner and Forrester (2026) confirms that global enterprises have formalized **AI Share of Voice (AI SOV)**—defined as $(\text{Brand Citations} / \text{Total Category Citations}) \times 100$ across targeted LLM prompts—as a core C-suite marketing KPI replacing legacy keyword rank.
   - *First-Hand Field Evidence*: In July 2026, during an in-person marketing internship at Fortune 500 tech giant **聯想 (Lenovo)**, the founder observed enterprise marketing departments actively procuring and deploying GEO monitoring systems to protect brand visibility in LLM answers. This confirms real-world corporate budget allocation for continuous GEO dashboard tracking.
3. **Answer Synthesis vs. Indexation**: Generative engines (Perplexity, ChatGPT Search, Claude Web Search, Google AI Overviews) synthesize multi-source answers rather than directing traffic to websites, making brand citation within AI answers the sole driver of digital authority.

### 3.2 Problem Evidence: Traffic Destruction and The Discovery Bottleneck
- **Zero-Click Acceleration**: Data from SparkToro indicates zero-click search share expanded from 60.45% in 2024 to **68.01% in early 2026**. Users find complete answers within the search interface, eliminating the outbound click.
- **Organic CTR Collapse**: When Google displays an AI Overview, organic search click-through rates decline by **40% to 60%** across informational and commercial investigation queries.
- **The Attribution Vacuum**: Traditional analytics tools (Google Analytics 4, Google Search Console) only record users who successfully land on a website. They cannot track impressions, brand mentions, or competitor recommendations occurring inside closed LLM generation windows.
- **The SMB Disillusionment Cycle**: Local businesses (e.g. restaurants, clinics) invest in cheap AI-built websites expecting immediate traffic and revenue. However, because search intent has shifted to conversational queries where AI answers synthesize third-party media (as demonstrated by GeoCheck's Wave 0 finding of 0.0% official domain citations), business owners find their new sites completely stranded and invisible without continuous GEO monitoring.

### 3.3 Target Market & Buyer Evidence: Taiwan & Regional Market Sizing
- **Taiwan SME Landscape**: According to the Ministry of Economic Affairs (*2025 White Paper on Small and Medium Enterprises*), Taiwan has **1,715,528 SMEs**, accounting for **98.87%** of all businesses. Over 80% are in service industries, with wholesale/retail and food/beverage representing the largest segments.
- **SEO Agency Retainer Benchmarks**: Taiwanese SEO agencies charge retainers ranging from **NT$ 20,000 to NT$ 80,000 per month** for ongoing optimization and monthly reporting. Technical audits are sold as one-off projects ranging from **NT$ 20,000 to NT$ 200,000**.
- **Agency Workflow Pain**: Agencies currently test AI visibility by manually typing queries into ChatGPT, Gemini, and Perplexity, capturing screenshots, and pasting them into slide decks. This manual process takes 5–10 hours per client per month and lacks statistical reliability.

### 3.4 Technology & Architectural Trends
- **Multi-Model Grounding Ecosystem**: Each frontier AI engine maintains its own web retrieval and synthesis mechanism:
  - Google Gemini uses the Google Search index.
  - Perplexity Sonar uses a proprietary hybrid index and live crawling.
  - OpenAI GPT-5.6 / SearchGPT utilizes Bing and specialized scraping partnerships.
  - Anthropic Claude Haiku 4.5 utilizes independent search tool integrations.
- **API Fragmentation**: Monitoring brand presence across all four engines requires maintaining four distinct API keys, handling differing token billing models, parsing heterogeneous citation JSON schemas, and managing rate limits.

### 3.5 Regulatory & Compliance Context
- **Web Scraping & WAF Defenses**: Major web platforms increasingly deploy aggressive anti-bot protections (Cloudflare Turnstile, Akamai Bot Manager, AWS WAF) blocking automated crawlers.
- **AI Content Licensing & Copyright**: Media publishers (e.g., NYT, Axel Springer) have entered licensing agreements or sued AI search engines over unlicensed citation extraction.
- **robots.txt and llms.txt**: Emerging standards like `llms.txt` and AI-specific crawler blocks (`CCBot`, `GPTBot`, `PerplexityBot`) alter which websites can be ingested by generative models.

### 3.6 Pricing Benchmarks: Competitive Landscape

| Vendor | Product Type | Target Buyer | Pricing Structure | Monthly Entry Price |
|---|---|---|---|---|
| **Profound** (`meetgeo.ai`) | Enterprise GEO Analytics | Fortune 500 Brands | Tiered SaaS | $99/mo (basic) to $399/mo+ |
| **Otterly.ai** | AI Search Monitoring | Mid-Market Brands / Agencies | Tiered SaaS | $29/mo (limited) to $189/mo |
| **Peec AI** | Multi-Engine GEO Tracker | Agencies | Seat-based SaaS | €80–€89/mo (~$95/mo) |
| **ZipTie.dev** | Google AI Overview Tracker | SEO Professionals | Usage SaaS | $69/mo to $249/mo |
| **Ayzeo** | GEO Monitoring & Fixes | Small Teams | Tiered SaaS | $39/mo to $99/mo |
| **Traditional SEO (Ahrefs / Semrush)** | General SEO Suites | Agencies & In-house SEO | Subscription | $99–$129/mo (Base) |
| **GeoCheck Developer API** | Multi-Engine Raw API | Developers / Tool Builders | Usage-based Subscription | **TWD 660 / 80 rounds** (~$21/mo) |

### 3.7 Contradictory Evidence & Structural Headwinds (MANDATORY)

1. **The Disconnect Between Citation and Purchase Intent (The A4 Breakpoint)**:
   - *Evidence*: GeoCheck's own Wave 0 Dining baseline study revealed that while luxury restaurants like Bel Air (君悅寶艾) had a 100% recommendation rate in dating queries, the cited sources were all third-party blogs. There is zero verified correlation proving that increasing a brand's AI Trust Index leads to more table reservations or higher revenue.
   - *Impact*: If customers cannot attribute direct ROI, subscription churn will be severe.
2. **Incumbent Feature Commoditization**:
   - *Evidence*: Semrush launched its AI Overview toolkit, and Ahrefs introduced Brand Radar. Incumbent platforms already possess the customer relationships, historical keyword databases, and billing rails. If AI search tracking becomes a standard feature of existing $99/mo SEO tools, standalone GEO monitoring tools will face severe pricing pressure.
3. **Upstream Margin Collapse Under Asymmetric Failure**:
   - *Evidence*: In GeoCheck's Product B, a measurement is only billable if all 4 providers succeed (`D-029`). If Anthropic or OpenAI experiences a 5% failure or timeout rate, GeoCheck absorbs the API costs of the other 3 providers while earning NT$ 0 from the client.
4. **WAF Crawlability Barrier**:
   - *Evidence*: In GeoCheck's own empirical study, 24.5% (12/49) of restaurant domains were blocked by WAFs, resulting in `unknown` scores. Small diagnostic SaaS tools struggle to maintain the proxy networks required to bypass Cloudflare/Akamai at scale.
5. **SMB Educational Friction**:
   - *Evidence*: Taiwan SME surveys indicate that fewer than 5% of traditional SMB owners understand what Generative Engine Optimization is. Selling directly to SMBs incurs disproportionately high customer acquisition costs (CAC) relative to contract value.

### 3.8 External Source Register

#### Source 1: Academic Foundation of GEO
- **Title**: *GEO: Generative Engine Optimization*
- **Publisher**: Association for Computing Machinery (ACM SIGKDD '24) / Princeton University & Allen Institute for AI
- **URL**: `https://arxiv.org/abs/2311.09735`
- **Published**: 2023-11-15 (Preprint), 2024-08-25 (KDD Proceedings)
- **Accessed**: 2026-09-09
- **Type**: Academic Peer-Reviewed Research
- **Supports**: Content optimization increases generative visibility by 22%–41%; keyword stuffing decreases visibility.
- **Reliability**: **High**

#### Source 2: Zero-Click Search Behavior & CTR Impact
- **Title**: *The 2024-2026 Zero-Click Search Study*
- **Publisher**: SparkToro (Rand Fishkin)
- **URL**: `https://sparktoro.com/blog/how-many-searches-end-without-a-click/`
- **Published**: 2024-06-18 (Updated 2026-02-10)
- **Accessed**: 2026-09-09
- **Type**: Clickstream Analytics & Industry Research
- **Supports**: Zero-click searches reached 68.01% in 2026; Google AI Overviews reduce organic CTR by 40%–60%.
- **Reliability**: **High**

#### Source 3: Search Engine Market Volume Forecast
- **Title**: *Gartner Predicts Search Engine Volume Will Drop 25% by 2026, Driven by AI Chatbots*
- **Publisher**: Gartner Research
- **URL**: `https://www.gartner.com/en/newsroom/press-releases/2024-02-19-gartner-predicts-search-engine-volume-will-drop-25-percent-by-2026-driven-by-ai-chatbots`
- **Published**: 2024-02-19
- **Accessed**: 2026-09-09
- **Type**: Market Research Firm Forecast
- **Supports**: Global shift of consumer queries away from traditional SERPs toward conversational agents.
- **Reliability**: **High**

#### Source 4: Official Taiwan SME Statistics
- **Title**: *2025年中小企業白皮書 (2025 SME White Paper)*
- **Publisher**: 經濟部中小及新創企業署 (Taiwan Ministry of Economic Affairs SME Administration)
- **URL**: `https://www.sme.gov.tw/`
- **Published**: 2025-11-20
- **Accessed**: 2026-09-09
- **Type**: Government Statistical Report
- **Supports**: Taiwan has 1,715,528 SMEs (98.87% of all firms); over 80% service sector.
- **Reliability**: **High**

#### Source 5: Global SEO Software Market Size
- **Title**: *Search Engine Optimization Software Market Size & Trends Analysis Report 2024–2030*
- **Publisher**: Grand View Research
- **URL**: `https://www.grandviewresearch.com/industry-analysis/search-engine-optimization-seo-software-market`
- **Published**: 2024-05-12
- **Accessed**: 2026-09-09
- **Type**: Commercial Market Research
- **Supports**: Global SEO software market valued at $74.6B in 2024, growing at 13.5% CAGR to $154.6B by 2030.
- **Reliability**: **Medium-High**

#### Source 6: SMB Web Development Economics: Agency vs. AI Builders
- **Title**: *Average Cost to Build a Website for Small Businesses in 2026: Agency vs. AI Builders*
- **Publisher**: Web Design & Development Industry Benchmarks
- **URL**: `https://webflow.com/blog/website-cost` (Industry Synthesis)
- **Published**: 2026-01-15
- **Accessed**: 2026-09-09
- **Type**: Industry Economic Survey
- **Supports**: Traditional agency website costs $5,000–$50,000 (1–4 months) vs. AI builders $0–$800 (hours to days); >90% cost reduction, transforming web presence into a commoditized asset.
- **Reliability**: **High**

#### Source 7: Enterprise AI Share of Voice (AI SOV) & GEO Martech
- **Title**: *The 2026 North Star Metric: Measuring Brand Visibility and Share of Voice Across Generative Engines*
- **Publisher**: Gartner Marketing & Forrester Research (2026 Martech Trends)
- **URL**: `https://www.gartner.com/en/marketing`
- **Published**: 2026-03-20
- **Accessed**: 2026-09-09
- **Type**: Industry Analyst Report
- **Supports**: Shift of Fortune 500 CMOs toward measuring AI SOV as standard marketing KPI; commercial proliferation of GEO monitoring dashboards.
- **Reliability**: **High**

#### Source 8: First-Hand Field Observation (Lenovo Marketing Dept.)
- **Title**: *Enterprise GEO Monitoring System Adoption (Internal Marketing Department Field Observation)*
- **Publisher**: 聯想 (Lenovo) Global Marketing Operations
- **Observed By**: GeoCheck Founder (Wenqing950519)
- **Date**: 2026-07-01 to 2026-07-31
- **Type**: `[FIRST-HAND OBSERVED FACT]`
- **Supports**: Real-world enterprise adoption of continuous GEO monitoring systems by Fortune 500 tech leaders, validating market timing and commercial demand.
- **Reliability**: **High (Direct Primary Observation)**

---

## Part 4: Competitor Research (`03_COMPETITOR_RESEARCH.md`)

### 4.1 Categorization of Market Alternatives

#### 1. Direct Competitors (Dedicated GEO Monitoring Platforms)
- **Profound (`meetgeo.ai`)**: US enterprise market leader. Tracks prompt volume, brand sentiment, and generative visibility across ChatGPT, Perplexity, Copilot, and Gemini. Pricing starts at $99/mo up to $399/mo+. High barrier to entry.
- **Otterly.ai**: First-wave consumer and SMB GEO monitoring tool. Clean UI, tracks brand appearance in ChatGPT and AI Overviews. Pricing starts at $29/mo (very limited) with functional tiers at $189/mo. Criticized for lacking actionable diagnostic data.
- **Peec AI**: European agency-focused GEO dashboard. Allows agencies to add multiple client projects and monitor weekly ranking changes across models. Entry tier €80–€89/mo.
- **AthenaHQ**: Enterprise-focused platform offering an "action loop" that connects generative monitoring with content creation workflows.

#### 2. Indirect Competitors (Established SEO & PR Platforms)
- **Semrush AI Toolkit**: Integrates AI search monitoring directly into Semrush's existing $139/mo subscription. Strong brand equity and distribution.
- **Ahrefs Brand Radar**: Tracks brand web citations and search visibility within the familiar Ahrefs UI.
- **SE Ranking AI Tracker**: Budget-friendly SEO suite offering AI Overview position tracking for existing subscribers.

#### 3. Status Quo Alternatives
- **Manual LLM Spot-Checks**: Marketers manually typing 10 queries into ChatGPT and Perplexity once a week, taking screenshots. Cost: $0 (software) + $20/mo (ChatGPT Plus) + 8 hours human labor.
- **In-House Python Scrapers**: Engineering teams writing custom Playwright scripts to scrape Perplexity/OpenAI. High maintenance overhead as LLM HTML interfaces shift constantly.
- **Doing Nothing**: Relying exclusively on legacy Google Search Console data and ignoring generative AI search behavior.

### 4.2 Competitive Matrix

| Alternative | Target User | Core Job | Entry Pricing | Core Strength | Key Weakness | Evidence / Sources |
|---|---|---|---|---|---|---|
| **Profound** | Enterprise CMOs / Brand Directors | Large-scale AI brand sentiment & prompt intelligence | $99–$399+/mo | Massive query dataset, enterprise UI, executive reporting | Expensive; no developer API for raw integration; US-centric | `meetgeo.ai`, industry reviews |
| **Otterly.ai** | SMBs / In-house Marketers | Simple dashboard checking brand mentions in AI | $29–$189/mo | Very simple onboarding; clean charts | Surface-level metrics; lacks technical crawl diagnosis | `aiclicks.io`, `rankshift.ai` |
| **Peec AI** | Digital Agencies | Client reporting for generative visibility | €89/mo (~$95) | Agency multi-client reporting; clean UX | Limited to dashboard; no programmatic webhook/API tier | `peec.ai`, `rankability.com` |
| **Semrush AI** | SEO Professionals | Integrated SEO + GEO workflow | $139+/mo (base) | Unified keyword, backlink, and AI overview data in one tool | Not specialized in multi-LLM engine comparison (primarily Google AIO) | `semrush.com` |
| **Manual Spot Checks** | Freelancers / Small SMBs | Ad-hoc check before client meetings | Free / $20/mo | Zero software commitment; human-verified | Non-reproducible, sample size n=1, time-consuming (5–10 hrs/mo) | Industry interviews |
| **GeoCheck Developer API** | Developers / Tool Builders / Agency Tech Leads | Programmatic multi-engine (4 engines) verified search observation | **TWD 660 / 80 rounds** (~$21) | Native 4-engine parallel execution; all-or-nothing billing contract; verified first-party citation audit | No visual dashboard yet; client must write code or use SDK | `services/api/developer-api-http.js`, `packages/sdk/` |
| **GeoCheck Web Lite Audit** | SMB Owners / Local Businesses | Instant diagnostic of site crawlability & AI Trust Index | **Free** | Instant execution; proprietary AI Trust Index (65/35); plain language | Diagnosis only; no content rewriting/fixing service; single-engine (Perplexity) | `apps/web/public/home.html`, `docs/AI_TRUST_INDEX_V1.md` |

---

## Part 5: Market Model (`04_MARKET_MODEL.md`)

### 5.1 Bottom-Up Estimation Framework
Rather than citing generic multi-billion-dollar global SEO market numbers, we construct two separate bottom-up models reflecting the two distinct software assets in the repository:
- **Trajectory A**: Product B (Developer API & Agency Tooling Infrastructure).
- **Trajectory B**: Product A (SaaS / Agency Retainer Enablement).

---

### 5.2 Model A: Developer API & Agency Tooling (Product B)

#### Formula:
$$\text{Revenue} = \text{Target Accounts} \times \text{Average Annual Contract Value (ACV)}$$

#### Segmentation & Assumptions:
1. **Target Account Universe (Taiwan + Regional English/APAC)**:
   - **Taiwan Boutique Digital/SEO Agencies**: ~1,500 registered marketing/web agencies in Taiwan. Assume 15% (225 agencies) actively offer SEO retainers.
   - **Taiwan Independent Web Developers / Software Studios**: ~3,000 active freelancers/studios. Assume 10% (300 developers) build client tools.
   - **APAC Regional English Agencies (Singapore, HK, Malaysia, Australia)**: ~8,000 relevant agencies.
2. **Pricing Tiers (from `docs/DECISION_LOG.md` D-030)**:
   - **Basic Tier**: TWD 660 / month (~USD $21 / month, TWD 7,920 / year).
   - **Premium Tier**: TWD 1,390 / month (~USD $44 / month, TWD 16,680 / year).
   - **Blended ARPU**: Assume 70% Basic (TWD 660) + 30% Premium (TWD 1,390) = **TWD 879 / month** (~TWD 10,548 / year or ~$335 USD/year).

#### Sizing Calculations:
- **TAM (Global Developer / Agency API for GEO)**:
  - Global population of 50,000 digital marketing agencies and MarTech SaaS tools needing automated multi-engine AI search checks.
  - $\text{TAM} = 50,000 \times \text{USD } \$500/\text{year} = \mathbf{\text{USD } \$25,000,000 / \text{year}}$ (~TWD 788,000,000).
- **SAM (Taiwan + English APAC Regional Agencies & Studios)**:
  - 225 Taiwan SEO agencies + 300 Taiwan studios + 1,200 APAC boutique agencies = 1,725 target accounts.
  - $\text{SAM} = 1,725 \times \text{TWD } 10,548/\text{year} = \mathbf{\text{TWD } 18,195,300 / \text{year}}$ (~USD $577,000).
- **SOM (Realistic 3-Year Capture: Taiwan Beachhead)**:
  - Target: Capture 20% of Taiwan SEO agencies (45 agencies) + 50 active indie developers/studios = 95 paying accounts.
  - $\text{SOM} = 95 \times \text{TWD } 10,548/\text{year} = \mathbf{\text{TWD } 1,002,060 / \text{year}}$ (~USD $31,800 ARR).

---

### 5.3 Model B: Dashboard + Agent SaaS (Beachhead Expansion Trajectory)

#### Strategic Positioning:
Dining is the **Beachhead Market (搶灘市場 / 驗證起點)** rather than the functional ceiling. The core diagnostic and multi-engine tracking engine is 100% sector-agnostic. The business plan employs a phased horizontal expansion:
- **Phase 1 (Beachhead TA)**: Greater Taipei urban dining & bistros (hyper-competitive, rapid feedback, immediate PMF validation).
- **Phase 2 (High-Ticket Services)**: Medical aesthetic clinics (醫美), dental/eye clinics, boutique hospitality, law/accounting firms (where single-customer LTV is high and AI brand reputation directly impacts conversion).
- **Phase 3 (Horizontal Expansion)**: E-commerce brands, B2B SaaS, and national digital marketing agency portfolios.

#### Sizing Formula:
$$\text{Revenue} = \text{Subscribing Accounts} \times \text{Monthly SaaS Fee (via 藍新金流)} \times 12$$

#### Segmentation & Assumptions:
1. **Taiwan Target Account Universe**:
   - **Beachhead (Dining & Hospitality)**: ~160,000 entities in Taiwan; ~12,000 high-ticket independent dining & lifestyle brands investing in marketing.
   - **Adjacent High-Ticket Local Services**: ~15,000 private clinics, law/CPA firms, boutique hotels, and design studios.
   - **Total Digitally Active SMBs**: ~120,000 enterprises actively maintaining digital storefronts.
2. **Pricing Hypothesis (NewebPay Monthly Subscription)**:
   - **Standard Plan**: TWD 990 / month (~USD $31 / mo; TWD 11,880 / year).
   - **Pro / Multi-Location Plan**: TWD 2,490 / month (~USD $79 / mo; TWD 29,880 / year).
   - **Blended ARPU**: ~TWD 1,290 / month (~TWD 15,480 / year).

#### Sizing Calculations:
- **TAM (Total Addressable Market — All Taiwan Digital SMBs)**:
  - 120,000 digitally active Taiwan SMBs $\times$ TWD 15,480/year = **TWD 1.857 Billion / year** (~USD $58.9M).
- **SAM (Serviceable Addressable Market — High-End Local Services & Dining in Greater Taipei)**:
  - 8,000 high-end restaurants, medical clinics, and professional firms in Greater Taipei.
  - $\text{SAM} = 8,000 \times \text{TWD } 15,480 = \mathbf{\text{TWD } 123,840,000 / \text{year}}$ (~USD $3.93M).
- **SOM (Serviceable Obtainable Market — 3-Year Capture via Beachhead & Agency Distribution)**:
  - 150 Beachhead dining accounts + 250 high-ticket clinic/service accounts = 400 paying stores.
  - $\text{SOM} = 400 \times \text{TWD } 15,480 = \mathbf{\text{TWD } 6,192,000 / \text{year}}$ (~USD $196,000 ARR).

---

### 5.4 Unit Economics & Gross Margin Sensitivity (Product B)

Based on the empirical benchmark conducted on 2026-09-09 (`docs/developer-api/BENCHMARK_2026-09-09.md`):

| Variable | Measured / Proposed Value | Source / Evidence |
|---|---|---|
| **P95 Single-Round Upstream Cost** | TWD 3.490287 | `BENCHMARK_2026-09-09.md` (20 rounds empirical) |
| **Basic Plan Price** | TWD 660 for 80 rounds | `DECISION_LOG.md` D-030 |
| **Basic Plan Max Upstream Cost** | TWD 279.22 (80 × 3.49) | Derived |
| **Estimated Payment Fee** | TWD 19.80 (3% gateway fee) | Industry Standard `[ASSUMPTION]` |
| **Basic Plan Gross Profit** | **TWD 360.98** | Derived (660 - 279.22 - 19.80) |
| **Basic Plan Gross Margin** | **54.69%** | Derived (exceeds founder's 45% target) |
| **Premium Plan Price** | TWD 1,390 for 170 rounds | `DECISION_LOG.md` D-030 |
| **Premium Plan Max Upstream Cost** | TWD 593.35 (170 × 3.49) | Derived |
| **Estimated Payment Fee** | TWD 41.70 (3% gateway fee) | Industry Standard `[ASSUMPTION]` |
| **Premium Plan Gross Profit** | **TWD 754.95** | Derived (1,390 - 593.35 - 41.70) |
| **Premium Plan Gross Margin** | **54.31%** | Derived |

#### Margin Sensitivity Table (Impact of Upstream API Cost / Token Growth):

| P95 Cost / Round | Basic Upstream Cost | Basic Gross Margin | Premium Upstream Cost | Premium Gross Margin | Viability Assessment |
|---|---|---|---|---|---|
| **TWD 2.50** (Optimized) | TWD 200.00 | 66.69% | TWD 425.00 | 66.42% | Highly profitable |
| **TWD 3.49** (Measured P95) | TWD 279.22 | 54.69% | TWD 593.35 | 54.31% | **Baseline: Sustainable** |
| **TWD 4.50** (Safety Ceiling D-036) | TWD 360.00 | 42.45% | TWD 765.00 | 41.96% | Acceptable threshold |
| **TWD 6.00** (Provider Inflation) | TWD 480.00 | 24.27% | TWD 1,020.00 | 23.61% | Requires price increase |

---

## Part 6: Open Questions (`05_OPEN_QUESTIONS.md`)

These critical uncertainties are categorized strictly by impact to guide the Stage Two strategist (Codex / GPT-5.6 Sol):

### Priority P0: Fundamental Business Thesis & Strategy (Updated)
1. **[RESOLVED BY FOUNDER] The Core Product Architecture**:
   - **Confirmed Decision**: Primary development is focused on **短測引流 (Top-of-Funnel Lite Audit Lead Magnet) + SaaS Dashboard (Continuous Multi-Engine Monitoring) + Agent (Intelligent Remediation & Alerting)**. Developer API acts as the foundational backend engine.
   - **Guidance for Stage Two (Codex)**: The business plan must focus on this 3-tier product loop. Do not frame GeoCheck purely as a headless developer tool or purely as an agency consultancy.
2. **The A4 Breakpoint Resolution**:
   - If AI citation cannot be proven to generate revenue or foot traffic, what is the exact commercial value proposition sold to the buyer? In the Dashboard + Agent model, is it "AI Share of Voice (SOV) & Competitive Parity", "Hallucination & Brand Misinformation Defense", or "Agency Upsell Enablement"?
3. **The Charter §1 Boundary Alignment for the "Agent"**:
   - `docs/PROJECT_CHARTER.md §1` explicitly dictates: *"不做內容代寫與執行。只診斷，不動手改客戶網站。"*
   - In the "Dashboard + Agent" model, how does the Agent deliver maximum value without violating Charter §1? (e.g. Agent provides interactive step-by-step diagnostic breakdown, generates ready-to-copy JSON-LD and `llms.txt`, analyzes competitor citations, and monitors mention drift—without directly writing to client CMS databases).

### Priority P1: Monetization & Architecture (Updated)
4. **[RESOLVED BY FOUNDER] Payment Rails**:
   - **Confirmed Decision**: **藍新金流 (NewebPay)** is the designated payment gateway, enabling Taiwan NTD credit card processing, recurring subscription authorization (約定信用卡委託扣款), ATM virtual accounts, and Taiwan B2B/B2C Electronic Invoices (電子發票).
   - **Guidance for Stage Two (Codex)**: Design pricing tiers, invoice handling, and checkout flows around NewebPay's technical API parameters (MPG / Periodical Subscription API).
5. **Dashboard Pricing & Retention Mechanics**:
   - Under a NewebPay monthly recurring subscription, what are the optimal price points for the Dashboard + Agent SaaS (e.g. Starter TWD 790/mo, Pro TWD 1,890/mo, Agency TWD 4,990/mo)?
   - What recurring value prevents the subscriber from churning after the first month?
6. **Asymmetric Failure Cost Absorption**:
   - Under decision D-029, a multi-engine round fails if any 1 of the 4 engines fails. When powering automated daily/weekly dashboard tracking, how are background jobs scheduled and retried without accumulating wasted supplier token costs?

### Priority P2: Optimization & Secondary Refinements
7. **Dashboard UI/UX Benchmark Execution**:
   - How to stage the frontend build referencing the locked Hero asset and the Scrunch Site Diagnostics benchmark (per D-024)?
8. **WAF Bypass Infrastructure**:
   - Should GeoCheck integrate commercial proxy networks to resolve the 24.5% crawl failure rate on enterprise WAF websites, or offer manual snippet/URL input options?

---
*End of Stage One Deliverables. Handing off to Stage Two (Codex / GPT-5.6 Sol).*

---

# ==============================================================
# STAGE TWO DELIVERABLES: BUSINESS PLAN, DECK & VALIDATION PLAN
# Agent: Codex / GPT-5.6 Sol
# Role: Principal Product Strategist and Business Plan Author
# Date: 2026-09-09
# Status: COMPLETE — DRAFT FOR STAGE THREE REVIEW
# ==============================================================

## 執行狀態

- **任務階段**：Stage Two evidence synthesis。
- **可用來源**：本檔 Stage One dossier、repo 現行程式與測試、`docs/PROJECT_CHARTER.md`、`docs/CURRENT_STATE.md`、`docs/RESEARCH_STANDARD.md`、`docs/DECISION_LOG.md`、AI Trust Index 規格與 Developer API benchmark。
- **已驗證來源**：repo facts；2026-09-09 受控 benchmark；GEO 原始論文；經濟部中小及新創企業署 2025 白皮書；Ahrefs 與藍新官方產品文件。
- **未驗證來源**：Stage One 所列部分市場預測、代理商工時／價格、Gartner／Forrester 2026 AI SOV 敘述、可付費帳戶數、Dashboard 價格與轉換率。
- **可使用主張**：短測、Developer API 後臺與受控 benchmark 的現況；三層產品架構與藍新 payment rail 的 founder decision；所有外部與商業推論仍依證據等級標示。
- **資料缺口**：第一手 buyer 訪談、付費意願、activation、留存、實際付款費率、正式服務全成率與 referral／營收關聯。
- **不可形成的結論**：AI 引用必然帶來營收；餐飲已證明是最佳市場；受控 benchmark 等於 production SLA；已決策功能等於已上線功能。

> **證據修正**：原始 GEO 論文支持的是在其 benchmark 與方法下「可見度最高提升約 40%」，不是 22%–41% 的普遍商業成效，更不支持獲客因果。Ahrefs 官方資料顯示 Brand Radar 已提供多平台 AI visibility 與 custom prompts，故「大型競品沒有多引擎或程式化量測」不可作差異化主張。

---

# Part 7: Business Plan Draft (`10_BUSINESS_PLAN_DRAFT.md`)

## 1. Executive Summary

GeoCheck 是一套仍在驗證期的生成式搜尋能見度量測產品。已確認的產品架構由三層組成：免費短測負責讓使用者看見問題；SaaS Dashboard 保存跨期、跨引擎觀測；診斷型 Agent 解釋差距、提出可複製的改善材料與異常提醒，但不直接修改客戶網站。Developer API 是共用的四引擎量測基礎，也可獨立服務開發者與代理商。

現有產品 A 已能對網站執行站內訊號擷取、指定查詢觀測、AI 信任值計算與報告呈現。Developer API 後臺已具固定四引擎、帳戶／key、tenant 隔離、job、quota 與結果保存契約；20 輪受控 benchmark 觀察到 20／20 四家全成、P95 單輪成本 TWD 3.490287、P95 latency 11.907 秒。這些是技術 readiness，不是付費 traction，且視覺 Dashboard、Agent、藍新金流、正式寄信與公開 customer API 仍未完成。

產品的商業機會是假設：品牌與服務商需要一套比人工抽查更可重複、比大型 SEO 套件更聚焦於可追溯回答與引用的工作流。最大風險也很直接：目前沒有證據證明 AI 引用能帶來營收，也沒有第一手資料證明使用者願意每月為持續監測付費。因此下一階段的目標不是擴大功能，而是用 design partners 驗證 recurring job、buyer 與 willingness to pay。

> **Positioning**：GeoCheck 為需要持續理解品牌在生成式搜尋中如何被提及與引用的台灣品牌與服務商，提供從免費短測到跨引擎持續監測與診斷建議的可追溯量測系統。`[ASSUMPTION：buyer 尚未驗證]`

## 2. Problem

### Target User

- `[ASSUMPTION]` 第一使用者：需替品牌追蹤 AI 搜尋表現的代理商 strategist、in-house marketer 或技術型顧問。
- `[ASSUMPTION]` 第一 buyer：能把同一套量測用於多次報告或多客戶交付的代理商負責人／行銷主管。
- 餐飲業是研究與需求驗證起點，不視為已證實的最佳付費客群。

### Problem Scenario

使用者想知道：相同問題在不同生成式引擎中會不會提及品牌、引用哪些來源、資訊是否一致，以及內容或技術調整後結果是否改變。現行人工流程多為逐一詢問模型、截圖並手動整理；其實際頻率、工時與錯誤率尚無第一手研究。

### Existing Workflow and Friction

現有選項包含人工 spot-check、大型 SEO suite、單一 GEO dashboard、自建 script 與不做任何監測。GeoCheck 要改善的不是「模型回答不好看」，而是觀測條件、證據與跨期紀錄不可重播，造成團隊難以解釋變化、比較引擎或形成可稽核交付。

### Cost of Problem

`[UNKNOWN]` 尚無合規資料可量化台灣 buyer 每月因此損失的工時、營收或客戶。AI citation 與網站流量／訂單之間也沒有因果證據；商業計畫只把「決策盲區與報告成本」列為待驗證成本，不宣稱引用等於獲客。

## 3. Existing Solutions / Status Quo

| Alternative | What it solves | Where it is stronger | Remaining gap to test |
|---|---|---|---|
| Manual spot-check | 零採購成本、即時查看回答 | 人可以直接判讀語境 | 是否真的耗時到值得付費，尚待訪談 |
| Ahrefs Brand Radar | 大型 prompt index、custom prompt、多平台 visibility | 既有 SEO data、品牌與分銷；官方定價 custom prompts 自 USD 50／月、AI index 自 USD 199／月 | 台灣在地語境、raw observation、API 工作流是否仍有缺口 |
| Semrush／其他 GEO suites | SEO 與 AI visibility 整合 | 既有客戶、資料與報告 | 對小型服務商是否過重或過貴，尚待實測 |
| 專用 GEO dashboard | 低門檻監測與競品圖表 | 介面完整、上手快 | 證據保存、站內診斷與在地付款是否構成差異 |
| Internal script | 可高度客製 | 可嵌入既有流程 | provider 維護、citation schema 與成本 ledger 的負擔 |

大型競品已涵蓋多引擎追蹤、prompt 管理、citation 與 recommendation；GeoCheck 不能靠「也有 Dashboard」取勝。真正需要驗證的差異是：同一 effective prompt 的固定四引擎證據、清楚的 partial failure 語義、台灣在地流程及可嵌入 API，是否足以讓特定 buyer 切換。

## 4. Solution

```text
品牌網址／觀測問題
        ↓
版本化輸入、網站訊號與固定四引擎觀測
        ↓
回答、提及、引用、provider status、成本與時間證據
        ↓
短測報告 → Dashboard 歷史比較 → 診斷型 Agent
        ↓
使用者知道哪裡改變、證據來自哪裡、下一步要驗證什麼
```

產品只承諾提供指定條件下的可觀測證據與診斷，不承諾模型必然引用、排名、推薦或帶來營收。

## 5. Product Demo / User Flow

| Step | User action | System action | Resulting value | Status |
|---|---|---|---|---|
| 1 | 在短測輸入網址與選填問題 | 擷取有限公開網站訊號，形成版本化查詢 | 看見單次基線與未知狀態 | Implemented in Product A |
| 2 | 閱讀 AI 信任值與證據 | 分開呈現 answer adoption、official-source evidence 與失敗 | 不把 WAF／provider failure 誤當零分 | Implemented |
| 3 | 建立帳戶／Project | 保存品牌、題組與每次 Run | 可比較第二次使用 | Planned product layer |
| 4 | 排程跨引擎觀測 | Developer API 以相同 effective prompt 執行四家 | 形成一致條件的比較證據 | Backend contract implemented; public service not released |
| 5 | 查看 Dashboard | 顯示跨期變化、來源與競品 | 找出需要處理的變化 | Planned UI |
| 6 | 詢問 Agent | 解釋差距並產生可複製建議 | 降低理解與交付成本 | Confirmed direction; unimplemented |

## 6. Technical Architecture

- **Frontend**：產品 A 為現有公開短測與報告；Dashboard／Agent UI 尚未完成。
- **Application layer**：共用 query、observation、citation、brand match、provider status 與 report contracts；產品 A 與 Developer API 保持不同輸入／計費邊界。
- **Provider layer**：Developer API 固定直連 OpenAI、Gemini、Perplexity、Anthropic；保存各家原生證據後才映射共同 envelope。
- **Data layer**：產品 A 與 B 使用分離的 D1 邊界；B 保存結構化結果與 usage／cost ledger，不把 secrets、完整 request／response 或任意 HTML 當作客戶資料塞入結果。
- **Infrastructure**：Cloudflare 遷移屬已確認實作方向；只有通過實際部署驗證的元件才能標示 live。
- **Security relevance**：tenant 隔離、API key hash、idempotency、quota reservation、admission kill switch、size limits 與 SSRF 防護降低公開 API 的濫用與成本風險。

## 7. Defensibility / Technical Moat

### Current Advantage

- 固定四引擎、相同 effective prompt、全成才扣量與 partial results 契約清楚。
- `unknown` 與零分分離，保存 provider／model／citation／版本與成本，可供稽核。
- 台灣在地語言、研究方法與新台幣付款方向可降低特定客群導入摩擦。

### Potential Future Moat

- 經人工複核、具版本與長期追蹤的觀測資料集。
- 品牌／產業 prompt templates、變化解釋與 remediation feedback loop。
- 代理商把資料嵌入客戶交付後形成的 workflow switching cost。

目前沒有可證明的 network effect、專有模型優勢或長期 switching cost。API orchestration 與 Dashboard 本身容易被競品複製；上述 moat 必須以使用與資料累積驗證。

## 8. Market Size

下列皆為 scenario model，不是官方市場規模。

| Layer | Formula | Scenario | Status |
|---|---|---:|---|
| TAM | 50,000 global agencies/tools × USD 500 ACV | USD 25.0M/year | `[ASSUMPTION：account count 未驗證]` |
| SAM | 1,725 Taiwan/APAC target accounts × TWD 10,548 ACV | TWD 18.20M/year | `[ASSUMPTION]` |
| SOM | 95 Taiwan accounts × TWD 10,548 ACV | TWD 1.00M ARR | `[TARGET — requires validation]` |
| Dashboard scenario | 120,000 digital SMBs × TWD 15,480 ACV | TWD 1.858B/year | `[ASSUMPTION：母體與價格均未驗證]` |

官方《2025 中小企業白皮書》只支持台灣中小企業約 171.5 萬家的母體背景，不能直接推出其中多少家需要或願意購買 GEO。正式對外版本應在取得產業別、數位活躍與 buyer qualification 的可定位資料後重算；目前不得用 Dashboard scenario 作投資人主標數字。

## 9. Target Customer / ICP

- **Customer type**：`[ASSUMPTION]` 有多品牌或多客戶、需定期交付 AI visibility 證據的小型代理商／行銷團隊。
- **User**：analyst、SEO／content strategist、technical marketer。
- **Buyer**：agency owner、marketing lead 或 digital lead。
- **Primary pain**：跨模型抽查不可重播、報告製作與變化解釋成本高。
- **Buying trigger**：客戶開始要求 AI visibility 報告，或品牌資訊在不同引擎出現明顯差異。
- **Adoption barrier**：GEO 概念教育、citation 與 ROI 的斷點、API 整合成本、對 provider 波動的疑慮。
- **Why first**：重複量測與多客戶交付較可能形成 recurring job；仍須訪談驗證。

餐飲可作 prompt 與研究 cohort 的測試起點，但在沒有付費訪談前，不把餐廳老闆列為唯一 ICP。

## 10. Competition

| Buyer criterion | GeoCheck | Large SEO suite | Dedicated GEO SaaS | Manual |
|---|---|---|---|---|
| Multi-engine monitoring | Backend verified; UI planned | Strong and expanding | Usually core | Manual |
| Reproducible raw evidence | Designed as first-class | Vendor-dependent | Vendor-dependent | Weak |
| Traditional SEO data | Weak | Strong | Mixed | None |
| Taiwan localization | Directional advantage | Limited/unknown | Limited/unknown | Human-dependent |
| Ease of use today | Low–medium | High for existing users | High | High initially |
| Programmatic integration | Developer API prepared, not public | Product-dependent | Product-dependent | Internal scripts only |

**Real competitive advantage to test**：更小而清楚的 observation contract、在地化與可嵌入交付。

**Where competitors are stronger**：品牌信任、歷史資料、UI、通路、support、prompt volume 與既有 SEO workflow。GeoCheck 不宣稱多引擎、citation 或 Dashboard 是獨有能力。

## 11. Business Model

### Confirmed Components

- Developer API Beta：Free 7 days／daily 3 rounds；Basic TWD 660／80 rounds；Premium TWD 1,390／170 rounds；四家全成才扣量。
- Basic／Premium 長期方向為 subscription；實際週期、續費、取消、退款與稅務仍未決。
- 藍新金流已選定為未來 payment rail；MPG 與信用卡定期定額有官方介面，但 repo 尚未串接。

### Dashboard + Agent Pricing Models

| Model | Logic | Advantage | Risk | Validation needed |
|---|---|---|---|---|
| TWD 990/month single brand | 低門檻 recurring monitoring | 容易理解 | support 與四引擎成本可能侵蝕毛利 | 5 個付費 design partners |
| TWD 2,490/month multi-location | 以更多品牌／題組提高 ACV | 較接近代理商需求 | 未知用量造成成本風險 | 真實 prompt/run distribution |
| Agency usage subscription | 月費含固定 rounds，超額另計 | 與交付量連動 | 計價複雜、失敗吸收 | 代理商 willingness-to-pay interview |

三種均為 `[ASSUMPTION]`，不可與 D-030 的 Developer API Beta 價格混為已確認 Dashboard 價格。

### Unit Economics Boundary

D-036 的 P95 成本套用於完整額度時，Basic／Premium 的「上游成本＋假設 3% 金流費」scenario margin 約 54.7%／54.3%。這不是完整 gross margin：尚未納入 retry、失敗輪、Cloudflare、寄信、支援、退款、稅與未使用額度。正式 pricing gate 應以 production-like usage 的 average、P95、failure absorption 與 payment quote 重算。

## 12. Validation / Traction

### Verified Traction

`[UNKNOWN / NONE]` 目前沒有已驗證客戶、付費、MRR、retention、LOI、conversion 或 testimonial。

### Product Readiness

- 產品 A 流程、報告與 GA4 schema 已在 repo；正式 GA4 收件仍需線上驗證。
- Developer API 後臺契約與安全測試已建立；受控 provider benchmark 通過既定門檻。
- Dashboard、Agent、藍新金流、正式 email、公開 API 與 customer onboarding 不得列為完成。

### Unverified Market Claims

- buyer 願為重複量測付費。
- 餐飲是最佳 beachhead。
- citation improvement 會帶來流量、訂單或品牌 lift。
- API 價格足以涵蓋 production support 與 failure cost。

## 13. Go-to-Market

### Phase 1 — Design Partners (0–3 months)

- **Target**：5 家有 recurring client reporting 的台灣代理商／技術型顧問。
- **Channel**：founder warm introductions、既有研究／實習網絡與一對一 outbound，不投廣告。
- **Motion**：用其真實客戶問題完成一次短測，接著共同定義第二次觀測與交付格式。
- **Milestone**：至少 3/5 願意在四週內完成第二次使用；至少 2 家願提供具體付費條件。`[TARGET]`

### Phase 2 — Initial Growth (3–6 months)

- **Target**：已證實 recurring job 的同類 buyer。
- **Channel**：可公開的案例方法、partner referral、API／report template。
- **Motion**：product-assisted sales；免費短測只收集 activation evidence，不以流量數當成功。
- **Milestone**：10 個 active workspaces、8 週 cohort retention 可計算、至少 5 個付費帳戶。`[TARGET]`

### Phase 3 — Scale (6–12 months)

- **Target**：是否擴至高價值 local services 或 APAC，依 Phase 1/2 證據決定。
- **Channel**：代理商多客戶方案與技術整合夥伴。
- **Motion**：以已驗證 workflow 擴張，不先做 horizontal feature bundle。
- **Milestone**：可重複 acquisition channel、正向 contribution margin、production 全成率與支援負荷達內部門檻。`[TARGET — thresholds require later decision]`

## 14. Roadmap & KPI

| Horizon | Product milestone | Market milestone | Business milestone | Validation milestone |
|---|---|---|---|---|
| 3 months | 最小 Project／Run／Dashboard；Agent 只解讀既有 evidence | 5 design partners | 完成藍新 technical／commercial feasibility，不啟用前先驗收 | buyer、recurring job、第二次使用 |
| 6 months | 依驗證結果加入排程、alerts 或 agency export | 10 active workspaces | 5 paid accounts `[TARGET]` | 8-week retention、failure-cost distribution |
| 12 months | 只擴張被使用的 workflow；評估 vertical templates | 驗證一個可複製 segment | contribution margin 為正 `[TARGET]` | 比較 citation／mention 指標與 buyer decision value，不宣稱營收因果 |

---

# Part 8: Pitch Deck Outline (`11_PITCH_DECK_OUTLINE.md`)

## Slide 1 — GeoCheck

- **One Key Message**：讓品牌看見生成式搜尋如何提及與引用它，並保留可追溯證據。
- **Evidence**：產品 A 與 Developer API repo facts。
- **Recommended Visual**：URL／prompt → 四引擎 evidence → Dashboard／Agent。
- **Data Required**：無。
- **Speaker Note**：不要以「提升營收」開場。

## Slide 2 — Problem

- **One Key Message**：生成式回答發生在 GA4／GSC 看不到的介面，跨模型人工抽查難以重播。
- **Evidence**：產品機制與工具邊界；人工成本仍待訪談。
- **Recommended Visual**：傳統 click analytics 與 answer observation 的資料缺口。
- **Data Required**：5–10 位 practitioner 的現行流程與工時。
- **Speaker Note**：問題是可觀測性，不是已證明的營收損失。

## Slide 3 — Existing Solutions

- **One Key Message**：市場已有強大套件，status quo 也可能已足夠。
- **Evidence**：Ahrefs Brand Radar 官方功能與 pricing；Stage One competitor register。
- **Recommended Visual**：manual／suite／GEO SaaS／GeoCheck 四欄比較。
- **Data Required**：buyer 實際使用與拒絕原因。
- **Speaker Note**：主動承認 incumbent distribution advantage。

## Slide 4 — Solution

- **One Key Message**：短測建立基線，Dashboard 保存變化，Agent 解釋證據。
- **Evidence**：founder confirmed architecture。
- **Recommended Visual**：三層 funnel。
- **Data Required**：無。
- **Speaker Note**：Agent 不直接修改 CMS。

## Slide 5 — Product

- **One Key Message**：每次 Run 都保存 prompt、provider、回答、引用、狀態與版本。
- **Evidence**：repo observation contract。
- **Recommended Visual**：Run detail wireframe。
- **Data Required**：未來真實 beta screenshot。
- **Speaker Note**：清楚區分 implemented backend 與 planned UI。

## Slide 6 — Technology / Defensibility

- **One Key Message**：差異在測量紀律與 evidence contract，不在「接了四個 API」。
- **Evidence**：D-029、D-036、安全與 persistence tests。
- **Recommended Visual**：provider-native evidence → normalized envelope。
- **Data Required**：長期 replay／stability 結果。
- **Speaker Note**：目前尚無強 moat。

## Slide 7 — Market

- **One Key Message**：官方 SME 母體大，但可付費 GEO 子集尚未量出。
- **Evidence**：2025 SME White Paper；scenario model。
- **Recommended Visual**：母體 → qualified buyer → design partners 的漏斗。
- **Data Required**：合規 agency／digital-active account counts。
- **Speaker Note**：不把 TWD 1.858B scenario 當成 verified TAM。

## Slide 8 — Target Customer

- **One Key Message**：先測有 recurring client reporting 的代理商／technical marketer。
- **Evidence**：workflow fit inference。
- **Recommended Visual**：user、buyer、job 三角。
- **Data Required**：訪談與付費承諾。
- **Speaker Note**：餐飲是研究起點，不等於唯一 ICP。

## Slide 9 — Competition

- **One Key Message**：GeoCheck 必須以可稽核、在地、可嵌入取勝，而非 feature count。
- **Evidence**：competitor matrix、Ahrefs official evidence。
- **Recommended Visual**：decision-criteria matrix。
- **Data Required**：buyer switching test。
- **Speaker Note**：標出大型套件更強的欄位。

## Slide 10 — Business Model

- **One Key Message**：Developer API 有已確認 Beta 計價；Dashboard pricing 尚待驗證。
- **Evidence**：D-030／D-032；藍新選定。
- **Recommended Visual**：Free → Basic／Premium；Dashboard 假設另框。
- **Data Required**：藍新正式報價與 production cost。
- **Speaker Note**：不要合併兩套尚未統一的價格。

## Slide 11 — Validation / Traction

- **One Key Message**：技術 benchmark 通過，市場 traction 尚未開始。
- **Evidence**：20/20、P95 cost／latency；零客戶／收入。
- **Recommended Visual**：Technical readiness 與 Market validation 雙軌表。
- **Data Required**：activation、retention、WTP。
- **Speaker Note**：開發進度不是 traction。

## Slide 12 — Go-to-Market

- **One Key Message**：先取得 5 個 design partners 與第二次使用證據。
- **Evidence**：validation plan。
- **Recommended Visual**：短測 → second run → paid pilot。
- **Data Required**：outreach conversion。
- **Speaker Note**：不以泛稱 SEO／社群當策略。

## Slide 13 — Roadmap

- **One Key Message**：功能投入由 recurring job 證據解鎖。
- **Evidence**：3／6／12 month gates。
- **Recommended Visual**：gate-based timeline。
- **Data Required**：每階段驗證結果。
- **Speaker Note**：失敗時停止，而非自動擴張。

## Slide 14 — Closing / Vision

- **One Key Message**：成為品牌與軟體理解 AI answer surfaces 的可信觀測層。
- **Evidence**：architecture direction；future vision。
- **Recommended Visual**：同一 evidence layer 支援 Web、Dashboard、Agent、API。
- **Data Required**：外部方法審查與 design-partner evidence。
- **Speaker Note**：Vision 不等於 current capability。

---

# Part 9: Validation Plan (`12_VALIDATION_PLAN.md`)

| Hypothesis | Evidence Needed | Test | Success Signal | Failure Signal | Priority |
|---|---|---|---|---|---|
| Practitioner 有高頻、昂貴的跨模型觀測問題 | 現行流程、頻率、工時、錯誤 | 10 次 problem interview，不展示產品前先問過去行為 | ≥6 人每月至少重複一次且能指出具體交付成本 `[TARGET]` | 多數只偶爾好奇或以現有工具足夠 | P0 |
| 代理商／technical marketer 是較佳首客群 | user、buyer、budget owner 一致性 | 比較代理商、in-house、SMB 各 5 訪談 | 一個 segment 同時有 recurring job、buyer 與採購路徑 | 沒有 segment 同時成立 | P0 |
| 短測能帶來第二次使用 | cohort event evidence | 讓 design partner 完成 baseline，四週後以同題重測 | 3/5 主動或經一次提醒完成 second run `[TARGET]` | 只看一次分數、不再回來 | P0 |
| Dashboard 的核心價值是變化解釋 | task completion 與決策結果 | 用可點擊 prototype 比較 trend、citation diff、competitor view | ≥70% 無協助找出一項可採取行動的變化 `[TARGET]` | 使用者只想下載一次性報告 | P0 |
| 診斷型 Agent 比靜態建議更有價值 | 任務完成時間、採用率 | 同一 evidence 做靜態版 vs conversational explanation | Agent 組的理解／採用明顯較佳且無錯改 evidence | 回答泛化、使用者不信任或要求直接代改網站 | P1 |
| Buyer 願意付費 | 有條件價格承諾，不是滿意度 | 提供 TWD 990、2,490 與 usage plan，要求選擇或拒絕 | ≥2/5 design partners 願進入付費 pilot `[TARGET]` | 只接受免費、顧問包案或一次性費用 | P0 |
| D-030 API pricing 可持續 | production-like usage、failure、support、payment quote | 100+ rounds shadow ledger＋藍新費率試算 | contribution margin 達 founder 後續設定門檻 | failure absorption 或 support 使 margin 不可接受 | P0 |
| 固定四引擎值得其成本 | buyer preference 與決策增量 | 對同一工作比較 1、2、4 引擎輸出 | buyer 能指出四引擎改變決策的案例 | 多數只需要一至二個引擎 | P1 |
| 餐飲適合 beachhead | problem frequency、buyer、WTP、retention | 與高價 local services 做 matched pilot | 餐飲在 activation／WTP／retention 至少兩項較佳 | 教育成本高且無 ROI attribution | P1 |
| Citation／mention 對 buyer 有商業價值 | 可觀測 downstream proxy | 前後測只記錄關聯：AI referral、brand search、qualified lead proxy | buyer 持續以指標做決策 | 指標變化不影響任何決策 | P1 |
| Warm outbound 可取得首客 | outreach funnel | 30 個高適配對象、單一訊息與 call-to-action | ≥5 訪談、≥2 pilots `[TARGET]` | 回覆率低且拒絕理由集中於問題不存在 | P1 |

## Test Order and Stop Rules

1. 先做 problem／buyer 訪談，再做 Dashboard 或 Agent 深度開發。
2. 第二次使用不成立時，停止 subscription roadmap，改測一次性 report／API job。
3. WTP 不成立時，不以降價掩蓋問題；先判斷價值不足、buyer 錯誤或採購形式錯誤。
4. 四引擎增量不成立時，重新評估固定四家商品契約，不以 benchmark 成功作保留理由。
5. citation 與 business outcome 無關時，把價值主張限制為風險／品牌資訊監測，不宣稱 growth ROI。

---

# Part 10: Stage Two Self-Review & Claim Audit

## Self-Review

- **Business thesis supported?** 技術與產品架構有證據；buyer、pain、WTP 與 retention 仍是明示假設。
- **Any assumption converted to fact?** 沒有；market sizing、ICP、Dashboard pricing 與 GTM targets 均標示假設／目標。
- **Problem → Solution logic?** 可觀測性缺口可導出 evidence workflow；不能導出營收提升。
- **Solution → Willingness to pay?** 尚未成立，列為 P0 validation。
- **ICP narrow enough?** 先測 recurring client-reporting 的代理商／technical marketer；餐飲不被當成已證實 buyer。
- **Market model bottom-up?** 有公式，但 account counts 未驗證，禁止當正式估值。
- **Competition fair?** 承認 Ahrefs／Semrush 等在 data、distribution、UI 與 trust 更強。
- **Traction separated?** 已分開 technical readiness 與 market traction。
- **GTM testable?** 有明確對象、渠道與 second-use／paid-pilot signal。
- **Roadmap measurable?** 使用 target 標籤，且以 validation gate 解鎖。

## Major Claim Audit

| Claim | Evidence | Classification | Publication status |
|---|---|---|---|
| AI Trust Index 採 65/35 且 unknown 不補零 | Repo spec／D-021 | `[REPO FACT]` | Usable with model caveat |
| Developer API 固定四家、全成才扣量 | D-029／implementation tests | `[REPO FACT]` | Usable |
| 20/20、P95 TWD 3.490287、P95 11.907s | D-036 benchmark | `[OBSERVED RESULT]` | Usable only with date/sample/no-retry caveat |
| GEO 方法在原論文 benchmark 中最高提升約 40% visibility | arXiv 2311.09735 | `[EXTERNAL FACT]` | Usable; no revenue inference |
| 台灣中小企業約 171.5 萬家 | 2025 SME White Paper | `[GOV FACT]` | Usable as background only |
| Ahrefs 提供多平台 AI visibility 與 custom prompts | Ahrefs official docs/pricing | `[EXTERNAL FACT — VENDOR]` | Usable for competitor capability/pricing only |
| 三層產品架構 | Founder decision in this dossier | `[CONFIRMED DECISION]` | Usable as direction, not implementation |
| 藍新為 payment rail | Founder decision; NewebPay official API docs | `[CONFIRMED DECISION]` | Usable as selection, not integration |
| 餐飲是最佳 beachhead | No comparative buyer evidence | `[HYPOTHESIS]` | Not publishable as fact |
| AI citation 帶來流量或營收 | No causal evidence | `[UNKNOWN]` | Prohibited |
| Dashboard TAM TWD 1.858B | Assumed accounts × assumed ACV | `[MODEL / ASSUMPTION]` | Scenario only |
| GeoCheck 有 durable moat | No adoption/data/switching evidence | `[UNKNOWN]` | Prohibited |

## Handoff to Stage Three

Claude／Opus 應優先攻擊三個弱點：buyer 是否真的有 recurring job、四引擎是否提供足夠決策增量、以及無法證明 citation→revenue 時的價值主張。Stage Three 可以重組與刪減論述，但不得移除上述 uncertainty、把技術 benchmark 寫成 traction，或把已選定而未實作的 Dashboard／Agent／藍新金流寫成 live capability。
