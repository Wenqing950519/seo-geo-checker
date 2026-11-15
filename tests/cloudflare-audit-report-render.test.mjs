import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// Report pages and Markdown downloads used to cold-start the Playwright container just to turn
// stored JSON into HTML. That rendering is plain JavaScript, so it lives in its own module that
// the audit Worker imports directly; only audits still need the container (2026-11-15 cost check).

const require = createRequire(import.meta.url);
const render = require("../apps/web/report/report-render.js");
for (const name of ["normalizeReportForClient", "reportHtml", "reportMarkdown"]) {
  assert.equal(typeof render[name], "function", `report-render.js must export ${name}`);
}

const report = render.normalizeReportForClient({
  id: "real_lite_md", method: "mcac", url: "https://www.example-noodle.tw/", finalUrl: "https://www.example-noodle.tw/",
  requestedUrl: "https://example-noodle.tw/", createdAt: "2026-10-20T00:00:00Z", mcac: { probes: [] }
});
assert.match(render.reportHtml(report), /<\/html>/i);
assert.match(render.reportHtml(report), /G-CBTTKVLT82/, "report page keeps the GA tag");
assert.match(render.reportMarkdown(report), /AI 能見度檢測單/);

// The Node server keeps serving the same functions instead of a second copy.
const server = await readFile("services/api/server.js", "utf8");
assert.match(server, /require\("\.\.\/\.\.\/apps\/web\/report\/report-render\.js"\)/);
assert.doesNotMatch(server, /function realLiteReportHtml\(/, "render code must not be duplicated in server.js");

const worker = await readFile("services/cloudflare/audit/src/worker.js", "utf8");
assert.doesNotMatch(worker, /RENDER_CONTAINER/, "report routes must not wake the audit container");
assert.doesNotMatch(worker, /render-markdown|"\/render"/);

console.log("cloudflare audit report render tests passed");
