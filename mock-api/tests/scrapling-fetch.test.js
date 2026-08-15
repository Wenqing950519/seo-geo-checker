const assert = require("node:assert/strict");
const { fetchHomepageWithScrapling, resolvePython } = require("../lib/scrapling-fetch");

(async () => {
  const calls = [];
  const result = await fetchHomepageWithScrapling("https://example.com/", null, {
    mode: "dynamic",
    respectRobots: true,
    runner: async (input) => {
      calls.push(input);
      return {
        ok: true,
        html: "<html><head><title>Example</title></head><body>" + "content ".repeat(30) + "</body></html>",
        statusCode: 200,
        finalUrl: "https://example.com/",
        headers: { contentType: "text/html" },
        robots: { checked: true, allowed: true, url: "https://example.com/robots.txt" }
      };
    }
  });
  assert.equal(result.fetchMethod, "scrapling-dynamic");
  assert.equal(result.statusCode, 200);
  assert.equal(result.scraplingDiagnostics.robots.allowed, true);
  assert.equal(calls[0].respectRobots, true);

  await assert.rejects(
    () => fetchHomepageWithScrapling("https://example.com/", null, {
      mode: "stealth",
      runner: async () => ({ ok: false, error: "robots.txt disallows GeoCheck-Audit", errorType: "PermissionError" })
    }),
    (error) => error.stage === "scrapling_fetch" && /robots\.txt/.test(error.message)
  );

  assert.ok(resolvePython(), "a Python command or local runtime should always be resolved");
  console.log("scrapling fetch tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
