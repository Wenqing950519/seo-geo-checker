import { isIP } from "node:net";
import { assertPublicHttpUrl, isPrivateIp } from "../../../../packages/shared/public-url.js";

export const GATEWAY_HOST = "geocheck-egress.internal";
export const EGRESS_MODE = "cloudflare-gateway-v1";
export const PROVIDER_PLACEHOLDER = "managed-by-egress";
const PAGE_BYTES = 2 * 1024 * 1024;
const PROVIDER_ROUTES = {
  "api.deepseek.com": { paths: ["/chat/completions"], secret: "DEEPSEEK_API_KEY" },
  "api.perplexity.ai": { paths: ["/v1/sonar"], secret: "PERPLEXITY_API_KEY" },
  "generativelanguage.googleapis.com": { paths: ["/v1beta/interactions"], secret: "GEMINI_API_KEY" }
};

export async function readBoundedBytes(message, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error("egress_invalid_byte_limit");
  if (Number(message.headers.get("content-length")) > maxBytes) {
    await message.body?.cancel();
    throw new Error("egress_response_too_large");
  }
  const reader = message.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("egress_response_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function resolvePublicDns(hostname, signal, fetchImpl) {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return;
  const results = await Promise.all(["A", "AAAA"].map(async (type) => {
    const query = new URL("https://cloudflare-dns.com/dns-query");
    query.search = new URLSearchParams({ name: host, type }).toString();
    const response = await fetchImpl(query.href, { headers: { accept: "application/dns-json" }, redirect: "error", signal });
    if (!response.ok) throw new Error("egress_dns_failed");
    const data = JSON.parse(new TextDecoder().decode(await readBoundedBytes(response, 64 * 1024)));
    if (data.Status !== 0) throw new Error("egress_dns_failed");
    return (data.Answer || []).filter((answer) => answer.type === 1 || answer.type === 28).map((answer) => String(answer.data));
  }));
  const addresses = results.flat();
  if (!addresses.length || addresses.some(isPrivateIp)) throw new Error("egress_dns_not_public");
}

// All URL-dependent Worker traffic uses this policy. DNS checks reject private/mixed answers;
// Workers' outbound network proxy enforces the final public-network boundary at connection
// time. This is deliberately NOT described as Node-style DNS pinning. No VPC binding exists.
export async function fetchPublicPage(input, init = {}, dependencies = {}) {
  const target = assertPublicHttpUrl(String(input));
  if (PROVIDER_ROUTES[target.hostname]) throw new Error("egress_reserved_host");
  const method = String(init.method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method)) throw new Error("egress_method_denied");
  const maxBytes = init.maxBytes === undefined ? PAGE_BYTES : init.maxBytes;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error("egress_invalid_byte_limit");
  const signal = AbortSignal.any([AbortSignal.timeout(20_000), ...(init.signal ? [init.signal] : [])]);
  const fetchImpl = dependencies.fetch || globalThis.fetch;
  await (dependencies.resolve || resolvePublicDns)(target.hostname, signal, fetchImpl);
  const sourceHeaders = new Headers(init.headers);
  const headers = new Headers({ "accept-encoding": "identity" });
  for (const key of ["accept", "accept-language", "user-agent"]) if (sourceHeaders.has(key)) headers.set(key, sourceHeaders.get(key));
  const response = await fetchImpl(target.href, { method, headers, redirect: "manual", signal });
  if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
    try { assertPublicHttpUrl(new URL(response.headers.get("location"), target)); }
    catch (error) { await response.body?.cancel(); throw error; }
  }
  // Header-only entry probes cancel immediately; they must not buffer an arbitrary website.
  if (init.headersOnly) {
    await response.body?.cancel();
    return new Response(null, { status: response.status, headers: response.headers });
  }
  const bytes = await readBoundedBytes(response, Math.min(maxBytes, PAGE_BYTES));
  const responseHeaders = new Headers(response.headers);
  // Fetch exposes decoded bytes when the upstream ignores Accept-Encoding: identity.
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("set-cookie");
  const noBody = method === "HEAD" || [204, 205, 304].includes(response.status);
  return new Response(noBody ? null : bytes, { status: response.status, headers: responseHeaders });
}

function rejected(status = 403) {
  return Response.json({ error: "egress_denied" }, { status, headers: { "cache-control": "no-store" } });
}

// This function is attached ONLY to the container's outboundByHost, never to public fetch().
// The synthetic hostname has no external route and works only through ContainerProxy.
export async function crawlerGateway(request, _env, _ctx, dependencies = {}) {
  const url = new URL(request.url);
  if (url.origin !== `http://${GATEWAY_HOST}` || url.pathname !== "/fetch" || url.search || request.method !== "POST") return rejected();
  try {
    const body = JSON.parse(new TextDecoder().decode(await readBoundedBytes(request, 16 * 1024)));
    return await fetchPublicPage(body.url, { method: body.method, headers: body.headers, maxBytes: body.maxBytes, signal: request.signal }, dependencies);
  } catch { return rejected(502); }
}

// Only fixed POST endpoints receive credentials. Container-provided cookies, auth, query
// strings and forwarding headers never reach providers; redirects never receive a credential.
export async function providerGateway(request, env, _ctx, dependencies = {}) {
  const url = new URL(request.url);
  const route = PROVIDER_ROUTES[url.hostname];
  if (!route || url.protocol !== "https:" || url.port || url.username || url.password || url.search || !route.paths.includes(url.pathname)
    || request.method !== "POST" || !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) return rejected();
  const credential = env[route.secret];
  if (!credential) return rejected(503);
  try {
    const body = await readBoundedBytes(request, 128 * 1024);
    JSON.parse(new TextDecoder().decode(body));
    const headers = new Headers({ "content-type": "application/json", "accept-encoding": "identity" });
    headers.set(route.secret === "GEMINI_API_KEY" ? "x-goog-api-key" : "authorization", route.secret === "GEMINI_API_KEY" ? credential : `Bearer ${credential}`);
    const response = await (dependencies.fetch || globalThis.fetch)(url.href, {
      method: "POST", headers, body, redirect: "manual", signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)])
    });
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); return rejected(502); }
    const bytes = await readBoundedBytes(response, 4 * 1024 * 1024);
    const resultHeaders = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
    // Headers may contain provider request ids, but never reflect provider Set-Cookie or auth.
    for (const key of ["x-request-id", "request-id"]) if (response.headers.has(key)) resultHeaders.set(key, response.headers.get(key));
    return new Response([204, 205, 304].includes(response.status) ? null : bytes, { status: response.status, headers: resultHeaders });
  } catch { return rejected(502); }
}

export const outboundByHost = {
  [GATEWAY_HOST]: crawlerGateway,
  ...Object.fromEntries(Object.keys(PROVIDER_ROUTES).map((hostname) => [hostname, providerGateway]))
};
