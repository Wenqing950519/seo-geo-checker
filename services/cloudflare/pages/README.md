# Public URL routing

The 2026-09-19 user request authorizes retiring duplicate public hosts and unusable published URLs, following D-051's product separation. It does not authorize changing API admission, credentials, billing or stored reports.

`worker.mjs` is copied only into `dist/pages/_worker.js` by `build:pages`. Never put it into the shared `apps/web/public` assets used by the Developer API Worker.

- Public GET/HEAD requests on `geocheck.lisheng.cv` redirect to `geocheck.lslabs.tw`, preserving path/query.
- Historical Wave 0 URLs redirect temporarily to the published blog collection; they do not represent a published study.
- Developer and Dashboard entry points redirect to their dedicated origins.
- API, auth, report and non-GET/HEAD requests keep their existing routing. `_routes.json` excludes the existing Worker path prefixes.
- Root `404.html` prevents nonexistent static URLs from returning the homepage with HTTP 200.

Run `npm run test:pages` before deployment. Deploy `dist/pages` to `geocheck-web` on branch `main`. Deploy `services/cloudflare/legacy-developers` to the existing `ls-labs-developers` Pages project on its production branch `production` when its redirects change. Verify the custom domains after deployment; a successful upload alone is insufficient.
