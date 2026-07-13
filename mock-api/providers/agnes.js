const { AppError } = require("../lib/errors");

const DEFAULT_BASE_URL = "https://apihub.agnes-ai.com/v1";
const DEFAULT_MODEL = "agnes-2.0-flash";

function getAgnesConfig() {
  return {
    apiKey: requireEnvAny(["AGNES_API_KEY", "Agnes_API_KEY", "AENES_API_KEY", "Aenes_API_KEY"]),
    model: getEnvAny(["AGNES_MODEL", "Agnes_MODEL", "AENES_MODEL", "Aenes_MODEL"]) || DEFAULT_MODEL,
    baseUrl: normalizeBaseUrl(
      getEnvAny(["AGNES_BASE_URL", "Agnes_BASE_URL", "AENES_BASE_URL", "Aenes_BASE_URL"]) || DEFAULT_BASE_URL
    )
  };
}

async function callAgnesJson(prompt, options = {}) {
  let apiKey;
  let model;
  let baseUrl;
  try {
    ({ apiKey, model, baseUrl } = getAgnesConfig());
  } catch (error) {
    throw normalizeAgnesError(error);
  }
  const url = chatCompletionsUrl(baseUrl);
  const started = Date.now();
  const attempts = options.attempts ?? 4;
  let lastError;
  let useResponseFormat = options.responseFormat !== false;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const payload = {
        model,
        messages: [
          {
            role: "system",
            content: "You return only valid JSON. Do not include markdown fences or commentary."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: options.temperature ?? 0.2
      };

      if (useResponseFormat) {
        payload.response_format = { type: "json_object" };
      }

      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }, options.timeoutMs ?? 45_000);

      const raw = await response.text();
      if (!response.ok) {
        const message = extractApiError(raw);
        if (response.status === 400 && useResponseFormat && /response_format|json_object/i.test(message)) {
          useResponseFormat = false;
          lastError = normalizeAgnesError(new Error(message));
          continue;
        }
        throw new AppError(`Agnes API error: HTTP ${response.status} ${message}`, {
          statusCode: response.status >= 500 || response.status === 429 ? 503 : response.status,
          stage: "agnes_api",
          retryable: isRetryableStatus(response.status),
          details: {
            httpStatus: response.status,
            attempt,
            retryAfter: response.headers.get("retry-after") || undefined
          }
        });
      }

      const data = safeParseJson(raw, "Agnes HTTP response was not valid JSON");
      const text = extractAssistantText(data);
      if (!text) {
        throw new AppError("Agnes response did not include assistant text", {
          statusCode: 502,
          stage: "agnes_api",
          retryable: true,
          details: { attempt }
        });
      }

      try {
        return {
          json: JSON.parse(text),
          latencyMs: Date.now() - started,
          model,
          provider: "agnes",
          attempts: attempt
        };
      } catch {
        const repaired = extractJsonObject(text);
        if (repaired) {
          return {
            json: repaired,
            latencyMs: Date.now() - started,
            model,
            provider: "agnes",
            attempts: attempt,
            repairedJson: true
          };
        }
        throw new AppError("Agnes response was not valid JSON", {
          statusCode: 502,
          stage: "agnes_json",
          retryable: true,
          details: { attempt, rawPreview: text.slice(0, 500) }
        });
      }
    } catch (error) {
      lastError = normalizeAgnesError(error);
      if (!lastError.retryable || attempt === attempts) break;
      await sleep(retryDelayMs(lastError, attempt));
    }
  }

  throw lastError;
}

async function testAgnesProvider() {
  return callAgnesJson(
    'Return only valid JSON: {"ok":true,"provider":"agnes","message":"api works"}',
    { temperature: 0, timeoutMs: 20_000 }
  );
}

module.exports = { callAgnesJson, getAgnesConfig, testAgnesProvider };

function getEnvAny(names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return "";
}

function requireEnvAny(names) {
  const value = getEnvAny(names);
  if (!value) throw new Error(`${names[0]} is not configured`);
  return value;
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function chatCompletionsUrl(baseUrl) {
  return /\/chat\/completions$/i.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
}

function extractAssistantText(data) {
  const message = data?.choices?.[0]?.message;
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    return message.content
      .map((part) => part?.text || part?.content || "")
      .filter(Boolean)
      .join("");
  }
  if (typeof data?.output_text === "string") return data.output_text;
  return "";
}

function extractApiError(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed.error?.message || parsed.message || raw;
  } catch {
    return String(raw).slice(0, 1000);
  }
}

function safeParseJson(raw, message) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError(message, {
      statusCode: 502,
      stage: "agnes_api",
      retryable: true,
      details: { rawPreview: String(raw).slice(0, 500) }
    });
  }
}

function extractJsonObject(text) {
  const source = String(text || "").trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1);
  if (!candidate || !candidate.startsWith("{")) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeAgnesError(error) {
  if (error instanceof AppError) return error;
  if (error.name === "AbortError") {
    return new AppError("Agnes API request timed out", {
      statusCode: 504,
      stage: "agnes_api",
      retryable: true
    });
  }
  if (/AGNES_API_KEY|AENES_API_KEY/.test(error.message)) {
    return new AppError(error.message, {
      statusCode: 500,
      stage: "config",
      retryable: false
    });
  }
  return new AppError(error.message || "Agnes API request failed", {
    statusCode: 502,
    stage: "agnes_api",
    retryable: true
  });
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function retryDelayMs(error, attempt) {
  const retryAfter = Number(error.details?.retryAfter);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 15_000);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(500 * 2 ** (attempt - 1) + jitter, 5_000);
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
