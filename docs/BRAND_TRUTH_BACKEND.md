# GeoCheck Brand Truth backend

Brand Truth is a Product A Dashboard capability. Its state is stored in the
`dashboard_truth_*` tables in the Dashboard D1/SQLite store and is not shared
with Developer API tenants, API keys, quotas, sessions, or cost records.

## Flow

1. `POST /app-api/v1/projects/:projectId/truth/sources` accepts `website`,
   `google_maps`, or `facebook` public HTTP(S) URLs. The bounded fetcher follows
   at most three validated redirects, stores metadata, snippets and a SHA-256
   hash, and never stores or returns full HTML.
2. `GET .../truth/readiness` reports `sources_pending`, `baseline_pending`, or
   `ready`. A project can remain Active while readiness is not `ready`.
3. `POST .../truth/baseline/confirm` creates an immutable version. The selected
   source snippets and hashes are snapshotted for later evidence.
4. `POST .../truth/checks` accepts one to four logical engines: `openai`,
   `gemini`, `anthropic`, and `perplexity`. The check stays queued until the
   asynchronous runner submits it through the existing internal measurement
   channel. Provider retry, reservation and terminal measurement state remain
   owned by Developer Platform.
5. The runner maps only the final trusted measurement into claims and findings.
   Green means the claim supports the confirmed baseline; red is a clear
   contradiction; yellow is ambiguous or condition/entity-incomplete; gray is
   unknown, not mentioned, failed, or otherwise unjudgeable. Every finding
   carries baseline version, parser version, engine/model, timestamp, source
   snapshots, original answer/claim text and limitations.

## Routes and permissions

- `GET/POST /projects/:projectId/truth/sources`
- `GET /projects/:projectId/truth/readiness`
- `GET /projects/:projectId/truth/baseline`
- `POST /projects/:projectId/truth/baseline/confirm`
- `POST /projects/:projectId/truth/checks`
- `GET /projects/:projectId/truth/checks/:checkId`
- `POST /projects/:projectId/truth/findings/:findingId/review`

Owner and Editor may submit sources, confirm baselines, start checks and review
findings. Viewer is read-only. Raw claim/finding recording is an internal
orchestration function and is not mounted as a browser route.

The first phase intentionally does not expose a public Brand Truth API, PDF,
email, payment, CMS write-back, or provider-specific source API.

Live admission is controlled by `DASHBOARD_TRUTH_ENABLED` (the checked-in
Cloudflare configuration keeps it `false`) and the
`DASHBOARD_TRUTH_ALLOWLIST` email list (at least one address is required when
the flag is enabled). Enable it only for an approved smoke cohort after cost,
provider-failure and manual-review gates pass.
