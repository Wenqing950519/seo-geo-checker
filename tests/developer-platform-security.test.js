const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createDeveloperPlatformService } = require("../services/api/application/developer-platform-service.js");
const { createFixtureProviders } = require("../services/api/application/developer-api-prototype.js");
const { createSqliteDeveloperPlatformStore } = require("../services/api/storage/developer-platform-store.js");

async function terminal(service, tenantId, jobId) {
  for (let i = 0; i < 100; i += 1) {
    const job = await service.getJob({ tenantId, jobId });
    if (["succeeded", "failed"].includes(job?.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("job did not complete");
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "geocheck-security-"));
  const filename = path.join(directory, "platform.db");
  const store = createSqliteDeveloperPlatformStore({ filename });
  const service = createDeveloperPlatformService({
    store,
    providers: createFixtureProviders({ failProfileId: "perplexity-sonar" }),
    tokenPepper: "security-test-pepper-with-at-least-32-bytes",
    quotaWindowStrategy: "utc_day",
    resultRetentionDays: 14,
    schedule: (task) => setImmediate(task)
  });
  const invitation = await service.createInvitation({ email: "security@example.com" });
  const verified = await service.verifyEmail({ token: invitation.verification_token });
  await assert.rejects(
    service.verifyEmail({ token: invitation.verification_token }),
    (error) => error.code === "invalid_or_expired_token"
  );
  await service.activateConsole({ sessionToken: verified.session_token, plan: "free" });
  const key = await service.createApiKey({ sessionToken: verified.session_token, name: "security" });
  const created = await service.createMeasurement({
    tenantId: verified.tenant_id,
    idempotencyKey: "failed-provider-does-not-charge",
    body: { input: { type: "prompt", text: "公開資料安全測試" } }
  });
  const job = await terminal(service, verified.tenant_id, created.job.job_id);
  assert.equal(job.status, "failed");
  const usage = await service.getUsage({ tenantId: verified.tenant_id });
  assert.equal(usage.used_rounds, 0);
  assert.equal(usage.reserved_rounds, 0);
  const result = await service.getMeasurement({ tenantId: verified.tenant_id, measurementId: created.job.measurement_id });
  assert.equal(result.partial_results.length, 3);

  await store.recordSecurityEvent({
    eventId: "sec_redaction", tenantId: verified.tenant_id, eventType: "redaction_test",
    severity: "warning", metadata: {
      token: invitation.verification_token, email: "security@example.com", prompt: "secret prompt",
      safe_count: 1
    }, now: new Date().toISOString()
  });
  const event = (await store.listSecurityEvents({ limit: 10 })).find((item) => item.event_type === "redaction_test");
  assert.deepEqual(event.metadata, { safe_count: 1 });

  store.close();
  const db = new DatabaseSync(filename, { readOnly: true });
  const hashes = db.prepare("SELECT token_hash FROM developer_auth_tokens").all();
  const keyRows = db.prepare("SELECT key_prefix, key_hash FROM developer_api_keys").all();
  db.close();
  assert(hashes.every((row) => /^[a-f0-9]{64}$/.test(row.token_hash)));
  assert(keyRows.every((row) => /^[a-f0-9]{64}$/.test(row.key_hash)));
  const raw = fs.readFileSync(filename).toString("latin1");
  assert.equal(raw.includes(invitation.verification_token), false, "raw invitation token must not be stored");
  assert.equal(raw.includes(key.api_key), false, "raw API key must not be stored");
  assert.equal(raw.includes("secret prompt"), false, "security logs must not retain prompt content");

  const budgetStore = createSqliteDeveloperPlatformStore({ filename: ":memory:" });
  const officialProviders = createFixtureProviders().map((adapter) => ({ ...adapter, mode: "official" }));
  assert.throws(() => createDeveloperPlatformService({
    store: budgetStore, providers: officialProviders,
    tokenPepper: "security-test-pepper-with-at-least-32-bytes",
    quotaWindowStrategy: "utc_day", resultRetentionDays: 14
  }), /explicit daily, monthly, per-job/);
  const budgetService = createDeveloperPlatformService({
    store: budgetStore, providers: officialProviders,
    tokenPepper: "security-test-pepper-with-at-least-32-bytes",
    quotaWindowStrategy: "utc_day", resultRetentionDays: 14,
    dailyBudgetTwd: 10, monthlyBudgetTwd: 100, maxJobCostTwd: 6, twdPerUsd: 32,
    schedule: () => {}
  });
  const budgetInvite = await budgetService.createInvitation({ email: "budget@example.com" });
  const budgetOwner = await budgetService.verifyEmail({ token: budgetInvite.verification_token });
  await budgetService.activateConsole({ sessionToken: budgetOwner.session_token, plan: "free" });
  const budgetJob = await budgetService.createMeasurement({
    tenantId: budgetOwner.tenant_id, idempotencyKey: "budget-one",
    body: { input: { type: "prompt", text: "budget one" } }
  });
  await budgetService.runJob(budgetJob.job.job_id);
  await assert.rejects(budgetService.createMeasurement({
    tenantId: budgetOwner.tenant_id, idempotencyKey: "budget-two",
    body: { input: { type: "prompt", text: "budget two" } }
  }), (error) => error.code === "service_unavailable");
  const budgetOverview = await budgetService.getAdminOverview();
  assert.equal(budgetOverview.provider_cost.settled_twd, 6);
  assert.equal(budgetOverview.provider_cost.unknown_events, 1);
  assert.equal(budgetOverview.budget_windows.length, 2);
  budgetStore.close();
  console.log("developer platform security tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
