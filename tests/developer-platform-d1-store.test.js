const assert = require("node:assert/strict");
const { createD1DeveloperPlatformStore } = require("../services/api/storage/developer-platform-d1-store.js");

function response(result, overrides = {}) {
  return {
    ok: overrides.ok ?? true,
    async text() { return overrides.text ?? JSON.stringify({ success: true, result }); }
  };
}

async function main() {
  assert.throws(() => createD1DeveloperPlatformStore({
    config: { accountId: "acct", databaseId: "db" }
  }), /incomplete/);
  assert.throws(() => createD1DeveloperPlatformStore({
    config: { gatewayUrl: "https://gateway.example" }
  }), /incomplete/);
  assert.throws(() => createD1DeveloperPlatformStore({
    config: {
      accountId: "acct", databaseId: "same", apiToken: "secret",
      CLOUDFLARE_D1_DATABASE_ID: "same"
    }
  }), /must not use product A/);

  const calls = [];
  const fetchStub = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    if (String(body.sql || "").startsWith("SELECT control_value")) {
      return response([{ success: true, results: [{
        control_value: "false", reason: "maintenance", updated_at: "2026-09-09T00:00:00.000Z"
      }], meta: { changes: 0 } }]);
    }
    return response([{ success: true, results: [], meta: { changes: 1 } }]);
  };
  const store = createD1DeveloperPlatformStore({
    config: { accountId: "account id", databaseId: "developer/db", apiToken: "d1-api-secret" },
    fetch: fetchStub
  });
  const state = await store.setAdmission({
    enabled: false, reason: "maintenance", now: "2026-09-09T00:00:00.000Z"
  });
  assert.equal(state.enabled, false);
  assert.equal(state.reason, "maintenance");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.cloudflare.com/client/v4/accounts/account%20id/d1/database/developer%2Fdb/query");
  assert.equal(calls[0].options.headers.Authorization, "Bearer d1-api-secret");
  assert.doesNotMatch(calls[0].options.body, /d1-api-secret/);
  assert.match(calls[0].body.sql, /ON CONFLICT/);
  assert.deepEqual(calls[0].body.params, ["false", "maintenance", "2026-09-09T00:00:00.000Z"]);
  assert.equal(store.state().kind, "d1-rest");

  const gatewayCalls = [];
  const gatewayStore = createD1DeveloperPlatformStore({
    config: { gatewayUrl: "https://gateway.example/", gatewayToken: "gateway-secret" },
    fetch: async (url, options) => {
      gatewayCalls.push({ url, options, body: JSON.parse(options.body) });
      return response([{ success: true, results: [], meta: { changes: 1 } }]);
    }
  });
  await gatewayStore.setAdmission({ enabled: true, now: "2026-09-09T00:00:00.000Z" });
  assert.equal(gatewayCalls[0].url, "https://gateway.example/v1/query");
  assert.equal(gatewayCalls[0].options.headers.Authorization, "Bearer gateway-secret");
  assert.equal(gatewayStore.state().kind, "d1-gateway");

  const admissionCalls = [];
  const admissionStore = createD1DeveloperPlatformStore({
    config: { accountId: "acct", databaseId: "developer", apiToken: "secret" },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      admissionCalls.push(body);
      if (body.batch) return response(body.batch.map(() => ({ success: true, results: [], meta: { changes: 1 } })));
      if (/WHERE tenant_id = \? AND job_id = \?/.test(body.sql)) {
        return response([{ success: true, results: [{
          job_id: "job_1", measurement_id: "msr_1", tenant_id: "tenant_1",
          status: "queued", created_at: "2026-09-09T00:00:00.000Z",
          request_hash: "hash", request_json: "{}"
        }], meta: { changes: 0 } }]);
      }
      return response([{ success: true, results: [], meta: { changes: 0 } }]);
    }
  });
  const admitted = await admissionStore.admitJob({
    jobId: "job_1", measurementId: "msr_1", reservationId: "quota_1",
    tenantId: "tenant_1", idempotencyKey: "idem_1", requestHash: "hash", request: {},
    windowStart: "2026-09-09T00:00:00.000Z", windowEnd: "2026-09-10T00:00:00.000Z",
    now: "2026-09-09T00:00:00.000Z",
    costBudget: {
      dailyStart: "2026-09-09T00:00:00.000Z", dailyEnd: "2026-09-10T00:00:00.000Z",
      monthlyStart: "2026-09-01T00:00:00.000Z", monthlyEnd: "2026-10-01T00:00:00.000Z",
      dailyLimitMicros: 60_000_000, monthlyLimitMicros: 600_000_000, jobReserveMicros: 12_000_000
    }
  });
  assert.equal(admitted.created, true);
  const admissionBatch = admissionCalls.find((item) => item.batch)?.batch || [];
  assert(admissionBatch.some((item) => item.sql.includes("developer_cost_budget_windows")));
  assert(admissionBatch.some((item) => item.sql.includes("developer_cost_reservations")));
  assert(admissionBatch.every((item) => !item.sql.includes("tenant_1")), "values must remain parameterized");

  const tooLarge = createD1DeveloperPlatformStore({
    config: { accountId: "acct", databaseId: "db", apiToken: "secret" },
    fetch: async () => response([], { text: "x".repeat(2 * 1024 * 1024 + 1) })
  });
  await assert.rejects(() => tooLarge.getAdmission(), /size limit/);
  console.log("developer platform D1 store tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
