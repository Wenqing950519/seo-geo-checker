const assert = require("node:assert/strict");
const { createTruthSourceFetcher, normalizeSourceUrl, TruthSourceError } = require("../services/api/application/dashboard-truth-source-fetcher.js");

async function main() {
  assert.equal(normalizeSourceUrl("https://Example.com/path#tracking"), "https://example.com/path");
  assert.throws(() => normalizeSourceUrl("http://127.0.0.1/private"), (error) => error.code === "unsafe_source_url");
  assert.throws(() => normalizeSourceUrl("file:///tmp/x"), (error) => error.code === "unsafe_source_url");
  await assert.rejects(
    () => createTruthSourceFetcher({ fetch: async () => new Response("ok") }).fetchSource({ kind: "google_maps", url: "https://attacker.example/maps" }),
    (error) => error.code === "invalid_source_host"
  );

  let calls = 0;
  const redirected = createTruthSourceFetcher({ fetch: async (url) => {
    calls += 1;
    if (calls === 1) return new Response(null, { status: 302, headers: { location: "https://example.com/final" } });
    return new Response("<html><body>電話 02-1111-2222</body></html>", { status: 200, headers: { "content-type": "text/html" } });
  } });
  const result = await redirected.fetchSource({ kind: "website", url: "https://example.com/start" });
  assert.equal(result.canonicalUrl, "https://example.com/final");
  assert.equal(result.candidateFields.phone.value, "02-1111-2222");
  assert.equal(Object.hasOwn(result, "rawHtml"), false);

  const looping = createTruthSourceFetcher({ fetch: async (url) => new Response(null, { status: 302, headers: { location: url } }) });
  await assert.rejects(() => looping.fetchSource({ kind: "website", url: "https://example.com/loop" }), (error) => error.code === "source_redirect_limit");

  const failed = createTruthSourceFetcher({ fetch: async () => { throw new Error("network"); } });
  await assert.rejects(() => failed.fetchSource({ kind: "website", url: "https://example.com/fail" }), (error) => error instanceof TruthSourceError && error.code === "source_fetch_failed");
  console.log("dashboard truth source fetcher tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
