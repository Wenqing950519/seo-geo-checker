const assert = require("node:assert/strict");
const {
  createDeveloperPlatformService
} = require("../services/api/application/developer-platform-service.js");
const {
  createSqliteDeveloperPlatformStore
} = require("../services/api/storage/developer-platform-store.js");
const {
  createFixtureProviders
} = require("../services/api/application/developer-api-prototype.js");

async function waitForTerminal(service, tenantId, jobId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = await service.getJob({ tenantId, jobId });
    if (job && ["succeeded", "failed"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("durable fixture job did not reach terminal state");
}

async function provisionTenant(service, email, plan = "free") {
  const invitation = await service.createInvitation({ email });
  assert.match(invitation.verification_token, /^gci_/);
  const verified = await service.verifyEmail({ token: invitation.verification_token });
  assert.match(verified.session_token, /^gcs_/);
  const activation = await service.activateConsole({ sessionToken: verified.session_token, plan });
  const createdKey = await service.createApiKey({
    sessionToken: verified.session_token,
    name: "primary"
  });
  assert.match(createdKey.api_key, /^gck_/);
  return { ...verified, ...activation, ...createdKey };
}

async function main() {
  const store = createSqliteDeveloperPlatformStore({ filename: ":memory:" });
  const service = createDeveloperPlatformService({
    store,
    providers: createFixtureProviders(),
    tokenPepper: "test-only-platform-token-pepper-32-bytes-minimum",
    quotaWindowStrategy: "rolling_24h",
    resultRetentionDays: 30,
    trialDays: 7,
    freeRoundsPerWindow: 3,
    schedule: (task) => setImmediate(task)
  });

  await assert.rejects(
    service.createApiKey({ sessionToken: "gcs_invalid", name: "bad" }),
    (error) => error.code === "auth_required"
  );

  const alpha = await provisionTenant(service, "Owner@Example.com");
  assert.equal(alpha.plan, "free");
  assert.equal(alpha.remaining_rounds, 3);

  const listedKeys = await service.listApiKeys({ sessionToken: alpha.session_token });
  assert.equal(listedKeys.length, 1);
  assert.equal(Object.hasOwn(listedKeys[0], "api_key"), false, "stored key listing must never reveal the secret");
  assert.equal(Object.hasOwn(listedKeys[0], "key_hash"), false, "stored key listing must never reveal hashes");

  const auth = await service.authenticateApiKey(alpha.api_key);
  assert.equal(auth.tenantId, alpha.tenant_id);
  assert.deepEqual(auth.scopes, ["measurements:read", "measurements:write", "usage:read"]);

  const beta = await provisionTenant(service, "beta@example.com");
  const created = await service.createMeasurement({
    tenantId: alpha.tenant_id,
    idempotencyKey: "platform-request-one",
    body: {
      input: { type: "prompt", text: "台北有哪些公開的成人英文學習資源？" },
      target: { name: "Example", url: "https://example.com/" },
      locale: "zh-TW"
    }
  });
  assert.equal(created.created, true);
  const terminal = await waitForTerminal(service, alpha.tenant_id, created.job.job_id);
  assert.equal(terminal.status, "succeeded");
  const result = await service.getMeasurement({
    tenantId: alpha.tenant_id,
    measurementId: created.job.measurement_id
  });
  assert.equal(result.status, "succeeded");
  assert.equal(result.quota.charged_rounds, 1);
  assert.equal(await service.getMeasurement({
    tenantId: beta.tenant_id,
    measurementId: created.job.measurement_id
  }), null, "cross-tenant result reads must look missing");

  const replay = await service.createMeasurement({
    tenantId: alpha.tenant_id,
    idempotencyKey: "platform-request-one",
    body: {
      input: { type: "prompt", text: "台北有哪些公開的成人英文學習資源？" },
      target: { name: "Example", url: "https://example.com/" },
      locale: "zh-TW"
    }
  });
  assert.equal(replay.created, false);
  assert.equal(replay.job.job_id, created.job.job_id);
  await assert.rejects(
    service.createMeasurement({
      tenantId: alpha.tenant_id,
      idempotencyKey: "platform-request-one",
      body: { input: { type: "prompt", text: "different body" } }
    }),
    (error) => error.code === "idempotency_conflict"
  );

  const simultaneous = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
    service.createMeasurement({
      tenantId: alpha.tenant_id,
      idempotencyKey: `quota-race-${index}`,
      body: { input: { type: "prompt", text: `配額競態測試 ${index}` } }
    })
  ));
  const accepted = simultaneous.filter((item) => item.status === "fulfilled");
  const rejected = simultaneous.filter((item) => item.status === "rejected");
  assert.equal(accepted.length, 2, "one used round plus two reservations must exhaust a 3-round window");
  assert.equal(rejected.length, 18);
  assert(rejected.every((item) => item.reason.code === "quota_exhausted"));
  await Promise.all(accepted.map((item) => waitForTerminal(service, alpha.tenant_id, item.value.job.job_id)));
  const usage = await service.getUsage({ tenantId: alpha.tenant_id });
  assert.deepEqual(
    {
      used_rounds: usage.used_rounds,
      reserved_rounds: usage.reserved_rounds,
      remaining_rounds: usage.remaining_rounds,
      quota_limit: usage.quota_limit
    },
    { used_rounds: 3, reserved_rounds: 0, remaining_rounds: 0, quota_limit: 3 }
  );

  await service.revokeApiKey({ sessionToken: alpha.session_token, keyId: alpha.key_id });
  assert.equal(await service.authenticateApiKey(alpha.api_key), null, "revoked keys must fail immediately");

  const genericLogin = await service.requestLoginLink({ email: "owner@example.com" });
  const missingLogin = await service.requestLoginLink({ email: "nobody@example.com" });
  assert.deepEqual(genericLogin, missingLogin, "login link requests must not disclose account existence");
  const outbox = await service.listAuthOutbox();
  assert.equal(outbox.length, 1, "only an existing verified account gets a login token");
  assert.match(outbox[0].login_token, /^gcl_/);
  const loggedIn = await service.consumeLoginLink({ token: outbox[0].login_token });
  assert.match(loggedIn.session_token, /^gcs_/);

  await service.setAdmission({ enabled: false, reason: "security drill" });
  await assert.rejects(
    service.createMeasurement({
      tenantId: beta.tenant_id,
      idempotencyKey: "paused-request",
      body: { input: { type: "prompt", text: "should be paused" } }
    }),
    (error) => error.code === "service_unavailable"
  );
  await service.setAdmission({ enabled: true, reason: "drill complete" });

  const overview = await service.getAdminOverview();
  assert.equal(overview.accounts.total, 2);
  assert.equal(overview.api_keys.active, 1);
  assert.equal(overview.jobs.succeeded, 3);
  assert.equal(Object.hasOwn(overview, "emails"), false);

  const events = await service.listSecurityEvents({ limit: 100 });
  assert(events.some((event) => event.event_type === "api_key_revoked"));
  assert(events.some((event) => event.event_type === "admission_changed"));
  assert(events.every((event) => !JSON.stringify(event).includes("owner@example.com")));

  store.close();
  console.log("developer platform foundation tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
