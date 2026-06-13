# SEO/GEO Mock API

Local prototype API for the SEO/GEO checker.

It supports two flows:

1. Mock flow: no API keys required, useful for UI wiring.
2. Real-lite flow: fetches a public homepage, enriches with Brave Search when configured, and asks Agnes 2.0 Flash to generate a lightweight SEO/GEO report.

## Setup

From the project root:

```powershell
copy .env.example .env
```

Fill in the keys:

```text
PORT=8787

AGNES_API_KEY=your Agnes API key
AGNES_MODEL=agnes-2.0-flash
AGNES_BASE_URL=https://apihub.agnes-ai.com/v1

BRAVE_API_KEY=your Brave Search API key
BRAVE_SEARCH_BASE_URL=https://api.search.brave.com/res/v1
BRAVE_COUNTRY=TW
BRAVE_SEARCH_LANG=zh-hant
BRAVE_UI_LANG=zh-TW
BRAVE_SAFESEARCH=moderate
```

`BRAVE_API_KEY` is optional. If it is missing or LLM Context is not enabled on the Brave plan, the real-lite audit falls back to available Brave Web Search results or skips search enrichment.

## Run

```powershell
npm run mock-api
```

Open:

```text
http://localhost:8787/home
```

## Provider Tests

Test Agnes:

```powershell
Invoke-RestMethod -Uri "http://localhost:8787/api/test-provider" -Method Post -ContentType "application/json" -Body "{}"
```

Test Brave Web Search:

```powershell
Invoke-RestMethod -Uri "http://localhost:8787/api/test-search-provider" -Method Post -ContentType "application/json" -Body "{}"
```

Query Brave manually:

```powershell
Invoke-RestMethod -Uri "http://localhost:8787/api/search-context" -Method Post -ContentType "application/json" -Body '{"query":"site:example.com SEO GEO","mode":"web","count":5}'
```

## Real-Lite Audit

```powershell
Invoke-RestMethod -Uri "http://localhost:8787/api/audit-real-lite" -Method Post -ContentType "application/json" -Body '{"url":"https://example.com"}'
```

Flow:

```text
URL
-> server-side homepage fetch
-> optional browser fallback via Playwright
-> optional Brave Web Search / LLM Context enrichment
-> Agnes 2.0 Flash SEO/GEO analysis
-> JSON report
```

## API Endpoints

- `GET /home`: serves the prototype homepage from `mock-api/public/home.html`.
- `POST /api/audit`: creates a mock audit job.
- `GET /api/status/:jobId`: checks mock job status.
- `GET /api/report/:reportId`: returns report JSON.
- `GET /report/:reportId`: renders a report page.
- `GET /report/:reportId/markdown`: downloads report markdown.
- `POST /api/test-provider`: tests Agnes.
- `POST /api/test-search-provider`: tests Brave Web Search.
- `POST /api/search-context`: runs Brave Web Search or LLM Context.
- `POST /api/audit-real-lite`: runs the real-lite audit.
- `POST /api/leads`: stores lead form submissions in `mock-api/leads.jsonl`.

## Notes

- Do not commit `.env`, `mock-api/.env`, `node_modules`, logs, or `mock-api/leads.jsonl`.
- Current rate limits are in-memory and intended for local/MVP testing only.
- For production, replace in-memory rate limiting with Redis or another shared store.
- Brave LLM Context may require a plan option. If unavailable, the app automatically falls back to Brave Web Search.
