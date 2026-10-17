const { AppError } = require("../shared/errors.js");
const { recordAiUsage } = require("./usage-meter.js");

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

function getDeepSeekConfig() {
  return {
    apiKey: requireEnv("DEEPSEEK_API_KEY"),
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    modelRelease: process.env.DEEPSEEK_MODEL_RELEASE || "unrecorded",
    baseUrl: String(process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    thinkingEnabled: String(process.env.DEEPSEEK_THINKING || "disabled").toLowerCase() === "enabled"
  };
}

async function callDeepSeekJson(prompt, options = {}) {
  let config;
  try { config = getDeepSeekConfig(); } catch (error) { throw normalizeDeepSeekError(error); }
  const started = Date.now();
  const attempts = options.attempts ?? 2;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const payload = {
        model: config.model,
        messages: [
          { role: "system", content: "You must output valid JSON only. Do not output Markdown or explanatory text." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: options.maxTokens ?? 4096,
        thinking: { type: config.thinkingEnabled ? "enabled" : "disabled" }
      };
      // DeepSeek ignores temperature in thinking mode; keep deterministic sampling for research batches.
      if (!config.thinkingEnabled) payload.temperature = options.temperature ?? 0;

      const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, options.timeoutMs ?? 35_000);
      const raw = await response.text();
      if (!response.ok) throw new AppError(`DeepSeek API error: HTTP ${response.status} ${extractApiError(raw)}`, {
        statusCode: response.status >= 500 || response.status === 429 ? 503 : response.status,
        stage: "deepseek_api", retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        details: { httpStatus: response.status, attempt }
      });
      const data = parseJson(raw, "DeepSeek HTTP response was not valid JSON");
      const text = String(data?.choices?.[0]?.message?.content || "").trim();
      if (!text) throw new AppError("DeepSeek response did not include model text", { statusCode: 502, stage: "deepseek_api", retryable: true, details: { attempt } });
      const json = extractJson(text);
      if (!json) throw new AppError("DeepSeek response was not valid JSON", { statusCode: 502, stage: "deepseek_json", retryable: true, details: { attempt, rawPreview: text.slice(0, 500) } });
      const usage = normalizeUsage(data?.usage);
      const latencyMs = Date.now() - started;
      recordAiUsage({ provider: "deepseek", model: data?.model || config.model, operation: options.operation || "structured_audit", status: "success", ...usage, latencyMs });
      return { json, latencyMs, model: data?.model || config.model, modelRelease: config.modelRelease, provider: "deepseek", attempts: attempt, usage };
    } catch (error) {
      lastError = normalizeDeepSeekError(error);
      if (!lastError.retryable || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** (attempt - 1), 3000)));
    }
  }
  recordAiUsage({ provider: "deepseek", model: config?.model || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL, operation: options.operation || "structured_audit", status: "error", latencyMs: Date.now() - started, errorStage: lastError?.stage });
  throw lastError;
}

async function testDeepSeekProvider() {
  return callDeepSeekJson('{"ok":true,"provider":"deepseek","message":"deepseek api works"}', { temperature: 0, timeoutMs: 20_000, operation: "provider_test" });
}

function requireEnv(name) { if (!process.env[name]) throw new Error(`${name} is not configured`); return process.env[name]; }
function parseJson(raw, message) { try { return JSON.parse(raw); } catch { throw new AppError(message, { statusCode: 502, stage: "deepseek_api", retryable: true }); } }
function normalizeUsage(usage = {}) { return { inputTokens: Number(usage.prompt_tokens || usage.input_tokens) || 0, outputTokens: Number(usage.completion_tokens || usage.output_tokens) || 0, totalTokens: Number(usage.total_tokens) || 0 }; }
function extractJson(text) { try { return JSON.parse(String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()); } catch { return null; } }
function extractApiError(raw) { try { const data = JSON.parse(raw); return data.error?.message || data.message || raw; } catch { return String(raw).slice(0, 500); } }
function normalizeDeepSeekError(error) {
  if (error instanceof AppError) return error;
  if (error.name === "AbortError") return new AppError("DeepSeek API request timed out", { statusCode: 504, stage: "deepseek_api", retryable: true });
  if (/DEEPSEEK_API_KEY/.test(error.message || "")) return new AppError(error.message, { statusCode: 500, stage: "config", retryable: false });
  return new AppError(error.message || "DeepSeek API request failed", { statusCode: 502, stage: "deepseek_api", retryable: true });
}
function fetchWithTimeout(url, options, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer)); }

module.exports = { callDeepSeekJson, getDeepSeekConfig, testDeepSeekProvider };
