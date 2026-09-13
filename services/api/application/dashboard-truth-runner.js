// Product A Brand Truth asynchronous runner. It is deliberately thin: the
// Developer Platform owns provider retries, cost reservations and terminal
// measurement state; this runner only translates that trusted result into the
// Truth claim contract.

const ENGINE_ALIASES = Object.freeze({
  "openai-web": "openai", "google-web": "gemini",
  "perplexity-sonar": "perplexity", "anthropic-web": "anthropic"
});

function createDashboardTruthRunner(options = {}) {
  const store = options.store;
  const truthApi = options.truthApi;
  const client = options.client;
  const now = options.now || (() => new Date());
  const maxChecks = Math.max(1, Math.min(10, Number(options.maxChecks) || 5));
  const pollIntervalMs = Math.max(25, Math.min(5_000, Number(options.pollIntervalMs) || 250));
  const maxPolls = Math.max(1, Math.min(120, Number(options.maxPolls) || 40));
  if (!store || !truthApi || !client) throw new TypeError("Brand Truth runner requires a store, Truth service and internal client");

  async function tick({ enabled = true } = {}) {
    if (!enabled || typeof store.listQueuedTruthChecks !== "function") return { claimed: 0, completed: 0, failed: 0 };
    const queued = await store.listQueuedTruthChecks(maxChecks);
    let claimed = 0;
    let completed = 0;
    let failed = 0;
    for (const queuedCheck of queued) {
      const check = await store.claimTruthCheck({ checkId: queuedCheck.checkId, now: now().toISOString() });
      if (!check) continue;
      claimed += 1;
      try {
        const baseline = typeof store.getTruthBaselineById === "function"
          ? await store.getTruthBaselineById(check.baselineId) : await store.getTruthBaseline(check.projectId, "primary");
        const project = await store.getProject(check.projectId);
        const prompt = buildPrompt(project, baseline);
        const submitted = await client.submitMeasurement({
          idempotencyKey: `truth-check:${check.checkId}`,
          prompt, locale: "zh-TW", engineIds: check.engineIds,
          target: { name: project?.name || null, url: project?.siteUrl || null }
        });
        const measurementId = submitted?.job?.measurement_id || submitted?.measurement_id;
        if (!measurementId) throw Object.assign(new Error("Internal measurement did not return an id"), { code: "measurement_id_missing" });
        const measurement = await pollMeasurement(measurementId);
        const results = measurementResults(measurement, check.engineIds, baseline);
        await truthApi.recordTruthCheck({ checkId: check.checkId, results });
        completed += 1;
      } catch (error) {
        failed += 1;
        await store.finishTruthCheck({ checkId: check.checkId, status: "failed", errorCode: safeCode(error?.code, "truth_runner_failed"), now: now().toISOString() });
      }
    }
    return { claimed, completed, failed };
  }

  async function pollMeasurement(measurementId) {
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      const result = await client.getMeasurement(measurementId);
      if (result && ["succeeded", "failed"].includes(result.status)) return result;
      await delay(pollIntervalMs);
    }
    throw Object.assign(new Error("Internal measurement polling timed out"), { code: "measurement_poll_timeout" });
  }

  return { tick };
}

function buildPrompt(project, baseline) {
  const fields = baseline?.fields || {};
  return [
    "請查核以下餐飲分店的公開品牌事實，只回傳你能在公開來源中找到的內容；不要猜測。",
    `店家：${project?.name || "未知"}`,
    `官網：${project?.siteUrl || "未知"}`,
    `已確認基線：${JSON.stringify(fields)}`,
    "請針對 address、phone、hours 分別說明找到的原句與來源；找不到時明確標示 unknown。"
  ].join("\n");
}

function measurementResults(measurement, selected, baseline) {
  const engines = Array.isArray(measurement?.engines) ? measurement.engines : [];
  const byEngine = new Map(engines.map((engine) => [ENGINE_ALIASES[engine.profile_id] || engine.profile_id, engine]));
  return selected.map((engineId) => {
    const engine = byEngine.get(engineId);
    if (!engine) return { engine: engineId, status: "failed", failure_code: measurement?.error?.code || "engine_result_missing", claims: [] };
    const status = engine.status === "succeeded" ? "measured" : engine.status === "failed" ? "failed" : "unknown";
    const rawAnswer = engine.answer || engine.raw_answer || null;
    return {
      engine: engineId, model: engine.model || engine.profile_id || null,
      observation_id: engine.observation_id || engine.observationId || null,
      status, raw_answer: rawAnswer, claims: status === "measured" ? extractClaims(rawAnswer, baseline) : [],
      failure_code: engine.error?.code || null
    };
  });
}

function extractClaims(answer, baseline) {
  const text = String(answer || "");
  if (!text) return [];
  const claims = [];
  const fields = baseline?.fields || {};
  for (const field of ["address", "phone", "hours"]) {
    const baselineValue = fields[field]?.value;
    if (baselineValue && text.includes(String(baselineValue))) {
      claims.push({ field, value: String(baselineValue), text: String(baselineValue), entity_match: "same" });
      continue;
    }
    const pattern = field === "phone"
      ? /(?:電話|tel(?:ephone)?)[：:\s]*([+\d][\d\s().-]{6,24}\d)/i
      : field === "address"
        ? /((?:台|臺)灣[^。；;\n]{2,100}(?:號|巷|弄|路|街|區))/
        : /((?:週|星期)[一二三四五六日天][^。；;\n]{0,24}\d{1,2}:\d{2}\s*[-~至]\s*\d{1,2}:\d{2})/;
    const match = text.match(pattern);
    if (match) claims.push({ field, value: match[1].trim(), text: match[0].trim(), entity_match: "same" });
  }
  return claims;
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safeCode(value, fallback) { return /^[a-z0-9_]{1,80}$/i.test(String(value || "")) ? String(value) : fallback; }

module.exports = { createDashboardTruthRunner, buildPrompt, measurementResults };
