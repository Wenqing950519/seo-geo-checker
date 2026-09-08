const { AppError } = require("../shared/errors.js");
const { recordAiUsage } = require("./usage-meter.js");

const ORDER = ["deepseek", "openai", "gemini"];

async function callStructuredJson(prompt, options = {}) {
  const chain = options.allowFallback === false ? ["deepseek"] : ORDER;
  const failures = [];
  for (const provider of chain) {
    try {
      const result = await callers[provider](prompt, options);
      return { ...result, fallbackUsed: provider !== "deepseek", failedProviders: failures };
    } catch (error) {
      failures.push({ provider, stage: error.stage || "provider_api" });
      if (options.allowFallback === false) throw error;
    }
  }
  throw new AppError("All structured-analysis providers failed", { statusCode: 503, stage: "structured_provider_fallback", retryable: true, details: { failures } });
}

const callers = { deepseek, openai, gemini };

async function deepseek(prompt, options) {
  const baseUrl = base("DEEPSEEK_BASE_URL", "https://api.deepseek.com");
  const data = await request("deepseek", `${baseUrl}/chat/completions`, {
    Authorization: `Bearer ${required("DEEPSEEK_API_KEY")}`
  }, {
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    messages: [{ role: "system", content: "You must output valid JSON only. Do not output Markdown or explanatory text." }, { role: "user", content: prompt }],
    response_format: { type: "json_object" }, max_tokens: options.maxTokens || 4096,
    thinking: { type: String(process.env.DEEPSEEK_THINKING || "disabled").toLowerCase() === "enabled" ? "enabled" : "disabled" },
    temperature: 0
  }, options);
  return parsed("deepseek", data, data.body?.choices?.[0]?.message?.content, data.body?.usage, data.body?.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash", process.env.DEEPSEEK_MODEL_RELEASE || "unrecorded");
}

async function openai(prompt, options) {
  const data = await request("openai", `${base("OPENAI_BASE_URL", "https://api.openai.com/v1")}/responses`, {
    Authorization: `Bearer ${required("OPENAI_API_KEY")}`
  }, {
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    input: [{ role: "developer", content: "You must output valid JSON only. Do not output Markdown or explanatory text." }, { role: "user", content: prompt }],
    text: { format: { type: "json_object" } }, reasoning: { effort: "none" }, max_output_tokens: options.maxTokens || 4096, store: false
  }, options);
  const text = data.body?.output?.flatMap((item) => item?.content || []).find((item) => item?.type === "output_text")?.text;
  return parsed("openai", data, text, { input_tokens: data.body?.usage?.input_tokens, output_tokens: data.body?.usage?.output_tokens, total_tokens: data.body?.usage?.total_tokens }, data.body?.model || process.env.OPENAI_MODEL || "gpt-5.6-luna", null);
}

async function gemini(prompt, options) {
  const model = encodeURIComponent(process.env.GEMINI_MODEL || "gemini-3.1-flash-lite");
  const data = await request("gemini", `${base("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")}/models/${model}:generateContent?key=${encodeURIComponent(required("GEMINI_API_KEY"))}`, {}, {
    systemInstruction: { parts: [{ text: "You must output valid JSON only. Do not output Markdown or explanatory text." }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: options.maxTokens || 4096, responseMimeType: "application/json" }
  }, options);
  const text = (data.body?.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("");
  const usage = data.body?.usageMetadata || {};
  return parsed("gemini", data, text, { input_tokens: usage.promptTokenCount, output_tokens: usage.candidatesTokenCount, total_tokens: usage.totalTokenCount }, process.env.GEMINI_MODEL || "gemini-3.1-flash-lite", null);
}

async function request(provider, url, headers, body, options) {
  const started = Date.now(); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), options.timeoutMs || 35_000);
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: controller.signal });
    const raw = await response.text(); let parsedBody; try { parsedBody = JSON.parse(raw); } catch { parsedBody = {}; }
    if (!response.ok) throw new AppError(`${provider} API HTTP ${response.status}`, { statusCode: response.status >= 500 || response.status === 429 ? 503 : response.status, stage: `${provider}_api`, retryable: response.status >= 500 || response.status === 429 });
    return { body: parsedBody, latencyMs: Date.now() - started };
  } catch (error) {
    if (error.name === "AbortError") throw new AppError(`${provider} API timed out`, { statusCode: 504, stage: `${provider}_api`, retryable: true });
    throw error;
  } finally { clearTimeout(timer); }
}

function parsed(provider, response, text, usage = {}, model, modelRelease) {
  let json; try { json = JSON.parse(String(text || "").trim().replace(/^\`\`\`json\s*/i, "").replace(/\`\`\`$/i, "")); } catch { throw new AppError(`${provider} did not return valid JSON`, { statusCode: 502, stage: `${provider}_json`, retryable: true }); }
  const normalizedUsage = { inputTokens: Number(usage.prompt_tokens || usage.input_tokens) || 0, outputTokens: Number(usage.completion_tokens || usage.output_tokens) || 0, totalTokens: Number(usage.total_tokens) || 0 };
  recordAiUsage({ provider, model, operation: "structured_analysis", status: "success", ...normalizedUsage, latencyMs: response.latencyMs });
  return { json, provider, model, modelRelease, usage: normalizedUsage, latencyMs: response.latencyMs, attempts: 1 };
}

function required(name) { if (!process.env[name]) throw new AppError(`${name} is not configured`, { statusCode: 500, stage: "config", retryable: false }); return process.env[name]; }
function base(name, fallback) { return String(process.env[name] || fallback).replace(/\/+$/, ""); }

module.exports = { callStructuredJson, ORDER };
