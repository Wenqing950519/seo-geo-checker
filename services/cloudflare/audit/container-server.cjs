const http = require("node:http");
const { runRealLiteAudit } = require("../../../apps/web/report/real-lite-audit.js");
const { createHomepageFromHtml } = require("../../../packages/crawler/html-v2.js");
const { normalizeReportForClient, reportHtml, reportMarkdown } = require("../../api/server.js");
const { assertPublicHttpUrl } = require("../../../packages/shared/public-url.js");

const PORT = Number(process.env.PORT || 8080);
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text, "utf8") > MAX_REQUEST_BYTES) {
      const error = new Error("request_too_large");
      error.code = "request_too_large";
      throw error;
    }
  }
  return JSON.parse(text || "{}");
}

function validUrl(value) {
  return assertPublicHttpUrl(String(value || "")).toString();
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") return sendJson(res, 200, { ok: true });
    if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
    const body = await readJson(req);
    if (req.url === "/audit") {
      const url = validUrl(body.url);
      const homepage = body.browser_html
        ? createHomepageFromHtml(body.browser_html, url, { fetchMethod: "browser-run" })
        : null;
      const report = await runRealLiteAudit(url, {
        customQueries: Array.isArray(body.custom_queries) ? body.custom_queries : null,
        reportId: typeof body.report_id === "string" ? body.report_id : undefined,
        // What the user typed, when the Worker's entry probe sent a different URL to measure.
        requestedUrl: typeof body.requested_url === "string" ? validUrl(body.requested_url) : undefined,
        ...(homepage ? { homepage } : {})
      });
      return sendJson(res, 200, { report, crawl_path: homepage ? "browser_run" : "container_fallback" });
    }
    if (req.url === "/render") {
      if (!body.report || typeof body.report !== "object") return sendJson(res, 400, { error: "report_required" });
      const html = reportHtml(normalizeReportForClient(body.report));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (req.url === "/render-markdown") {
      if (!body.report || typeof body.report !== "object") return sendJson(res, 400, { error: "report_required" });
      res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(reportMarkdown(normalizeReportForClient(body.report)));
    }
    return sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    // The Worker stores this body with the failed job (failure.mjs), so the message and stage
    // travel with the code instead of ending as a bare `audit_failed` in D1.
    const code = String(error?.code || error?.stage || "audit_failed").slice(0, 120);
    const message = String(error?.message || "").slice(0, 240);
    const stage = error?.stage ? String(error.stage).slice(0, 120) : null;
    console.error(JSON.stringify({ event: "audit_container_error", code, stage, message }));
    return sendJson(res, error?.code === "request_too_large" ? 413 : 502, { error: code, message, stage });
  }
});

server.listen(PORT, () => console.log(`audit fallback container listening on ${PORT}`));
