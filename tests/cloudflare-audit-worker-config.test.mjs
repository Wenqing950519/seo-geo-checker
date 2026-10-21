import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Audit Worker and Pages header assertions that used to sit inside cloudflare-developer-worker-bundle.test.mjs.
// That test moved to ls-labs (tests/platform) with the Developer API Worker (LSL-D-009, 2026-10-21); the audit
// Worker stays in this repo, so its half stays here. No wrangler run is needed: these are static checks.

const auditWorker = await readFile("services/cloudflare/audit/src/worker.js", "utf8");
const pagesHeaders = await readFile("apps/web/public/_headers", "utf8");
const auditConfig = JSON.parse(await readFile("services/cloudflare/audit/wrangler.jsonc", "utf8"));

// Opened on 2026-10-21 with the user's go-ahead, after the local paid smoke test passed.
assert.equal(auditConfig.vars.AUDIT_ADMISSION_ENABLED, "true");
assert.equal(auditConfig.containers[0].image_build_context, "../../..");
assert.deepEqual(auditConfig.routes, [
  { pattern: "geocheck.lslabs.tw/api/*", zone_name: "lslabs.tw" },
  { pattern: "geocheck.lslabs.tw/report/*", zone_name: "lslabs.tw" },
  // The old host keeps only its API route (D-048). Its report links reach the geocheck-public
  // Worker (ls-labs products/geocheck), which sends them to geocheck.lslabs.tw (2026-10-21).
  { pattern: "geocheck.lisheng.cv/api/*", zone_name: "lisheng.cv" }
]);
assert.match(auditWorker, /AUDIT_ADMISSION_ENABLED/, "Audit Worker must guard new paid jobs with an admission switch");
assert.match(auditWorker, /Strict-Transport-Security/, "Audit Worker responses must enable HSTS");
assert.match(pagesHeaders, /Strict-Transport-Security:\s*max-age=31536000/i, "Pages responses must enable HSTS");
console.log("cloudflare audit worker config tests passed");
