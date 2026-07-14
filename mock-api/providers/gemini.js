const { AppError } = require("../lib/errors");
const { recordAiUsage } = require("../lib/usage-meter");

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";

function getGeminiConfig() {
  return {
    apiKey: requireEnv("GEMINI_API_KEY"),
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    baseUrl: String(process.env.GEMINI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "")
  };
}

async function callGeminiJson(prompt, options = {}) {
  let config;
  try { config = getGeminiConfig(); } catch (error) { throw normalizeGeminiError(error); }
  const started = Date.now();
  const attempts = options.attempts ?? 2;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "你只能輸出有效 JSON，不要輸出 Markdown 或說明文字。" }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.1,
            responseMimeType: "application/json"
          }
        })
      }, options.timeoutMs ?? 35_000);
      const raw = await response.text();
      if (!response.ok) throw new AppError(`Gemini API error: HTTP ${response.status} ${extractApiError(raw)}`, {
        statusCode: response.status >= 500 || response.status === 429 ? 503 : response.status,
        stage: "gemini_api", retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        details: { httpStatus: response.status, attempt }
      });
      const data = parseJson(raw, "Gemini HTTP response was not valid JSON");
      const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
      if (!text) throw new AppError("Gemini response did not include model text", { statusCode: 502, stage: "gemini_api", retryable: true, details: { attempt } });
      const json = extractJson(text);
      if (!json) throw new AppError("Gemini response was not valid JSON", { statusCode: 502, stage: "gemini_json", retryable: true, details: { attempt, rawPreview: text.slice(0, 500) } });
      const usage = normalizeUsage(data?.usageMetadata);
      const latencyMs = Date.now() - started;
      recordAiUsage({ provider: "gemini", model: config.model, operation: options.operation || "structured_audit", status: "success", ...usage, latencyMs });
      return { json, latencyMs, model: config.model, provider: "gemini", attempts: attempt, usage };
    } catch (error) {
      lastError = normalizeGeminiError(error);
      if (!lastError.retryable || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** (attempt - 1), 3000)));
    }
  }
  recordAiUsage({ provider: "gemini", model: config?.model || process.env.GEMINI_MODEL || DEFAULT_MODEL, operation: options.operation || "structured_audit", status: "error", latencyMs: Date.now() - started, errorStage: lastError?.stage });
  throw lastError;
}

async function testGeminiProvider() {
  return callGeminiJson('{"ok":true,"provider":"gemini"}', { temperature: 0, timeoutMs: 20_000, operation: "provider_test" });
}

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`${name} is not configured`);
  return process.env[name];
}

function parseJson(raw, message) {
  try { return JSON.parse(raw); } catch { throw new AppError(message, { statusCode: 502, stage: "gemini_api", retryable: true }); }
}

function normalizeUsage(usage = {}) {
  return { inputTokens: Number(usage.promptTokenCount) || 0, outputTokens: Number(usage.candidatesTokenCount) || 0, totalTokens: Number(usage.totalTokenCount) || 0 };
}

function extractJson(text) {
  const source = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(source); } catch { return null; }
}

function extractApiError(raw) {
  try { const data = JSON.parse(raw); return data.error?.message || raw; } catch { return String(raw).slice(0, 500); }
}

function normalizeGeminiError(error) {
  if (error instanceof AppError) return error;
  if (error.name === "AbortError") return new AppError("Gemini API request timed out", { statusCode: 504, stage: "gemini_api", retryable: true });
  if (/GEMINI_API_KEY/.test(error.message || "")) return new AppError(error.message, { statusCode: 500, stage: "config", retryable: false });
  return new AppError(error.message || "Gemini API request failed", { statusCode: 502, stage: "gemini_api", retryable: true });
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

module.exports = { callGeminiJson, getGeminiConfig, testGeminiProvider };
