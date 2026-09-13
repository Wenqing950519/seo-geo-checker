const { createHash } = require("node:crypto");

const MAX_URL_LENGTH = 2_048;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const SOURCE_KINDS = Object.freeze(["website", "google_maps", "facebook"]);

class TruthSourceError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function createTruthSourceFetcher(options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");
  const maxBodyBytes = Number(options.maxBodyBytes) > 0 ? Math.min(Number(options.maxBodyBytes), MAX_BODY_BYTES) : MAX_BODY_BYTES;

  async function fetchSource(input) {
    const normalized = normalizeSource(input);
    let current = normalized.url;
    let response;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      try {
        response = await fetchImpl(current, { method: "GET", redirect: "manual", headers: { Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.8" } });
      } catch (error) {
        throw new TruthSourceError("source_fetch_failed", "公開來源無法抓取", 502);
      }
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (redirect === MAX_REDIRECTS) throw new TruthSourceError("source_redirect_limit", "公開來源轉址次數超過限制", 400);
      const location = response.headers?.get?.("location") || response.headers?.get?.("Location");
      if (!location) throw new TruthSourceError("source_redirect_invalid", "公開來源轉址缺少位置", 400);
      current = normalizeSourceUrl(new URL(location, current).toString());
    }
    if (!response || !response.ok) {
      throw new TruthSourceError(`source_http_${Number(response?.status || 0) || "error"}`, "公開來源回應失敗", 502);
    }
    const contentType = String(response.headers?.get?.("content-type") || "text/html").toLowerCase();
    if (!/(text\/html|application\/xhtml\+xml|application\/json|text\/plain)/i.test(contentType)) {
      throw new TruthSourceError("unsupported_content_type", "公開來源不是可讀取的文字頁面", 415);
    }
    const declaredLength = Number(response.headers?.get?.("content-length") || 0);
    if (declaredLength > maxBodyBytes) throw new TruthSourceError("source_too_large", "公開來源超過大小限制", 413);
    let bytes;
    try { bytes = new Uint8Array(await response.arrayBuffer()); } catch { throw new TruthSourceError("source_body_failed", "公開來源內容無法讀取", 502); }
    if (bytes.byteLength > maxBodyBytes) throw new TruthSourceError("source_too_large", "公開來源超過大小限制", 413);
    const body = new TextDecoder().decode(bytes);
    const extracted = extractCandidateFields(body, contentType);
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    return {
      canonicalUrl: current,
      status: Object.values(extracted.fields).some(Boolean) ? "succeeded" : "partial",
      fetchedAt: new Date().toISOString(),
      contentHash,
      metadata: { contentType, bytes: bytes.byteLength, title: extracted.title, finalUrl: current },
      snippets: extracted.snippets,
      candidateFields: extracted.fields
    };
  }

  return { fetchSource };
}

function normalizeSource(input) {
  const kind = String(input?.kind || "website").trim().toLowerCase();
  if (!SOURCE_KINDS.includes(kind)) throw new TruthSourceError("invalid_source_kind", "source kind must be website, google_maps, or facebook");
  const url = normalizeSourceUrl(input?.url);
  const hostname = new URL(url).hostname.toLowerCase();
  if (kind === "google_maps" && !/(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$|(^|\.)app\.goo\.gl$/.test(hostname)) {
    throw new TruthSourceError("invalid_source_host", "google_maps sources must use a Google Maps public host");
  }
  if (kind === "facebook" && !/(^|\.)facebook\.com$|(^|\.)fb\.com$/.test(hostname)) {
    throw new TruthSourceError("invalid_source_host", "facebook sources must use a Facebook public host");
  }
  return { kind, url };
}

function normalizeSourceUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_URL_LENGTH) throw new TruthSourceError("invalid_source_url", "source URL is required and must be short enough");
  let parsed;
  try { parsed = new URL(raw); } catch { throw new TruthSourceError("invalid_source_url", "source URL must be an absolute http(s) URL"); }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port || !hostname || isPrivateHostname(hostname)) {
    throw new TruthSourceError("unsafe_source_url", "source URL must use a public http(s) hostname and default port");
  }
  parsed.hash = "";
  return parsed.toString();
}

function isPrivateHostname(hostname) {
  if (["localhost", "localhost.localdomain", "::1"].includes(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^169\.254\./.test(hostname) || /^0\./.test(hostname)) return true;
  const match = hostname.match(/^172\.(\d{1,3})\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31) || /^[0-9a-f:]+$/i.test(hostname);
}

function extractCandidateFields(body, contentType) {
  const snippets = [];
  const fields = { address: null, phone: null, hours: null };
  const title = decodeEntities((body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim()).slice(0, 300);
  const jsonLdValues = extractJsonLd(body);
  for (const value of jsonLdValues) {
    if (!fields.phone && value.telephone) fields.phone = candidate(String(value.telephone), "json_ld");
    if (!fields.address && value.address) {
      const address = typeof value.address === "string" ? value.address : [value.address.streetAddress, value.address.addressLocality, value.address.addressRegion].filter(Boolean).join("");
      if (address) fields.address = candidate(address, "json_ld");
    }
    if (!fields.hours && (value.openingHours || value.openingHoursSpecification)) {
      const hours = formatHours(value.openingHoursSpecification || value.openingHours);
      if (hours) fields.hours = candidate(hours, "json_ld");
    }
  }
  const visible = decodeEntities(body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  if (!fields.phone) {
    const phone = visible.match(/(?:電話|tel(?:ephone)?)[：:\s]*([+\d][\d\s().-]{6,24}\d)/i)?.[1];
    if (phone) fields.phone = candidate(phone.trim(), "visible_text");
  }
  if (!fields.address) {
    const address = visible.match(/((?:台|臺)灣[^。；;]{2,100}(?:號|巷|弄|路|街|區))/)?.[1];
    if (address) fields.address = candidate(address.trim(), "visible_text");
  }
  if (!fields.hours) {
    const hours = visible.match(/((?:週|星期)[一二三四五六日天][^。；;]{0,20}\d{1,2}:\d{2}\s*[-~至]\s*\d{1,2}:\d{2})/)?.[1];
    if (hours) fields.hours = candidate(hours.trim(), "visible_text");
  }
  for (const [key, value] of Object.entries(fields)) if (value) snippets.push({ field: key, text: value.value, source: value.source });
  if (title) snippets.push({ field: "title", text: title, source: "title" });
  return { title, fields, snippets: snippets.slice(0, 20), contentType };
}

function extractJsonLd(body) {
  const values = [];
  for (const match of body.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeEntities(match[1].trim()));
      const entries = Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed];
      for (const entry of entries) if (entry && typeof entry === "object") values.push(entry);
    } catch { /* malformed structured data is an unknown, not a fetch failure */ }
  }
  return values;
}

function formatHours(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (typeof item === "string") return item;
    const days = Array.isArray(item.dayOfWeek) ? item.dayOfWeek.join(",") : item.dayOfWeek || "";
    return [days, item.opens && item.closes ? `${item.opens}-${item.closes}` : ""].filter(Boolean).join(" ");
  }).filter(Boolean).join("；");
}

function candidate(value, source) {
  return { value: String(value).trim().slice(0, 1_000), source, confidence: source === "json_ld" ? "high" : "medium" };
}

function decodeEntities(value) {
  return String(value || "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

module.exports = { MAX_BODY_BYTES, SOURCE_KINDS, TruthSourceError, createTruthSourceFetcher, normalizeSource, normalizeSourceUrl };
