const assert = require("node:assert/strict");
const { test } = require("node:test");
const { assertSafePublicUrl, isPrivateIp } = require("../../packages/crawler/url-safety.js");
const { fetchPublicUrl } = require("../../packages/crawler/public-fetch.js");
const { createPublicRouteHandler } = require("../../packages/crawler/browser-fetch-v2.js");
const { Readable } = require("node:stream");
const { EventEmitter } = require("node:events");
const { gzipSync, brotliCompressSync, deflateSync } = require("node:zlib");

test("crawler rejects non-web schemes, URL credentials and mapped IPv6 before DNS", async () => {
  const lookup = async () => [{ address: "8.8.8.8", family: 4 }];
  for (const url of ["ftp://example.com/", "https://user:password@example.com/", "http://example.com:8080/", "http://[::ffff:127.0.0.1]/"]) {
    await assert.rejects(() => assertSafePublicUrl(url, { lookup }), /安全考量/, url);
  }
  assert.equal(isPrivateIp("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateIp("::ffff:7f00:1"), true);
  assert.equal(isPrivateIp("2606:4700:4700::1111"), false);
});

function requestFixture(routes, calls) {
  return (url, options, onResponse) => {
    calls.push(url.toString());
    options.lookup(url.hostname, {}, (_error, address) => assert.equal(address, "8.8.8.8", "socket uses the validated DNS answer"));
    const request = new EventEmitter();
    request.destroy = (error) => { if (error) request.emit("error", error); };
    request.end = () => queueMicrotask(() => {
      const value = routes[url.toString()];
      assert.ok(value, `unexpected network destination: ${url}`);
      const response = Readable.from([Buffer.from(value.body || "")]);
      Object.assign(response, { statusCode: value.status || 200, headers: value.headers || {} });
      onResponse(response);
    });
    return request;
  };
}

test("every HTTP redirect is validated and the checked DNS address is pinned", async () => {
  const calls = [];
  let lookups = 0;
  const options = { lookup: async () => { lookups += 1; return [{ address: "8.8.8.8", family: 4 }]; }, request: requestFixture({
    "https://public.example/": { status: 302, headers: { location: "http://127.0.0.1/private" } }
  }, calls) };
  await assert.rejects(() => fetchPublicUrl("https://public.example/", options), /安全考量/);
  assert.deepEqual(calls, ["https://public.example/"]);
  assert.equal(lookups, 1);
});

test("public crawler body limits are enforced while reading, including undeclared bodies", async () => {
  const calls = [];
  await assert.rejects(() => fetchPublicUrl("https://public.example/", { maxBytes: 16, lookup: async () => [{ address: "8.8.8.8", family: 4 }], request: requestFixture({ "https://public.example/": { body: "x".repeat(32) } }, calls) }), /response_too_large/);
});

test("browser requests never continue around the guarded transport", async () => {
  let aborted = false;
  let fulfilled = false;
  const route = { request: () => ({ resourceType: () => "document", method: () => "GET", url: () => "http://127.0.0.1/", allHeaders: async () => ({}) }), abort: async () => { aborted = true; }, fulfill: async () => { fulfilled = true; }, continue: () => assert.fail("unguarded browser network") };
  await createPublicRouteHandler()(route);
  assert.equal(aborted, true);
  assert.equal(fulfilled, false);
});

test("malformed upstream status rejects the crawl without an uncaught exception", async () => {
  await assert.rejects(() => fetchPublicUrl("https://public.example/", { lookup: async () => [{ address: "8.8.8.8", family: 4 }], request: requestFixture({ "https://public.example/": { status: 999 } }, []) }), /status/);
});

test("the overall deadline also bounds DNS resolution", async () => {
  const controller = new AbortController();
  const pending = fetchPublicUrl("https://public.example/", { signal: controller.signal, lookup: () => new Promise(() => {}), request: () => assert.fail("DNS did not finish") });
  controller.abort(new Error("test_dns_deadline"));
  await assert.rejects(() => pending, /test_dns_deadline/);
});

test("encoded website responses are decoded with an independent output-size ceiling", async () => {
  const text = "<html><body>bounded content</body></html>";
  for (const [encoding, compress] of [["gzip", gzipSync], ["br", brotliCompressSync], ["deflate", deflateSync]]) {
    const result = await fetchPublicUrl("https://public.example/", { lookup: async () => [{ address: "8.8.8.8", family: 4 }], request: requestFixture({ "https://public.example/": { headers: { "content-encoding": encoding }, body: compress(Buffer.from(text)) } }, []) });
    assert.equal(await result.text(), text, encoding);
    assert.equal(result.headers.has("content-encoding"), false, "browser fulfillment must not decode a second time");
  }
  await assert.rejects(() => fetchPublicUrl("https://public.example/", { maxBytes: 128, lookup: async () => [{ address: "8.8.8.8", family: 4 }], request: requestFixture({ "https://public.example/": { headers: { "content-encoding": "gzip" }, body: gzipSync(Buffer.from("x".repeat(4096))) } }, []) }), /response_too_large/);
});
