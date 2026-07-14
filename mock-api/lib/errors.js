class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = options.statusCode || 500;
    this.stage = options.stage || "unknown";
    this.retryable = Boolean(options.retryable);
    this.details = options.details;
  }
}

function toClientError(error) {
  return {
    ok: false,
    error: error.message || "Unknown error",
    stage: error.stage || "unknown",
    retryable: Boolean(error.retryable),
    details: error.details,
    hint: hintForError(error)
  };
}

function hintForError(error) {
  if (error.stage === "config") return "Check GEMINI_API_KEY and PERPLEXITY_API_KEY in .env, then restart the server.";
  if (error.stage === "fetch_homepage") return "The target website may be blocking crawlers, timing out, or returning non-HTML content.";
  if (error.stage === "gemini_api") return "Gemini may be rate limited, overloaded, or rejecting the request. Check GEMINI_MODEL and GEMINI_API_KEY.";
  if (error.stage === "gemini_json") return "Gemini returned text that could not be parsed as JSON. Retry with the structured-output setting.";
  if (error.stage === "perplexity_api") return "Perplexity Sonar may be rate limited or rejecting the key. Check PERPLEXITY_API_KEY and PERPLEXITY_MODEL.";
  return "Check server logs and retry with a smaller test URL.";
}

module.exports = { AppError, toClientError };
