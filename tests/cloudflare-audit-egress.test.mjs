import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { crawlerGateway, fetchPublicPage, providerGateway } from "../services/cloudflare/audit/src/egress.mjs";
import { admitRequest } from "../services/cloudflare/audit/src/request-admission.mjs";
import { fetchPublicUrl } from "../packages/crawler/public-fetch.js";
import { resolveCitationRedirects } from "../packages/crawler/citation-resolve.js";

register("./fixtures/cloudflare-worker-hooks.mjs", import.meta.url);
globalThis.__WORKER_ENV__ = { DEEPSEEK_API_KEY: "real-test-secret", PERPLEXITY_API_KEY: "real-search-secret" };
const { AuditFallbackContainer, default: worker } = await import("../services/cloudflare/audit/src/worker.js");

test("the public container denies unmanaged network paths and never receives real provider credentials", () => {
  const container = new AuditFallbackContainer();
  assert.equal(container.enableInternet, false);
  assert.equal(container.interceptHttps, true);
  assert.equal(container.envVars.GEOCHECK_EGRESS_MODE, "cloudflare-gateway-v1");
  assert.doesNotMatch(JSON.stringify(container.envVars), /real-test-secret|real-search-secret/);
  assert.deepEqual(Object.keys(AuditFallbackContainer.outboundByHost).sort(), ["api.deepseek.com", "api.perplexity.ai", "generativelanguage.googleapis.com", "geocheck-egress.internal"].sort());
});

test("public gateway rejects mixed/private DNS answers before opening a website connection", async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    assert.equal(new URL(url).hostname, "cloudflare-dns.com");
    return Response.json({ Status: 0, Answer: new URL(url).searchParams.get("type") === "A"
      ? [{ type: 1, data: "93.184.215.14" }] : [{ type: 28, data: "fd00::1" }] });
  };
  await assert.rejects(() => fetchPublicPage("https://rebind.example/", {}, { fetch }), /egress_dns_not_public/);
  assert.equal(calls.length, 2);
  for (const url of ["http://169.254.169.254/", "http://[::ffff:127.0.0.1]/", "https://user:pass@public.example/", "http://public.example:8080/"]) {
    await assert.rejects(() => fetchPublicPage(url, {}, { fetch }), /unsafe_public_url/);
  }
  assert.equal(calls.length, 2, "invalid syntax must not even trigger DNS");
});

test("each public redirect remains visible and neither credentials nor browser forwarding headers leave the gateway", async () => {
  const calls = [];
  const dependencies = { resolve: async () => {}, fetch: async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 302, headers: { location: "https://next.example/path" } });
  } };
  const response = await fetchPublicPage("https://public.example/", { headers: { cookie: "private-cookie", authorization: "Bearer private", "x-forwarded-for": "127.0.0.1", accept: "text/html" } }, dependencies);
  assert.equal(response.status, 302);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, "manual");
  assert.deepEqual([...calls[0].init.headers.keys()].sort(), ["accept", "accept-encoding"]);
  await assert.rejects(() => fetchPublicPage("https://public.example/", {}, { resolve: async () => {}, fetch: async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }) }), /unsafe_public_url/);
});

test("gateway bounds website bytes and probes cancel bodies immediately", async () => {
  let pulls = 0;
  const stream = () => new ReadableStream({ pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(1024 * 1024)); } });
  await assert.rejects(() => fetchPublicPage("https://public.example/", {}, { resolve: async () => {}, fetch: async () => new Response(stream()) }), /egress_response_too_large/);
  assert.ok(pulls <= 4);
  let canceled = false;
  await fetchPublicPage("https://public.example/", { headersOnly: true }, { resolve: async () => {}, fetch: async () => new Response(new ReadableStream({ cancel() { canceled = true; } })) });
  assert.equal(canceled, true);
});

test("synthetic gateway is only usable through the private container outbound binding", async () => {
  let calls = 0;
  const dependencies = { resolve: async () => {}, fetch: async () => { calls += 1; return new Response("page"); } };
  const request = (url) => new Request(url, { method: "POST", body: JSON.stringify({ url: "https://public.example/" }) });
  assert.equal((await crawlerGateway(request("http://geocheck-egress.internal/fetch"), {}, {}, dependencies)).status, 200);
  for (const url of ["https://geocheck-egress.internal/fetch", "http://geocheck-egress.internal/other", "http://geocheck-egress.internal/fetch?url=bad", "http://evil.example/fetch"]) {
    assert.equal((await crawlerGateway(request(url), {}, {}, dependencies)).status, 403);
  }
  assert.equal((await worker.fetch(request("https://geocheck.lslabs.tw/fetch"), {})).status, 404);
  assert.equal(calls, 1);
  for (const maxBytes of ["invalid", "1024", {}, -1, null, 0]) {
    const malformed = new Request("http://geocheck-egress.internal/fetch", { method: "POST", body: JSON.stringify({ url: "https://public.example/", maxBytes }) });
    assert.equal((await crawlerGateway(malformed, {}, {}, dependencies)).status, 502);
  }
  assert.equal(calls, 1, "malformed byte limits fail before any upstream request");
});

test("provider gateway restricts protocol/method/path/query, injects only its own credential, and blocks redirects", async () => {
  const calls = [];
  const env = { DEEPSEEK_API_KEY: "test-provider-secret" };
  const make = (url, method = "POST") => new Request(url, { method, headers: { "content-type": "application/json", authorization: "Bearer attacker-token", cookie: "bad", "x-forwarded-host": "evil.example" }, ...(method === "POST" ? { body: '{"model":"deepseek-v4-flash"}' } : {}) });
  const dependencies = { fetch: async (url, init) => { calls.push({ url, init }); return Response.json({ ok: true }); } };
  for (const url of ["http://api.deepseek.com/chat/completions", "https://api.deepseek.com/v1/other", "https://api.deepseek.com/chat/completions?redirect=evil", "https://api.deepseek.com:8443/chat/completions", "https://api.deepseek.com.evil.example/chat/completions"]) assert.equal((await providerGateway(make(url), env, {}, dependencies)).status, 403);
  assert.equal((await providerGateway(make("https://api.deepseek.com/chat/completions", "GET"), env, {}, dependencies)).status, 403);
  assert.equal((await providerGateway(make("https://api.deepseek.com/chat/completions"), {}, {}, dependencies)).status, 503);
  assert.equal(calls.length, 0);
  assert.equal((await providerGateway(make("https://api.deepseek.com/chat/completions"), env, {}, dependencies)).status, 200);
  assert.equal(calls[0].init.headers.get("authorization"), "Bearer test-provider-secret");
  assert.equal(calls[0].init.headers.get("cookie"), null);
  assert.equal(calls[0].init.headers.get("x-forwarded-host"), null);
  assert.equal(calls[0].init.redirect, "manual");
  const redirect = await providerGateway(make("https://api.deepseek.com/chat/completions"), env, {}, { fetch: async (_url, init) => { assert.equal(init.redirect, "manual"); return new Response(null, { status: 307, headers: { location: "https://evil.example/" } }); } });
  assert.equal(redirect.status, 502);
});

test("cloud Node crawler uses only the private gateway for every redirect and never native DNS", async () => {
  const originalMode = process.env.GEOCHECK_EGRESS_MODE;
  const originalFetch = globalThis.fetch;
  const calls = [];
  process.env.GEOCHECK_EGRESS_MODE = "cloudflare-gateway-v1";
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "http://geocheck-egress.internal/fetch");
    assert.equal(init.redirect, "manual");
    calls.push(JSON.parse(init.body));
    return calls.length === 1 ? new Response(null, { status: 302, headers: { location: "https://next.example/" } }) : new Response("public content", { headers: { "content-encoding": "gzip" } });
  };
  try {
    const response = await fetchPublicUrl("https://public.example/", { lookup: () => { throw new Error("native DNS must not run"); } });
    assert.equal(await response.text(), "public content");
    assert.equal(response.url, "https://next.example/");
    assert.equal(response.headers.get("content-encoding"), null, "Node fetch already decoded gateway compression");
    assert.deepEqual(calls.map((call) => call.url), ["https://public.example/", "https://next.example/"]);
  } finally { globalThis.fetch = originalFetch; if (originalMode === undefined) delete process.env.GEOCHECK_EGRESS_MODE; else process.env.GEOCHECK_EGRESS_MODE = originalMode; }
});

test("cross-isolate request admission enforces both ceilings atomically and expires old requests", async () => {
  const schema = await readFile(new URL("../services/api/migrations/0007_audit_request_admissions.sql", import.meta.url), "utf8");
  const sql = new DatabaseSync(":memory:");
  sql.exec(schema);
  const db = { prepare(query) { return { bind(...args) { return { async run() { return { meta: { changes: sql.prepare(query).run(...args).changes } }; } }; } }; } };
  try {
    const results = await Promise.all(Array.from({ length: 32 }, () => admitRequest(db, "same-client", 1_000_000)));
    assert.equal(results.filter(Boolean).length, 20);
    const more = await Promise.all(Array.from({ length: 300 }, (_, i) => admitRequest(db, `client-${i}`, 1_000_001)));
    assert.equal(more.filter(Boolean).length, 280);
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM audit_request_admissions").get().n, 300);
    assert.equal(await admitRequest(db, "same-client", 1_300_002), true);
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM audit_request_admissions").get().n, 1);
  } finally { sql.close(); }
});

test("cloud citation redirect resolution also uses the gateway with HEAD requests", async () => {
  const previousMode = process.env.GEOCHECK_EGRESS_MODE;
  const previousFetch = globalThis.fetch;
  process.env.GEOCHECK_EGRESS_MODE = "cloudflare-gateway-v1";
  const source = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/test";
  const calls = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "http://geocheck-egress.internal/fetch");
    calls.push(JSON.parse(init.body));
    return new Response(null, { status: 302, headers: { location: "https://official.example/page" } });
  };
  try {
    assert.deepEqual(await resolveCitationRedirects([source]), { [source]: "https://official.example/page" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "HEAD");
    assert.equal(calls[0].url, source);
  } finally { globalThis.fetch = previousFetch; if (previousMode === undefined) delete process.env.GEOCHECK_EGRESS_MODE; else process.env.GEOCHECK_EGRESS_MODE = previousMode; }
});

test("rejected request admission performs no DNS, website probe, queue send or lead write", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network must not run"); };
  const statements = [];
  const env = { AUDIT_ADMISSION_ENABLED: "true", AUDIT_IP_PEPPER: "test-pepper-1234567890", AUDIT_LIMITS: JSON.stringify({ daily: 5, per_ip: 2, per_ip_hours: 1 }), REPORTS_DB: {
    prepare(query) { statements.push(query); return { bind() { return { run: async () => ({ meta: { changes: 0 } }) }; } }; }
  } };
  try {
    for (const [path, body] of [["/api/audit-real-lite", { url: "public.example" }], ["/api/leads", { email: "test@example.com", site: "public.example", consent: true }]]) {
      const response = await worker.fetch(new Request(`https://geocheck.example${path}`, { method: "POST", body: JSON.stringify(body) }), env);
      assert.equal(response.status, 429);
    }
    assert.ok(statements.every((sql) => sql.includes("audit_request_admissions")));
  } finally { globalThis.fetch = previousFetch; }
});

test("the deployed audit has no unmanaged Browser Rendering binding or execution path", async () => {
  const source = await readFile(new URL("../services/cloudflare/audit/src/worker.js", import.meta.url), "utf8");
  const config = JSON.parse(await readFile(new URL("../services/cloudflare/audit/wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.browser, undefined);
  assert.doesNotMatch(source, /\.quickAction\(/);
});
