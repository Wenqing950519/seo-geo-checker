import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 18991;
const child = spawn(process.execPath, ["services/cloudflare/audit/container-server.cjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), GEOCHECK_SERVER_NO_LISTEN: "true" },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForReady(child);
  const invalid = await fetch(`http://127.0.0.1:${port}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report: { id: "invalid-render-fixture" } })
  });
  assert.equal(invalid.status, 502);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.error, "ERR_INVALID_URL");
  // The 2026-10-21 launch failures left only `audit_failed` behind: the container must say
  // what went wrong, so the Worker can store it with the job.
  assert.match(invalidBody.message, /Invalid URL/);
  assert.equal(invalidBody.stage, null);

  // An audit whose browser HTML is too thin fails while building the homepage, before any
  // network or provider call. The container names that stage instead of a bare `audit_failed`.
  const thin = await fetch(`http://127.0.0.1:${port}/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example-thin.tw/", report_id: "real_lite_thin", browser_html: "<html><body>hi</body></html>" })
  });
  assert.equal(thin.status, 502);
  const thinBody = await thin.json();
  assert.equal(thinBody.error, "fetch_homepage");
  assert.equal(thinBody.stage, "fetch_homepage");
  assert.match(thinBody.message, /empty or too short/);

  // The Worker's download link renders Markdown in the container (PR #6 finding 2).
  const markdown = await fetch(`http://127.0.0.1:${port}/render-markdown`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report: { id: "real_lite_md", method: "mcac", url: "https://example-noodle.tw/", finalUrl: "https://example-noodle.tw/", createdAt: "2026-10-20T00:00:00Z", mcac: { probes: [] } } })
  });
  assert.equal(markdown.status, 200);
  assert.match(markdown.headers.get("content-type"), /text\/markdown/);
  assert.match(await markdown.text(), /AI 能見度檢測單/);

  const health = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  console.log("cloudflare audit container tests passed");
} finally {
  child.kill();
}

async function waitForReady(process) {
  let stderr = "";
  process.stderr.on("data", (chunk) => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`container server did not start: ${stderr}`)), 10_000);
    process.stdout.on("data", (chunk) => {
      if (String(chunk).includes("audit fallback container listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    process.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`container server exited with ${code}: ${stderr}`));
    });
  });
}
