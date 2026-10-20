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
  assert.equal((await invalid.json()).error, "ERR_INVALID_URL");

  // The Worker's download link renders Markdown in the container (PR #6 finding 2).
  const markdown = await fetch(`http://127.0.0.1:${port}/render-markdown`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report: { id: "real_lite_md", method: "mcac", url: "https://www.example-noodle.tw/", finalUrl: "https://www.example-noodle.tw/", requestedUrl: "https://example-noodle.tw/", createdAt: "2026-10-20T00:00:00Z", mcac: { probes: [] } } })
  });
  assert.equal(markdown.status, 200);
  assert.match(markdown.headers.get("content-type"), /text\/markdown/);
  const markdownText = await markdown.text();
  assert.match(markdownText, /AI 能見度檢測單/);
  // The Worker measured the www entry for a typed apex (noodle3.com.tw, 2026-10-21): both show.
  assert.match(markdownText, /受檢網站：example-noodle\.tw/);
  assert.match(markdownText, /實際入口 https:\/\/www\.example-noodle\.tw\/（輸入 https:\/\/example-noodle\.tw\/）/);

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
