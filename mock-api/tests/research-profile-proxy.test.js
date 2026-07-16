const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { buildResearchProfileViaProxy } = require("../lib/research-profile");

(async () => {
  let receivedToken = "";
  let receivedBody = null;
  const server = http.createServer((req, res) => {
    receivedToken = String(req.headers["x-admin-token"] || "");
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        profile: {
          entity_name: "測試商家",
          industry: "餐飲",
          business_scope: "在地服務",
          geography: ["台灣"],
          primary_language: "繁體中文",
          page_purpose: "品牌官網",
          structure_summary: { information_architecture: "首頁與服務頁", content_format: ["文字"], schema_types: [], js_dependency: "low" },
          observed_content_topics: ["服務"],
          evidence_basis: ["title"],
          confidence: "medium"
        },
        provider: "gemini",
        model: "gemini-3.1-flash-lite",
        version: "1.0.0"
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const result = await buildResearchProfileViaProxy({
      siteUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      siteType: "local_business",
      homepage: { metadata: { title: "測試商家" }, text: "測試內容", fetchMethod: "http" },
      signals: {}, technical: {}, representativePages: []
    }, { proxyUrl: `http://127.0.0.1:${port}`, proxyToken: "test-secret" });
    assert.strictEqual(receivedToken, "test-secret");
    assert.strictEqual(receivedBody.measurement.homepage.text, "測試內容");
    assert.strictEqual(result.profile.industry, "餐飲");
    assert.strictEqual(result.execution, "proxy");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(serverSource, /\/api\/internal\/research-profile/);
  assert.match(serverSource, /if \(!isValidAdminToken\(req\)\)/);
  console.log("research-profile-proxy.test.js passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
