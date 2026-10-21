import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The 2026-10-21 launch failures (aud_1ea393ed, aud_97573bce) left only `audit_failed` in D1:
// the container and the Worker both dropped the error message. A failed job must now keep the
// actual code, message and stage so the next failure can be read without the Worker logs.
const { containerFailure, describeFailure, failure } = await import("../services/cloudflare/audit/src/failure.mjs");

// A container 502 body carries the container's own error, message and stage.
const fromContainer = containerFailure(502, { error: "crawl_quality", message: "首頁資料不足，無法產生可信分數", stage: "crawl_quality" });
assert.equal(fromContainer.code, "audit_container_http_502");
assert.equal(fromContainer.containerError, "crawl_quality");
assert.equal(fromContainer.stage, "crawl_quality");
assert.match(fromContainer.message, /首頁資料不足/);

// A body that is not JSON, or empty, still yields the HTTP code.
const fromText = containerFailure(503, null);
assert.equal(fromText.code, "audit_container_http_503");
assert.equal(fromText.containerError, null);
assert.equal(fromText.message, "container responded 503");

// describeFailure turns any thrown error into what the queue handler stores.
const described = describeFailure(fromContainer, { attempt: 2 });
assert.deepEqual(Object.keys(described).sort(), ["attempt", "code", "container_error", "message", "stage"]);
assert.equal(described.code, "audit_container_http_502");
assert.equal(described.container_error, "crawl_quality");
assert.equal(described.stage, "crawl_quality");
assert.equal(described.attempt, 2);

// A plain Error without a code keeps the generic code but no longer loses its message.
const plain = describeFailure(new TypeError("fetch failed"), { attempt: 1 });
assert.equal(plain.code, "audit_failed");
assert.equal(plain.message, "fetch failed");
assert.equal(plain.stage, null);
assert.equal(plain.container_error, null);

// Messages are bounded: a provider body cannot flood the diagnostics column.
const long = describeFailure(new Error("x".repeat(2000)), {});
assert.equal(long.message.length, 240);
assert.equal(describeFailure(failure("audit_container_invalid_result", "no report in container payload")).code, "audit_container_invalid_result");
assert.equal(describeFailure(null).code, "audit_failed");
assert.equal(describeFailure(null).message, "");

// The Worker stores the description on every failed attempt, not only the last one, and
// records the browser step before the container runs so a failed job still shows it.
const here = path.dirname(fileURLToPath(import.meta.url));
const workerSource = fs.readFileSync(path.resolve(here, "../services/cloudflare/audit/src/worker.js"), "utf8");
assert.ok(workerSource.includes("describeFailure("), "the queue handler describes the failure");
assert.ok(workerSource.includes("containerFailure("), "a container error keeps the container's body");
assert.match(workerSource, /json_patch\(COALESCE\(diagnostics_json, '\{\}'\), \?\)[\s\S]*status IN \('queued', 'running'\)/,
  "the final failure patches diagnostics_json instead of only setting error_code");
assert.match(workerSource, /browser_run[\s\S]*invokeContainer\(env, AUDIT_CONTAINER/, "browser_run is recorded before the container is invoked");
assert.ok(!workerSource.includes('throw new Error(`audit_container_http_${response.status}`)'), "container HTTP errors are no longer bare Errors");

console.log("cloudflare audit failure tests passed");
