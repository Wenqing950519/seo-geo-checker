# Cloudflare release gate

This is the operational hand-off for D-039. It is deliberately not evidence that production has been cut over.

## Required order

1. Upgrade Workers to Paid and set a USD 10 account alert. This is an account/billing action and must be confirmed at the moment of change.
2. Run the lead dry-run: `node scripts/cloudflare/prepare-audit-lead-import.cjs`. Verify the count and SHA-256 without exposing PII. Only then generate a reviewed SQL file and apply it after `0002_audit_jobs_and_leads.sql` is remote-applied to `geocheck-reports`.
3. Put Worker secrets interactively, never in `.env`, source, shell history, test output, or this document: A needs DeepSeek/Perplexity; B needs `ADMIN_TOKEN`, `DEVELOPER_API_TOKEN_PEPPER`, and all four official provider keys. Set B policy variables to `rolling_24h`, `30`, `7`, `3`, `60`, `600`, `12`, and `31.535`.
4. Deploy preview Worker versions first. Verify queue recovery, tenant isolation, report HTML rendering, Browser Run diagnostics, SDK tarball installation, and D1 Time Travel restore against a disposable database. A container deploy additionally requires a running Docker daemon.
5. Configure Free-plan managed WAF rules, no-cache for `/v1/*`, one `/v1/*` rate-limit rule, TLS and HSTS; then route `/api/*` and `/report/*` on `geocheck.lisheng.cv` to A, and `api.geocheck.lisheng.cv/*` to B. Keep Render untouched for seven days.

## Non-claims

- Browser Run or Container dry-run is not a successful crawl of a protected site.
- Fixture tests and Worker previews are not a paid-provider smoke.
- No provider smoke is permitted without an action-time confirmation.
- npm publish requires an authenticated owner of the `@geocheck` scope; this host is currently not authenticated.
