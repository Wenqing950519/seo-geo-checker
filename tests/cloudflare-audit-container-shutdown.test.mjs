import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

// The container runs `node container-server.cjs` as PID 1. Linux PID 1 ignores SIGTERM unless the
// process installs a handler, so the Containers library's idle stop() never ended the instance and
// geocheck-audit-api billed ~48 instance-hours a day for 23 days (2026-11-15 billing check).
// The server must exit on SIGTERM. process.emit stands in for the signal so this also runs on Windows.

const child = spawn(process.execPath, ["-e", `
  process.env.PORT = "18992";
  require("./services/cloudflare/audit/container-server.cjs");
  setTimeout(() => process.emit("SIGTERM", "SIGTERM"), 300);
  setTimeout(() => { console.error("still running after SIGTERM"); process.exit(9); }, 5000).unref();
`], { cwd: process.cwd(), env: { ...process.env, GEOCHECK_SERVER_NO_LISTEN: "true" }, stdio: ["ignore", "pipe", "pipe"] });

let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk; });
const code = await new Promise((resolve) => child.once("exit", resolve));
assert.equal(code, 0, `container server must exit cleanly on SIGTERM (exit ${code}): ${stderr}`);

// Second line of defence: if the process still ignores SIGTERM, the Worker's idle handler escalates.
const worker = await readFile("services/cloudflare/audit/src/worker.js", "utf8");
assert.match(worker, /async onActivityExpired\(\)[\s\S]*?this\.destroy\(\)/, "idle container must be force-stopped when SIGTERM is ignored");

console.log("cloudflare audit container shutdown tests passed");
