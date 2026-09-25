---
version: 1
slug: "apps-web-public-developers-html"
primary_target: "apps/web/public/developers.html"
related_targets: ["apps/web/public/developers/docs.html","apps/web/public/developers-console.html"]
---

## Scope

Platform surfaces on platform.lslabs.tw: landing, docs, console, pricing/terms/privacy/refund. Mode: Persuade on landing, Read on docs and legal, Operate on console.

## Audience and job

Developers and agency engineers integrating four-engine citation measurement via /v1, the TypeScript SDK and the Console. Action: read docs, sign in, create a key, send a first job.

## Constraints

Keep all console JS behaviour and ids. Payments closed; never imply purchase is possible. Access state comes from the Console, not the page.

## Direction contract

THESIS: The category standard played straight at Stripe / Resend / Vercel docs craft: a calm light developer platform whose proof is the real request and response.
OWN-WORLD: White and cool-grey paper, navy #0B1F3B ink, LS indigo as Platform's own accent (#4F46E5 fills, #A5B4FC on dark), one navy code panel per view, 1px hairlines, 8px radii. Noto Sans TC + Space Grotesk + IBM Plex Mono for code.
STORY: Developer sees the exact request and four-engine response, understands atomic settlement and idempotency, goes to docs or console.
FIRST VIEWPORT: Left: headline, one-line promise, 閱讀文件 primary and 進入控制台 secondary. Right: navy code panel with tabs (curl / TypeScript) showing POST /v1/measurements and a four-engine response.
CONSOLE EXCEPTION: The Console (developers-console.html) keeps a navy ground, as the inside of the code panel: same palette, type and indigo actions, no glows. Reason: its JS renders dark-theme inline colours throughout, the category standard ships dark consoles too, and a light rebuild would touch working auth/key flows outside a visual pass. Agent decision, disclosed to the user on 2026-09-25 and reversible on request.
FORM: Category standard (user chose canon); seed 482baf35 (degraded roll).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
