// What a failed audit job leaves behind in D1. The two launch failures of 2026-10-21 stored only
// `audit_failed`: the container answered 502 with a bare code, the Worker threw a plain Error,
// and the queue handler kept nothing but `error.code`. These helpers give every failure a code,
// a bounded message and a stage, so the next one can be read from `audit_jobs` alone.

const MESSAGE_LIMIT = 240;
const CODE_LIMIT = 120;

export function failure(code, message, extra = {}) {
  const error = new Error(message || code);
  error.code = String(code || "audit_failed").slice(0, CODE_LIMIT);
  Object.assign(error, extra);
  return error;
}

// A non-2xx container response. `body` is the parsed JSON body when the container sent one.
export function containerFailure(status, body) {
  const detail = body && typeof body === "object" ? body : {};
  const containerError = detail.error ? String(detail.error).slice(0, CODE_LIMIT) : null;
  const message = detail.message ? String(detail.message) : `container responded ${status}`;
  return failure(`audit_container_http_${status}`, message, {
    containerError,
    stage: detail.stage ? String(detail.stage).slice(0, CODE_LIMIT) : null
  });
}

// The record the queue handler stores for one failed attempt.
export function describeFailure(error, { attempt } = {}) {
  return {
    code: String(error?.code || "audit_failed").slice(0, CODE_LIMIT),
    message: String(error?.message || "").slice(0, MESSAGE_LIMIT),
    stage: error?.stage ? String(error.stage).slice(0, CODE_LIMIT) : null,
    container_error: error?.containerError ? String(error.containerError).slice(0, CODE_LIMIT) : null,
    attempt: Number.isInteger(attempt) ? attempt : null
  };
}
