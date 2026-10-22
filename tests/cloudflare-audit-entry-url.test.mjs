// The public quick check must reach a site whose apex https entry is dead while www or http
// works. The first live audit (noodle3.com.tw, job aud_4ff6aad8, 2026-10-21): https://noodle3.com.tw/
// timed out, http://noodle3.com.tw/ answered 301 to www, only https://www.noodle3.com.tw/ served
// the page. The Worker sent the dead apex URL to Browser Rendering and the container, which fell
// back to Google Translate and produced a limited report. No test here touches the network.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/cloudflare-worker-hooks.mjs", import.meta.url);

const PEPPER = "p".repeat(32);
const NOODLE_PAGE = `<html><head><title>範例牛肉麵</title></head><body>${"<p>紅燒牛肉麵專賣，台北大安。</p>".repeat(20)}</body></html>`;

function response(status, headers = {}, body = "") {
  return new Response(status === 204 || status === 304 ? null : body, { status, headers });
}

// A fetch stub keyed by exact URL. A value may be a Response, an Error to throw, or a function.
function fetchStub(routes) {
  const calls = [];
  const stub = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith("https://cloudflare-dns.com/dns-query?")) return Response.json({ Status: 0, Answer: [{ type: 1, data: "93.184.215.14" }] });
    calls.push({ url, method: init.method || "GET", redirect: init.redirect });
    const route = routes[url];
    if (!route) throw Object.assign(new TypeError(`fetch failed: no route for ${url}`), { code: "ENOTFOUND" });
    const value = typeof route === "function" ? route() : route;
    if (value instanceof Error) throw value;
    return value;
  };
  stub.calls = calls;
  return stub;
}

const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });

// 1. The resolver alone: candidate order, redirect following, SSRF guard, fallback.
const entry = await import("../services/cloudflare/audit/src/entry-url.mjs");

{
  // noodle3 as seen on 2026-10-21: apex https dead, https www live.
  const fetch = fetchStub({
    "https://noodle3.com.tw/": timeout,
    "https://www.noodle3.com.tw/": () => response(200, { "content-type": "text/html" }, NOODLE_PAGE)
  });
  const result = await entry.resolveEntryUrl("https://noodle3.com.tw/", { fetch });
  assert.equal(result.url, "https://www.noodle3.com.tw/");
  assert.equal(result.reachable, true);
  assert.deepEqual(fetch.calls.map((call) => call.url), ["https://noodle3.com.tw/", "https://www.noodle3.com.tw/"]);
  assert.ok(fetch.calls.every((call) => call.redirect === "manual"), "every hop is inspected, not auto-followed");
}

{
  // Only http apex answers, and it redirects twice before the https www page.
  const fetch = fetchStub({
    "https://noodle3.com.tw/": timeout,
    "https://www.noodle3.com.tw/": () => Object.assign(new TypeError("fetch failed"), { code: "ECONNREFUSED" }),
    "http://noodle3.com.tw/": () => response(301, { location: "http://www.noodle3.com.tw/" }),
    "http://www.noodle3.com.tw/": () => response(302, { location: "https://www.noodle3.com.tw/zh-tw/" }),
    "https://www.noodle3.com.tw/zh-tw/": () => response(200, { "content-type": "text/html" }, NOODLE_PAGE)
  });
  const result = await entry.resolveEntryUrl("https://noodle3.com.tw/", { fetch });
  assert.equal(result.url, "https://www.noodle3.com.tw/zh-tw/", "the final 2xx target of the redirect chain is the entry");
  assert.deepEqual(fetch.calls.map((call) => call.url), [
    "https://noodle3.com.tw/", "https://www.noodle3.com.tw/", "http://noodle3.com.tw/", "http://www.noodle3.com.tw/", "https://www.noodle3.com.tw/zh-tw/"
  ], "https apex, then https www, then http apex following its redirects");
}

{
  // A www input tries the apex as its second candidate; a reachable input is kept as is.
  const fetch = fetchStub({ "https://www.noodle3.com.tw/": () => response(200, {}, NOODLE_PAGE) });
  const result = await entry.resolveEntryUrl("https://www.noodle3.com.tw/", { fetch });
  assert.equal(result.url, "https://www.noodle3.com.tw/");
  assert.deepEqual(fetch.calls.map((call) => call.url), ["https://www.noodle3.com.tw/"]);
  assert.deepEqual(entry.entryCandidates("https://www.noodle3.com.tw/"), ["https://www.noodle3.com.tw/", "https://noodle3.com.tw/", "http://www.noodle3.com.tw/"]);
  assert.deepEqual(entry.entryCandidates("http://noodle3.com.tw/"), ["http://noodle3.com.tw/", "https://www.noodle3.com.tw/", "https://noodle3.com.tw/"]);
  assert.deepEqual(entry.entryCandidates("https://203.0.113.9/"), ["https://203.0.113.9/", "http://203.0.113.9/"], "an IP gets no www variant");
}

{
  // Every hop passes the SSRF check: a redirect into a private host is not followed, and the
  // fetch of that host never happens.
  const fetch = fetchStub({
    "https://noodle3.com.tw/": () => response(302, { location: "http://169.254.169.254/latest/meta-data/" }),
    "https://www.noodle3.com.tw/": () => response(301, { location: "http://localhost:8080/" }),
    "http://noodle3.com.tw/": () => response(301, { location: "ftp://noodle3.com.tw/" })
  });
  const result = await entry.resolveEntryUrl("https://noodle3.com.tw/", { fetch });
  assert.equal(result.reachable, false);
  assert.equal(result.url, "https://noodle3.com.tw/", "nothing reachable keeps the normalized input");
  assert.ok(fetch.calls.every((call) => !/169\.254|localhost|ftp:/.test(call.url)), `private or non-http targets were fetched: ${fetch.calls.map((c) => c.url)}`);
}

{
  // A redirect loop and a 5xx are not entries; a 4xx apex still loses to a 2xx www.
  const loop = fetchStub({
    "https://noodle3.com.tw/": () => response(301, { location: "https://noodle3.com.tw/" }),
    "https://www.noodle3.com.tw/": () => response(503),
    "http://noodle3.com.tw/": () => response(301, { location: "https://noodle3.com.tw/" })
  });
  assert.equal((await entry.resolveEntryUrl("https://noodle3.com.tw/", { fetch: loop })).reachable, false);
  assert.ok(loop.calls.length <= 12, `a loop stops after a few hops, not ${loop.calls.length}`);
  const forbidden = fetchStub({
    "https://noodle3.com.tw/": () => response(403),
    "https://www.noodle3.com.tw/": () => response(200, {}, NOODLE_PAGE)
  });
  assert.equal((await entry.resolveEntryUrl("https://noodle3.com.tw/", { fetch: forbidden })).url, "https://www.noodle3.com.tw/");
}

{
  // The cache key uses the resolved entry, so one site is one cache row however it was typed.
  const keys = await Promise.all(["https://www.noodle3.com.tw/", "https://www.noodle3.com.tw/zh-tw/", "HTTPS://WWW.NOODLE3.COM.TW/"]
    .map((url) => entry.cacheKey(url, [], "v1")));
  assert.equal(new Set(keys).size, 1);
  assert.notEqual(keys[0], await entry.cacheKey("https://noodle3.com.tw/", [], "v1"), "the dead apex and the live www are different entries");
  assert.equal(entry.normalizeUrl("noodle3.com.tw"), "https://noodle3.com.tw/");
  assert.throws(() => entry.normalizeUrl("127.0.0.1"), /invalid_target_url/);
}

// 2. The Worker end to end with stubbed bindings: the job keeps what the user typed, the probe
// result decides what Browser Rendering and the container fetch, and the cache key.
{
  const d1 = fakeD1();
  const sentJobs = [];
  const browserCalls = [];
  const containerCalls = [];
  globalThis.__WORKER_ENV__ = {
    AUDIT_PIPELINE_VERSION: "test-pipeline",
    AUDIT_ADMISSION_ENABLED: "true",
    AUDIT_LIMITS: JSON.stringify({ daily: 5, per_ip: 2, per_ip_hours: 1 }),
    AUDIT_IP_PEPPER: PEPPER,
    REPORTS_DB: d1,
    AUDIT_JOBS: { send: async (message) => { sentJobs.push(message); } },
    BROWSER: { quickAction: async (action, options) => { browserCalls.push({ action, ...options }); return new Response(JSON.stringify({ html: NOODLE_PAGE }), { status: 200 }); } },
    AUDIT_FALLBACK: { get: () => ({ fetch: async (request) => {
      const body = await request.json();
      containerCalls.push({ path: new URL(request.url).pathname, body });
      return Response.json({ report: { id: "ignored", method: "mcac", url: body.url, finalUrl: body.url, requestedUrl: body.requested_url, limited: false, createdAt: "2026-10-21T00:00:00Z", mcac: { probes: [] } }, crawl_path: "browser_run" });
    } }) }
  };
  const worker = (await import("../services/cloudflare/audit/src/worker.js")).default;
  const env = globalThis.__WORKER_ENV__;
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchStub({
    "https://noodle3.com.tw/": timeout,
    "https://www.noodle3.com.tw/": () => response(200, { "content-type": "text/html" }, NOODLE_PAGE)
  });
  try {
    const accepted = await worker.fetch(post("/api/audit-real-lite", { url: "noodle3.com.tw" }), env);
    const acceptedBody = await accepted.json();
    assert.equal(accepted.status, 202, JSON.stringify(acceptedBody));
    const { job_id: jobId } = acceptedBody;
    const job = d1.jobs.get(jobId);
    assert.equal(job.site_url, "https://noodle3.com.tw/", "audit_jobs.site_url keeps the user's input");
    const diagnostics = JSON.parse(job.diagnostics_json);
    assert.equal(diagnostics.entry_url, "https://www.noodle3.com.tw/", "the job records the reachable entry");
    assert.equal(diagnostics.cache_hit, false);
    assert.equal(job.cache_key, await entry.cacheKey("https://www.noodle3.com.tw/", [], "test-pipeline"), "the cache key is the resolved entry's");
    assert.deepEqual(sentJobs, [{ job_id: jobId }]);

    await worker.queue({ messages: [{ body: { job_id: jobId }, attempts: 1, ack() {}, retry() { throw new Error("retry not expected"); } }] }, env);
    assert.deepEqual(browserCalls, [], "all rendering stays inside the restricted container");
    assert.equal(containerCalls[0].body.browser_html, undefined);
    assert.equal(containerCalls.length, 1);
    assert.equal(containerCalls[0].path, "/audit");
    assert.equal(containerCalls[0].body.url, "https://www.noodle3.com.tw/", "the container measures the reachable entry");
    assert.equal(containerCalls[0].body.requested_url, "https://noodle3.com.tw/", "the container also gets what the user typed, for the report");
    assert.equal(d1.jobs.get(jobId).status, "completed");
    const stored = d1.reports.get(job.report_id);
    assert.equal(stored.site_origin, "https://www.noodle3.com.tw");
    assert.equal(JSON.parse(stored.report_json).requestedUrl, "https://noodle3.com.tw/");

    // The same site typed as www, as http, or with the dead apex again, is a cache hit now.
    for (const input of ["www.noodle3.com.tw", "http://noodle3.com.tw", "noodle3.com.tw/"]) {
      const again = await worker.fetch(post("/api/audit-real-lite", { url: input }), env);
      const body = await again.json();
      assert.equal(again.status, 202, JSON.stringify(body));
      assert.equal(body.status, "completed", `${input} reuses the stored report`);
      assert.equal(body.report_id, job.report_id);
    }
    assert.equal(sentJobs.length, 1, "no second audit ran for the same site");

    // A site no candidate reaches still gets its audit with the normalized input, as before.
    globalThis.fetch = fetchStub({});
    const dead = await worker.fetch(post("/api/audit-real-lite", { url: "dead.example" }), env);
    assert.equal(dead.status, 202);
    const deadJob = d1.jobs.get((await dead.json()).job_id);
    assert.equal(JSON.parse(deadJob.diagnostics_json).entry_url, "https://dead.example/");
    assert.equal(JSON.parse(deadJob.diagnostics_json).entry_reachable, false);
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log("cloudflare audit entry url tests passed");

function post(path, body) {
  return new Request(`https://geocheck.lslabs.tw${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
    body: JSON.stringify(body)
  });
}

// Enough of D1 for the audit Worker: the statements it runs, matched by their text.
function fakeD1() {
  const jobs = new Map();
  const reports = new Map();
  const execute = (sql, args) => {
    const text = sql.replace(/\s+/g, " ");
    if (/^(DELETE FROM|INSERT INTO) audit_request_admissions/.test(text)) return { run: async () => ({ meta: { changes: 1 } }) };
    if (/^SELECT report_id FROM audit_reports WHERE cache_key/.test(text)) {
      const [key] = args;
      const hit = [...reports.values()].find((row) => row.cache_key === key);
      return { first: async () => (hit ? { report_id: hit.report_id } : null) };
    }
    if (/^SELECT COUNT\(\*\)/.test(text)) return { first: async () => ({ n: 0 }) };
    if (/^SELECT \* FROM audit_jobs WHERE job_id/.test(text)) return { first: async () => jobs.get(args[0]) || null };
    if (/^SELECT report_json FROM audit_reports/.test(text)) return { first: async () => reports.get(args[0]) || null };
    if (/^INSERT INTO audit_jobs/.test(text)) {
      const [job_id, report_id, cache_key, site_url, custom_queries_json, status, created_at, updated_at, completed_at, diagnostics_json] = args;
      jobs.set(job_id, { job_id, report_id, cache_key, site_url, custom_queries_json, status, created_at, updated_at, completed_at, diagnostics_json, attempt_count: 0 });
      return { run: async () => ({ meta: { changes: 1 } }) };
    }
    if (/^UPDATE audit_jobs SET status = 'running'/.test(text)) {
      const [lease_token, lease_expires_at, updated_at, job_id] = args;
      const job = jobs.get(job_id);
      if (!job || job.status !== "queued") return { run: async () => ({ meta: { changes: 0 } }) };
      Object.assign(job, { status: "running", lease_token, lease_expires_at, updated_at, attempt_count: job.attempt_count + 1 });
      return { run: async () => ({ meta: { changes: 1 } }) };
    }
    if (/^INSERT INTO audit_reports/.test(text)) {
      const [report_id, cache_key, site_origin, , , , , , , , , , report_json] = args;
      reports.set(report_id, { report_id, cache_key, site_origin, report_json });
      return { run: async () => ({ meta: { changes: 1 } }) };
    }
    if (/^UPDATE audit_jobs SET diagnostics_json = json_patch/.test(text)) {
      const [patch, updated_at, job_id, lease_token] = args;
      const job = jobs.get(job_id);
      if (job && job.lease_token === lease_token) {
        Object.assign(job, { updated_at, diagnostics_json: JSON.stringify({ ...JSON.parse(job.diagnostics_json || "{}"), ...JSON.parse(patch) }) });
      }
      return { run: async () => ({ meta: { changes: job ? 1 : 0 } }) };
    }
    if (/^UPDATE audit_jobs SET status = \?, completed_at/.test(text)) {
      const [status, completed_at, updated_at, patch, job_id, lease_token] = args;
      const job = jobs.get(job_id);
      if (job && job.lease_token === lease_token) {
        Object.assign(job, { status, completed_at, updated_at, diagnostics_json: JSON.stringify({ ...JSON.parse(job.diagnostics_json || "{}"), ...JSON.parse(patch) }), error_code: null });
      }
      return { run: async () => ({ meta: { changes: job ? 1 : 0 } }) };
    }
    throw new Error(`fake D1 has no handler for: ${text.slice(0, 80)}`);
  };
  return {
    jobs,
    reports,
    prepare: (sql) => ({ bind: (...args) => execute(sql, args) }),
    batch: async (statements) => Promise.all(statements.map((statement) => statement.run()))
  };
}
