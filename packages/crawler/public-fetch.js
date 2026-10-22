const http = require("node:http");
const https = require("node:https");
const { gunzipSync, brotliDecompressSync, inflateSync } = require("node:zlib");
const { resolveSafePublicUrl } = require("./url-safety.js");
const { assertPublicHttpUrl } = require("../shared/public-url.js");

// Fetch untrusted website content through one checked DNS answer. Pinning the connection's
// lookup closes the check/use DNS-rebinding window; every redirect is checked independently.
// Provider API calls intentionally do not use this crawler-only transport.
async function fetchPublicUrl(input, options = {}) {
  let current = String(input);
  const signal = options.signal || AbortSignal.timeout(20_000);
  const maxBytes = options.maxBytes || 2 * 1024 * 1024;
  const headers = new Headers(options.headers || {});
  headers.delete("host");
  headers.set("accept-encoding", "identity");
  for (let hop = 0; hop <= 5; hop += 1) {
    signal.throwIfAborted();
    let target;
    let response;
    if (process.env.GEOCHECK_EGRESS_MODE === "cloudflare-gateway-v1") {
      // Cloudflare's deny-default container resolves only this synthetic gateway hostname.
      // The Worker performs public-target checks; no native website DNS/socket fallback runs.
      target = { url: assertPublicHttpUrl(current) };
      response = await fetchGateway(target.url, { ...options, headers: Object.fromEntries(headers), signal, maxBytes });
    } else {
      target = await abortable(resolveSafePublicUrl(current, { lookup: options.lookup }), signal);
      const requestImpl = options.request || (target.url.protocol === "https:" ? https.request : http.request);
      response = await readResponse(target, { ...options, headers: Object.fromEntries(headers), requestImpl, signal, maxBytes });
    }
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location || options.redirect === "manual") return response;
    if (hop === 5) throw new Error("public_fetch_redirect_limit");
    const next = new URL(location, target.url);
    if (next.origin !== target.url.origin) { headers.delete("authorization"); headers.delete("cookie"); }
    current = next.toString();
  }
}

async function fetchGateway(url, { method = "GET", headers, signal, maxBytes }) {
  const response = await fetch("http://geocheck-egress.internal/fetch", {
    method: "POST", headers: { "content-type": "application/json" }, redirect: "manual", signal,
    body: JSON.stringify({ url: url.href, method, headers, maxBytes })
  });
  const reader = response.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error("public_fetch_response_too_large"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const noBody = method === "HEAD" || [204, 205, 304].includes(response.status);
  const responseHeaders = new Headers(response.headers);
  // Node fetch has already decoded any compression the Worker applied to the gateway hop.
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  const result = new Response(noBody ? null : Buffer.concat(chunks), { status: response.status, headers: responseHeaders });
  Object.defineProperty(result, "url", { value: url.href });
  return result;
}

function readResponse(target, { requestImpl, signal, maxBytes, method = "GET", headers = {} }) {
  return new Promise((resolve, reject) => {
    const request = requestImpl(target.url, {
      method, headers, signal, agent: false,
      lookup(_host, options, callback) {
        callback(null, options?.all ? [{ address: target.address, family: target.family }] : target.address, target.family);
      }
    }, (incoming) => {
      const chunks = [];
      let bytes = 0;
      incoming.on("error", reject);
      incoming.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          const error = new Error("public_fetch_response_too_large");
          incoming.destroy(error);
          request.destroy(error);
          reject(error);
        } else chunks.push(chunk);
      });
      incoming.on("end", () => {
        try {
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (value != null) responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : String(value));
          }
          const status = incoming.statusCode;
          const noBody = [204, 205, 304].includes(status) || method === "HEAD";
          let body = noBody ? null : Buffer.concat(chunks);
          const encoding = String(responseHeaders.get("content-encoding") || "identity").trim().toLowerCase();
          if (body && encoding !== "identity") {
            const decode = { gzip: gunzipSync, br: brotliDecompressSync, deflate: inflateSync }[encoding];
            if (!decode) throw new Error("public_fetch_encoding_unsupported");
            try { body = decode(body, { maxOutputLength: maxBytes }); }
            catch (error) { if (error.code === "ERR_BUFFER_TOO_LARGE") throw new Error("public_fetch_response_too_large"); throw error; }
            // Both Node HTML parsing and Playwright fulfillment receive decoded bytes.
            responseHeaders.delete("content-encoding");
            responseHeaders.delete("content-length");
          }
          const response = new Response(body, { status, headers: responseHeaders });
          Object.defineProperty(response, "url", { value: target.url.toString() });
          resolve(response);
        } catch (error) {
          // A remote HTTP status/header need not satisfy the Fetch Response constructor.
          // Fail this crawl instead of throwing out of the stream callback and killing Node.
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.end();
  });
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

module.exports = { fetchPublicUrl };
