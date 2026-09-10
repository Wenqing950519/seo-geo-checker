# Dashboard Tracking Contract v1

## Access boundary

Dashboard is a private Product A API behind `DASHBOARD_API_ENABLED=true` and
requires a `gds_` Dashboard session. A `gck_` Developer API key or `gcs_`
Developer Console session receives `401` on every `/app-api/v1` route.

Only a Dashboard-specific administrator credential may create an invitation:
`X-Dashboard-Admin-Token`. It is distinct from `ADMIN_TOKEN` and from all
Developer API credentials. The implementation is intentionally fail-closed when
the dashboard database path, token pepper, or dashboard admin token is missing.

## Browser routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/app-api/v1/auth/verify` | Consume a Dashboard invitation and create a `gds_` session |
| GET/POST | `/app-api/v1/projects` | List or create Projects owned by the Dashboard account |
| GET/POST | `/app-api/v1/projects/{projectId}/question-sets` | Read or version tracked questions |
| GET | `/app-api/v1/projects/{projectId}/overview` | Summary metrics and historical series |
| GET | `/app-api/v1/projects/{projectId}/performance` | Engine and question breakdowns |
| GET | `/app-api/v1/projects/{projectId}/citations` | Citation-domain counts |
| GET | `/app-api/v1/projects/{projectId}/data-quality` | Run-level coverage states |
| GET | `/app-api/v1/projects/{projectId}/evidence/{observationId}` | The only endpoint returning raw answer evidence |
| POST | `/app-api/v1/projects/{projectId}/annotations` | Add a user annotation to the history |

All browser responses are `no-store`, `noindex`, and do not opt into CORS.
There is deliberately no browser endpoint to insert a Tracking Run. Trusted
Product A orchestration calls `recordTrackingRun()` after a scheduled collection.

## Model semantics

`TrackingPlan` has fixed `cadence: weekly`. A `TrackingRun` stores scheduled and
observed timestamps, question-set version, and coverage counts. It derives
`complete` only when all expected observations are measured; `partial` when any
valid result exists but coverage is incomplete; and `failed` when every expected
observation failed.

Each Observation contains exactly one question and one canonical engine:
`openai`, `gemini`, `anthropic`, or `perplexity`. For `measured`, mention and
official-citation values are booleans. For `unknown` and `failed`, those fields
must be null and cannot be silently converted to false.

The public Dashboard response excludes API keys, API usage, quota, provider
cost, Developer API tenant IDs, Developer job IDs, and provider secrets. Raw
answer content is returned only by the project-scoped evidence route.

## Persistence and deployment boundary

`services/api/migrations/0003_dashboard_tracking.sql` defines Product A's
`dashboard_*` tables. It does not modify Developer API `developer_*` tables and
has not been applied remotely. Local/test execution uses the SQLite store; a
future Product A D1 adapter must retain the same schema and membership checks.
