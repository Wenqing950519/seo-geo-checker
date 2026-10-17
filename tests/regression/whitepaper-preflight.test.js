const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "geocheck-whitepaper-preflight-"));
try {
  fs.writeFileSync(path.join(fixtureDir, "sites.csv"), "url\nhttps://matched.example\nhttps://unmatched.example\n", "utf8");
  fs.writeFileSync(path.join(fixtureDir, "queries.json"), JSON.stringify({
    query_set_version: "test-reviewed-v1",
    review_status: "approved",
    reviewed_by: "tester",
    reviewed_at: "2026-09-02",
    queries: [
      { id: "q1", text: "台北壽司餐廳推薦？", intent: "recommendation" },
      { id: "q2", text: "台北壽司套餐怎麼比較？", intent: "comparison" }
    ]
  }), "utf8");
  fs.writeFileSync(path.join(fixtureDir, "master.csv"), [
    "store_id,brand_id,official_name_zh,official_name_en,aliases,official_domains,owned_urls,shared_domain_flag,branch_name,district,include_status,exclusion_reason_code,reviewed_by,reviewed_at,truth_source,dataset_version",
    "store-1,brand-1,已覆核品牌,Reviewed Brand,,matched.example,https://matched.example/,false,,,pending,,tester,2026-09-02,official-site,test-v1"
  ].join("\n"), "utf8");
  const result = spawnSync(process.execPath, [
    path.join(root, ".agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs"),
    "--project-root", root,
    "--input", path.join(fixtureDir, "sites.csv"),
    "--query-set", path.join(fixtureDir, "queries.json"),
    "--master", path.join(fixtureDir, "master.csv"),
    "--max-perplexity-calls", "3",
    "--max-deepseek-calls", "1"
  ], { encoding: "utf8", env: { ...process.env, PERPLEXITY_API_KEY: "", DEEPSEEK_API_KEY: "" } });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0, "uncovered entity inputs must fail before the batch starts");
  assert.match(output, /Entity master preflight failed/);
  assert.match(output, /still pending review/);
  assert.match(output, /no matching official domain/);
  assert.doesNotMatch(output, /PERPLEXITY_API_KEY|DEEPSEEK_API_KEY/, "coverage must fail before provider configuration");

  fs.writeFileSync(path.join(fixtureDir, "master.csv"), [
    "store_id,brand_id,official_name_zh,official_name_en,aliases,official_domains,owned_urls,shared_domain_flag,branch_name,district,include_status,exclusion_reason_code,reviewed_by,reviewed_at,truth_source,dataset_version",
    "store-a,brand-a,甲餐廳,Restaurant A,,matched.example,https://matched.example/dining?id=a,true,,,included,,tester,2026-09-02,official-site,test-v1",
    "store-b,brand-b,乙餐廳,Restaurant B,,matched.example,https://matched.example/dining?id=b,true,,,included,,tester,2026-09-02,official-site,test-v1"
  ].join("\n"), "utf8");
  for (const [url, expected] of [
    ["https://matched.example/", /exact owned_urls match/],
    ["https://matched.example/dining?id=b", /Hard stop: 3 Perplexity calls planned, cap is 0/]
  ]) {
    fs.writeFileSync(path.join(fixtureDir, "sites.csv"), `url\n${url}\n`, "utf8");
    const check = spawnSync(process.execPath, [
      path.join(root, ".agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs"),
      "--project-root", root, "--input", path.join(fixtureDir, "sites.csv"),
      "--query-set", path.join(fixtureDir, "queries.json"), "--master", path.join(fixtureDir, "master.csv"),
      "--output-dir", path.join(fixtureDir, "out"), "--max-perplexity-calls", "0", "--max-deepseek-calls", "0"
    ], { encoding: "utf8", env: { ...process.env, PERPLEXITY_API_KEY: "fixture-only", DEEPSEEK_API_KEY: "fixture-only" } });
    assert.notEqual(check.status, 0);
    assert.match(`${check.stdout}\n${check.stderr}`, expected, "CLI must preserve path/query and reject an ambiguous root before provider calls");
  }
} finally {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
}

require("./entity-master-coverage.test.js");
require("./research-transport-budget.test.js");
console.log("whitepaper preflight tests passed");
