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
