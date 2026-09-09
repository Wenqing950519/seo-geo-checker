export type MeasurementInput = { type: "url"; url: string } | { type: "prompt"; text: string };

export interface MeasurementRequest { input: MeasurementInput; locale?: string; [key: string]: unknown; }
export interface MeasurementJob {
  job_id: string; measurement_id: string; status: "queued" | "running" | "succeeded" | "failed" | "ambiguous";
  created_at: string; completed_at: string | null; content_deleted_at: string | null; error_code: string | null;
}
export interface MeasurementAccepted extends MeasurementJob { idempotent_replay?: boolean; }
export interface EngineResult { id: string; status: "succeeded" | "failed" | "ambiguous"; answer?: string; citations?: Array<{ url?: string; title?: string; [key: string]: unknown }>; error?: { code: string; message?: string }; [key: string]: unknown; }
export interface MeasurementResult { measurement_id: string; status: "succeeded" | "failed" | "ambiguous"; engines: EngineResult[]; partial_results?: EngineResult[]; created_at?: string; completed_at?: string; [key: string]: unknown; }
export interface Usage { used_rounds: number; reserved_rounds: number; remaining_rounds: number; quota_limit: number; [key: string]: unknown; }
export interface GeoCheckClientOptions { apiKey: string; baseUrl?: string; fetch?: typeof fetch; }
export interface PollOptions { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal; }

export class GeoCheckApiError extends Error {
  readonly status: number; readonly code: string; readonly retryAfterMs: number | null;
  constructor(message: string, status: number, code = "api_error", retryAfterMs: number | null = null) {
    super(message); this.name = "GeoCheckApiError"; this.status = status; this.code = code; this.retryAfterMs = retryAfterMs;
  }
}

export class GeoCheckClient {
  private readonly apiKey: string; private readonly baseUrl: string; private readonly fetchImpl: typeof fetch;
  constructor(options: GeoCheckClientOptions) {
    if (!options?.apiKey?.trim()) throw new TypeError("apiKey is required");
    this.apiKey = options.apiKey.trim(); this.baseUrl = (options.baseUrl || "https://api.geocheck.lisheng.cv").replace(/\/+$/, "");
    this.fetchImpl = options.fetch || globalThis.fetch; if (!this.fetchImpl) throw new TypeError("A fetch implementation is required");
  }
  async createMeasurement(request: MeasurementRequest, idempotencyKey: string): Promise<MeasurementAccepted> {
    if (!idempotencyKey?.trim()) throw new TypeError("An explicit idempotencyKey is required");
    return this.request<MeasurementAccepted>("/v1/measurements", { method: "POST", headers: { "Idempotency-Key": idempotencyKey.trim() }, body: JSON.stringify(request) });
  }
  getJob(jobId: string): Promise<MeasurementJob> { return this.request<MeasurementJob>(`/v1/jobs/${encodeURIComponent(requiredId(jobId, "jobId"))}`); }
  getMeasurement(measurementId: string): Promise<MeasurementResult> { return this.request<MeasurementResult>(`/v1/measurements/${encodeURIComponent(requiredId(measurementId, "measurementId"))}`); }
  getUsage(): Promise<Usage> { return this.request<Usage>("/v1/usage"); }
  async pollMeasurement(measurementId: string, options: PollOptions = {}): Promise<MeasurementResult> {
    const intervalMs = options.intervalMs ?? 2_000; const timeoutMs = options.timeoutMs ?? 120_000; const startedAt = Date.now();
    while (true) {
      throwIfAborted(options.signal);
      try { return await this.getMeasurement(measurementId); } catch (error) {
        if (!(error instanceof GeoCheckApiError) || error.status !== 409) throw error;
        const remaining = timeoutMs - (Date.now() - startedAt);
        if (remaining <= 0) throw new GeoCheckApiError("Measurement polling timed out", 408, "poll_timeout");
        await sleep(Math.min(error.retryAfterMs ?? intervalMs, remaining), options.signal);
      }
    }
  }
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${this.apiKey}`); headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers }); const text = await response.text(); const body = text ? safeJson(text) : null;
    if (!response.ok) {
      const error = body && typeof body === "object" ? (body as { error?: { code?: string; message?: string } }).error : undefined;
      throw new GeoCheckApiError(error?.message || `GeoCheck API request failed (${response.status})`, response.status, error?.code || "api_error", retryAfterMs(response.headers.get("Retry-After")));
    }
    return body as T;
  }
}
function requiredId(value: string, label: string): string { if (!value?.trim()) throw new TypeError(`${label} is required`); return value.trim(); }
function safeJson(value: string): unknown { try { return JSON.parse(value); } catch { throw new GeoCheckApiError("GeoCheck API returned invalid JSON", 502, "invalid_json_response"); } }
function retryAfterMs(value: string | null): number | null { if (!value) return null; const seconds = Number(value); if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000); const date = Date.parse(value); return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null; }
function throwIfAborted(signal?: AbortSignal): void { if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError"); }
function sleep(ms: number, signal?: AbortSignal): Promise<void> { return new Promise((resolve, reject) => { const timer = setTimeout(resolve, Math.max(0, ms)); signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason || new DOMException("Aborted", "AbortError")); }, { once: true }); }); }
