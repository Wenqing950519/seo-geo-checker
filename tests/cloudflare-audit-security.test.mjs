import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { normalizeUrl, resolveEntryUrl } from "../services/cloudflare/audit/src/entry-url.mjs";

register("./fixtures/cloudflare-worker-hooks.mjs", import.meta.url);
globalThis.__WORKER_ENV__ = {};
const { default: worker } = await import("../services/cloudflare/audit/src/worker.js");
const admissionSchema = await (await import("node:fs/promises")).readFile(new URL("../services/api/migrations/0007_audit_request_admissions.sql", import.meta.url), "utf8");

test("public audit rejects internal literals, credentials and non-web ports before fetching", async () => {
  for (const target of ["http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[fc00::1]/", "http://[fe80::1]/", "http://100.64.0.1/", "http://127.0.0.1./", "https://user:secret@example.com/", "http://example.com:8080/"]) {
    assert.throws(() => normalizeUrl(target), /invalid_target_url/, target);
  }
  const calls = [];
  const result = await resolveEntryUrl("https://example.com/", { fetch: async (url) => {
    calls.push(url);
    return new Response(null, { status: 302, headers: { Location: "http://[::ffff:127.0.0.1]/" } });
  } });
  assert.equal(result.reachable, false);
  assert.ok(calls.every((url) => !url.includes("[")), "IPv6 redirect must not be fetched");
});

test("concurrent public requests cannot exceed the per-client or daily paid-job ceiling", async () => {
  for (const limits of [{ daily: 20, per_ip: 2 }, { daily: 2, per_ip: 20 }]) {
    const sql = new DatabaseSync(":memory:");
    sql.exec(admissionSchema);
    sql.exec(`CREATE TABLE audit_jobs (job_id TEXT PRIMARY KEY, report_id TEXT, cache_key TEXT, site_url TEXT, custom_queries_json TEXT, status TEXT, created_at TEXT, updated_at TEXT, completed_at TEXT, diagnostics_json TEXT);
      CREATE TABLE audit_reports (report_id TEXT, cache_key TEXT, expires_at TEXT, created_at TEXT);`);
    const d1 = { prepare(query) {
      return { bind(...args) {
        return {
          async first() {
            const row = sql.prepare(query).get(...args) || null;
            // Model separate requests observing the same count before a remote D1 read returns.
            if (query.startsWith("SELECT COUNT")) await new Promise((resolve) => setTimeout(resolve, 20));
            return row;
          },
          async run() { return { meta: { changes: sql.prepare(query).run(...args).changes } }; }
        };
      } };
    } };
    const queued = [];
    const env = { REPORTS_DB: d1, AUDIT_ADMISSION_ENABLED: "true", AUDIT_LIMITS: JSON.stringify({ ...limits, per_ip_hours: 1 }), AUDIT_IP_PEPPER: "test-pepper-never-production", AUDIT_JOBS: { async send(job) { queued.push(job); } } };
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("public page");
    try {
      const results = await Promise.all(Array.from({ length: 8 }, (_, index) => worker.fetch(new Request("https://geocheck.example/api/audit-real-lite", {
        method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" }, body: JSON.stringify({ url: `https://site${index}.example/` })
      }), env)));
      assert.equal(results.filter((response) => response.status === 202).length, 2, JSON.stringify(limits));
      assert.equal(results.filter((response) => response.status === 429).length, 6);
      assert.equal(queued.length, 2, "only atomically admitted jobs reach the paid queue");
      assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM audit_jobs").get().n, 2);
    } finally { globalThis.fetch = previousFetch; sql.close(); }
  }
});

test("public status excludes private failure details and all audit responses discourage indexing", async () => {
  const env = { REPORTS_DB: { prepare: () => ({ bind: () => ({ first: async () => ({ status: "failed", report_id: "dummy-report", error_code: "provider_failed", diagnostics_json: JSON.stringify({ cache_hit: false, client: "private-client-hash", failure: { message: "private provider response" }, browser_error: "private-runtime-detail" }) }) }) }) } };
  const response = await worker.fetch(new Request("https://geocheck.example/api/status/dummy-job"), env);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(body, /private-/);
  assert.doesNotMatch(body, /private provider response/);
  assert.match(response.headers.get("X-Robots-Tag") || "", /noindex/);
  assert.equal(JSON.parse(body).diagnostics.cache_hit, false, "keep the frontend's cache-hit indication");
});

test("oversized chunked audit requests stop reading at the byte ceiling", async () => {
  let pulls = 0;
  const body = new ReadableStream({ pull(controller) { pulls += 1; if (pulls <= 8) controller.enqueue(new Uint8Array(8192)); else controller.close(); } });
  const response = await worker.fetch(new Request("https://geocheck.example/api/audit-real-lite", { method: "POST", body, duplex: "half" }), {
    AUDIT_ADMISSION_ENABLED: "true", AUDIT_LIMITS: JSON.stringify({ daily: 2, per_ip: 2, per_ip_hours: 1 }), AUDIT_IP_PEPPER: "test-pepper-never-production"
  });
  assert.equal(response.status, 413);
  assert.ok(pulls <= 4, `read ${pulls} chunks after a 16 KiB limit`);
});
