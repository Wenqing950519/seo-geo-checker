const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// After a submit, the home page polls the audit Worker and opens /report/<id>. The Worker
// stores each report under the job's report_id, while the stored report body keeps the id
// the container gave it (services/cloudflare/audit/src/worker.js), so the page must open
// the id the job reports. Reading report.id sent every new audit to "Report not found".
const home = fs.readFileSync(path.resolve(__dirname, "../../apps/web/public/home.html"), "utf8");
const block = home.match(/\/\/ <audit-flow>([\s\S]*?)\/\/ <\/audit-flow>/);
assert.ok(block, "home must keep the audit flow between // <audit-flow> markers");

function load({ post, statuses }) {
  let clock = 0;
  const calls = [];
  const queue = [...statuses];
  const context = {
    calls,
    postJson: async (route, payload) => { calls.push(["POST", route, payload]); return post; },
    getJson: async (route) => {
      calls.push(["GET", route]);
      if (!route.startsWith("/api/status/")) throw new Error(`unexpected GET ${route}`);
      return queue.length > 1 ? queue.shift() : queue[0];
    },
    setTimeout: (resolve, ms) => { clock += ms; resolve(); },
    Date: { now: () => clock },
    encodeURIComponent,
    Promise,
    Error,
    Boolean,
    String
  };
  vm.createContext(context);
  vm.runInContext(block[1], context);
  return context;
}

(async () => {
  // 1. A new job: queued, running, completed. The page opens the job's report id and
  //    does not need the report JSON to do it.
  {
    const page = load({
      post: { job_id: "aud_1", report_id: "real_lite_stored", status: "queued" },
      statuses: [
        { status: "queued", reportId: "real_lite_stored", diagnostics: { cache_hit: false } },
        { status: "running", reportId: "real_lite_stored", diagnostics: { cache_hit: false } },
        { status: "completed", reportId: "real_lite_stored", diagnostics: { browser_run: "succeeded" } }
      ]
    });
    const notes = [];
    const result = await page.waitForAuditReport("https://bistro.example/", ["大安區約會餐酒館推薦？"], (note) => notes.push(note));
    assert.equal(result.reportId, "real_lite_stored");
    assert.equal(result.cacheHit, false);
    // Objects made inside the vm carry its own prototypes; compare their JSON.
    assert.deepEqual(JSON.parse(JSON.stringify(page.calls[0])), ["POST", "/api/audit-real-lite", { url: "https://bistro.example/", customQueries: ["大安區約會餐酒館推薦？"], source: "website_home" }]);
    assert.ok(page.calls.every(([, route]) => !route.startsWith("/api/report/")), "the stored report body is not needed to open the report page");
    assert.ok(notes.length >= 2, "the page reports queued and running states");
  }

  // 2. A cached report answers at once and is marked as a cache hit.
  {
    const page = load({
      post: { job_id: "aud_2", report_id: "real_lite_cached", status: "completed" },
      statuses: [{ status: "completed", reportId: "real_lite_cached", diagnostics: { cache_hit: true } }]
    });
    const result = await page.waitForAuditReport("https://bistro.example/", undefined, () => {});
    assert.deepEqual({ ...result }, { reportId: "real_lite_cached", cacheHit: true });
  }

  // 3. A site that could not be read still completes, with limitations, and opens its report.
  {
    const page = load({
      post: { job_id: "aud_3", report_id: "real_lite_limited", status: "queued" },
      statuses: [{ status: "completed_with_limitations", reportId: "real_lite_limited", diagnostics: {} }]
    });
    assert.equal((await page.waitForAuditReport("https://bistro.example/", undefined, () => {})).reportId, "real_lite_limited");
  }

  // 4. A failed job and a job that never finishes both stop with a message, and neither
  //    promises that the report will appear later (a job whose last retry failed stays
  //    queued in the Worker).
  {
    const failed = load({ post: { job_id: "aud_4", report_id: "real_lite_x" }, statuses: [{ status: "failed" }] });
    await assert.rejects(failed.waitForAuditReport("https://bistro.example/", undefined, () => {}), (error) => {
      assert.match(failed.auditErrorMessage(error), /^這次檢查沒有完成：/);
      return true;
    });
    const stuck = load({ post: { job_id: "aud_5", report_id: "real_lite_y" }, statuses: [{ status: "queued", error_code: "audit_failed" }] });
    await assert.rejects(stuck.waitForAuditReport("https://bistro.example/", undefined, () => {}), (error) => {
      const shown = stuck.auditErrorMessage(error);
      assert.match(shown, /請稍後再試一次/);
      assert.doesNotMatch(shown, /背景完成|會出現/);
      return true;
    });
    const missing = load({ post: { status: "queued" }, statuses: [{}] });
    await assert.rejects(missing.waitForAuditReport("https://bistro.example/", undefined, () => {}), /工作編號/);
  }

  // 5. Worker refusals read as plain Chinese, without doubled punctuation or English.
  {
    const page = load({ post: {}, statuses: [{}] });
    assert.equal(page.auditErrorMessage({ status: 429, code: "daily_limit_reached", message: "今日免費檢測額度已滿，請明天再試。" }), "今日免費檢測額度已滿，請明天再試。");
    const paused = page.auditErrorMessage({ status: 503, code: "service_unavailable", message: "New audits are temporarily paused" });
    assert.doesNotMatch(paused, /[A-Za-z]/, "the paused message must not show the Worker's English text");
    assert.match(paused, /暫停受理新的檢測/);
    const invalid = page.auditErrorMessage({ status: 400, code: "invalid_custom_queries", message: "自訂觀測題最多 4 題，且每題都必須不同。" });
    assert.doesNotMatch(invalid, /。。/);
    assert.match(invalid, /^這次檢查沒有完成：/);
  }

  // 6. The page opens the returned id and reports it to GA4.
  assert.match(home, /window\.location\.href = `\$\{API_BASE\}\/report\/\$\{encodeURIComponent\(result\.reportId\)\}`/);
  assert.doesNotMatch(home, /\/report\/\$\{report\.id\}/);
  assert.match(home, /analysis_id: result\.reportId/);
  assert.match(home, /textContent = auditErrorMessage\(err\)/);

  console.log("home audit flow tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
