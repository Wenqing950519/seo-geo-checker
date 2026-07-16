const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..", "..");
const ledger = path.resolve(__dirname, "..", "usage-events.jsonl");

(async () => {
  const port = await availablePort();
  const ledgerBefore = fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8") : "";
  const child = spawn(process.execPath, ["mock-api/server.js"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitUntilReady(child, port);
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, service: "geocheck" });
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    assert.equal(response.headers.get("cdn-cache-control"), "no-store");
    assert.equal(response.headers.get("surrogate-control"), "no-store");
    const ledgerAfter = fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8") : "";
    assert.equal(ledgerAfter, ledgerBefore, "healthz must not record AI usage");
    console.log("healthz tests passed");
  } finally {
    child.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitUntilReady(child, port) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("healthz test server did not start")), 10_000);
    const onExit = (code) => {
      clearTimeout(timer);
      reject(new Error(`healthz test server exited with code ${code}`));
    };
    child.once("exit", onExit);
    child.stdout.on("data", (chunk) => {
      if (!String(chunk).includes(`http://localhost:${port}`)) return;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve();
    });
  });
}
