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
  if (error.stage === "config" && /BRAVE_API_KEY/.test(error.message || "")) return "Check BRAVE_API_KEY in .env and restart the server.";
  if (error.stage === "config") return "Check AGNES_API_KEY / Aenes_API_KEY in .env and restart the server.";
  if (error.stage === "fetch_homepage") return "The target website may be blocking crawlers, timing out, or returning non-HTML content.";
  if (error.stage === "agnes_api") return "Agnes may be rate limited, overloaded, or rejecting the request. Retry later, check AGNES_BASE_URL, or reduce input size.";
  if (error.stage === "agnes_json") return "Agnes returned text that could not be parsed as JSON. Retry with lower temperature or repair the prompt.";
  if (error.stage === "brave_api") return "Brave Search may be rate limited, rejecting the key, or temporarily unavailable. Check BRAVE_API_KEY and retry.";
  return "Check server logs and retry with a smaller test URL.";
}

module.exports = { AppError, toClientError };
