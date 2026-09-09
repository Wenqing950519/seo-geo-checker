const assert = require("node:assert/strict");
const {
  createDeveloperApiPrototype,
  createFixtureProviders
} = require("../services/api/application/developer-api-prototype.js");
const { createInMemoryMeasurementResultStore } = require("../services/api/storage/developer-measurement-result-store.js");

async function waitForTerminal(api, tenantId, jobId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const job = api.getJob({ tenantId, jobId });
    if (["succeeded", "failed"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("Fixture job did not reach a terminal state");
}

async function main() {
  const tenantId = "tenant_fixture";
  const api = createDeveloperApiPrototype({
    providers: createFixtureProviders(),
    resultStore: createInMemoryMeasurementResultStore(),
    quotaLimit: 3
  });

  const first = await api.createMeasurement({
    tenantId,
    idempotencyKey: "same-request",
    body: {
      input: { type: "prompt", text: "台北有哪些適合成人的英文家教平台？" },
      target: { name: "Example", url: "https://example.com/" },
      locale: "zh-TW"
    }
  });
  assert.equal(first.created, true);
  assert.equal(first.job.status, "queued");
  const succeeded = await waitForTerminal(api, tenantId, first.job.job_id);
  assert.equal(succeeded.status, "succeeded");

  const result = await api.getMeasurement({ tenantId, measurementId: first.job.measurement_id });
  assert.equal(result.status, "succeeded");
  assert.equal(result.effective_prompt, "台北有哪些適合成人的英文家教平台？");
  assert.equal(result.question_source, "user");
  assert.equal(result.engines.length, 4);
  assert.deepEqual(result.engines.map((engine) => engine.profile_id), [
    "openai-web", "google-web", "perplexity-sonar", "anthropic-web"
  ]);
  assert.equal(result.quota.charged_rounds, 1);
  assert.equal(api.getUsage({ tenantId }).used_rounds, 1);

  const duplicate = await api.createMeasurement({
    tenantId,
    idempotencyKey: "same-request",
    body: {
      input: { type: "prompt", text: "台北有哪些適合成人的英文家教平台？" },
      target: { name: "Example", url: "https://example.com/" },
      locale: "zh-TW"
    }
  });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.job.job_id, first.job.job_id);
  assert.equal(api.getUsage({ tenantId }).used_rounds, 1, "idempotent replay must not charge twice");

  await assert.rejects(
    api.createMeasurement({
      tenantId,
      idempotencyKey: "same-request",
      body: { input: { type: "prompt", text: "這是不同內容" } }
    }),
    (error) => error.code === "idempotency_conflict"
  );

  const generated = await api.createMeasurement({
    tenantId,
    idempotencyKey: "url-request",
    body: { input: { type: "url", url: "https://example.com/course" }, locale: "zh-TW" }
  });
  await waitForTerminal(api, tenantId, generated.job.job_id);
  const generatedResult = await api.getMeasurement({ tenantId, measurementId: generated.job.measurement_id });
  assert.equal(generatedResult.question_source, "generated");
  assert.match(generatedResult.effective_prompt, /example\.com/);

  for (const unsafeUrl of [
    "http://127.0.0.1/admin",
    "http://localhost/internal",
    "https://example.com:8443/private"
  ]) {
    await assert.rejects(
      api.createMeasurement({
        tenantId,
        idempotencyKey: `unsafe-${Buffer.from(unsafeUrl).toString("hex")}`,
        body: { input: { type: "url", url: unsafeUrl }, locale: "zh-TW" }
      }),
      (error) => error.code === "invalid_request"
    );
  }

  const failedApi = createDeveloperApiPrototype({
    providers: createFixtureProviders({ failProfileId: "perplexity-sonar" }),
    resultStore: createInMemoryMeasurementResultStore(),
    quotaLimit: 3
  });
  const failed = await failedApi.createMeasurement({
    tenantId,
    idempotencyKey: "failed-request",
    body: { input: { type: "prompt", text: "測試失敗處理" } }
  });
  await waitForTerminal(failedApi, tenantId, failed.job.job_id);
  const failedResult = await failedApi.getMeasurement({ tenantId, measurementId: failed.job.measurement_id });
  assert.equal(failedResult.status, "failed");
  assert.equal(failedResult.quota.charged_rounds, 0);
  assert.equal(failedResult.comparison, null);
  assert.equal(failedResult.partial_results.length, 3);
  assert.equal(failedApi.getUsage({ tenantId }).used_rounds, 0);

  const officialProviders = createFixtureProviders().map((provider) => ({ ...provider, mode: "official" }));
  const officialApi = createDeveloperApiPrototype({
    providers: officialProviders,
    resultStore: createInMemoryMeasurementResultStore()
  });
  const official = await officialApi.createMeasurement({
    tenantId,
    idempotencyKey: "official-mode-result",
    body: {
      input: { type: "prompt", text: "測試 official 結果標記" },
      target: { name: "Example", url: "https://example.com/" }
    }
  });
  await waitForTerminal(officialApi, tenantId, official.job.job_id);
  const officialResult = await officialApi.getMeasurement({ tenantId, measurementId: official.job.measurement_id });
  assert.doesNotMatch(officialResult.analysis.limitations.join(" "), /fixture/);

  assert.throws(
    () => createDeveloperApiPrototype({
      providers: officialProviders.map((provider, index) => index === 0 ? { ...provider, mode: "fixture" } : provider)
    }),
    /same explicit mode/
  );

  const paidButInvalidProviders = officialProviders.map((provider) => provider.id === "perplexity-sonar"
    ? {
        ...provider,
        async execute() {
          return {
            answer: "",
            citations: [],
            searchEvidence: { mode: "perplexity_native_search", executed: true },
            usage: { total_tokens: 92, provider_reported_cost_usd: 0.00509 },
            cost: { status: "provider_reported", provider_reported_usd: 0.00509 },
            nativeEvidence: { response_id: "paid-invalid-response" }
          };
        }
      }
    : provider);
  const paidButInvalidApi = createDeveloperApiPrototype({
    providers: paidButInvalidProviders,
    resultStore: createInMemoryMeasurementResultStore()
  });
  const paidButInvalid = await paidButInvalidApi.createMeasurement({
    tenantId,
    idempotencyKey: "paid-but-invalid",
    body: { input: { type: "prompt", text: "測試失敗成本保留" } }
  });
  await waitForTerminal(paidButInvalidApi, tenantId, paidButInvalid.job.job_id);
  const paidButInvalidResult = await paidButInvalidApi.getMeasurement({ tenantId, measurementId: paidButInvalid.job.measurement_id });
  const invalidEngine = paidButInvalidResult.engines.find((engine) => engine.profile_id === "perplexity-sonar");
  assert.equal(invalidEngine.status, "failed");
  assert.equal(invalidEngine.usage.total_tokens, 92);
  assert.equal(invalidEngine.cost.provider_reported_usd, 0.00509);
  assert.equal(paidButInvalidResult.provider_cost.minimum_usd, 0.00509);

  console.log("developer API prototype application tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
