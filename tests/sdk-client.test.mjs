import assert from "node:assert/strict";
import { GeoCheckClient } from "../packages/sdk/dist/index.js";

let calls = 0;
const client = new GeoCheckClient({
  apiKey: "gck_test",
  baseUrl: "https://api.test",
  fetch: async (_url, init) => {
    calls += 1;
    if (init.method === "POST") {
      assert.equal(new Headers(init.headers).get("Idempotency-Key"), "idem_1");
      return Response.json({
        job_id: "job_1", measurement_id: "msr_1", status: "queued",
        created_at: "2026-09-09T00:00:00.000Z", completed_at: null, content_deleted_at: null, error_code: null
      }, { status: 202 });
    }
    if (calls === 2) return Response.json({ error: { code: "result_not_ready", message: "not ready" } }, { status: 409, headers: { "Retry-After": "0" } });
    return Response.json({ measurement_id: "msr_1", status: "succeeded", engines: [] });
  }
});

const accepted = await client.createMeasurement({ input: { type: "prompt", text: "test" } }, "idem_1");
const result = await client.pollMeasurement(accepted.measurement_id, { intervalMs: 0, timeoutMs: 1_000 });
assert.equal(result.status, "succeeded");
assert.equal(calls, 3, "the SDK sends one POST and only polls with GET");
console.log("SDK client contract tests passed");
