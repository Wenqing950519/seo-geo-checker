// Target URL handling for the public quick check: input normalization, the SSRF guard, the
// cache key, and the entry probe. The user types a host; the site may serve its page only on
// www or only over http with a redirect to https (noodle3.com.tw, 2026-10-21: https apex timed
// out, http apex answered 301 to www, https www served the page). The probe finds the entry
// that answers before Browser Rendering and the container fetch it; the cache key and the
// measurement use that entry, while the job keeps what the user typed.

import { assertPublicHttpUrl, isPrivateHostname } from "../../../../packages/shared/public-url.js";

const PROBE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"
};

export function normalizeUrl(input) {
  const raw = String(input || "").trim();
  const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return assertPublicHttpUrl(value).toString();
  } catch {
    const error = new Error("invalid_target_url");
    error.status = 400;
    throw error;
  }
}

export function isPrivateHost(hostname) {
  return isPrivateHostname(hostname);
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function cacheKey(siteUrl, customQueries, pipelineVersion) {
  const parsed = new URL(siteUrl);
  return sha256(JSON.stringify({
    site_origin: `${parsed.protocol}//${parsed.host}`.toLowerCase(),
    custom_queries: customQueries || [],
    pipeline_version: String(pipelineVersion || "unknown")
  }));
}

// The entries tried, in order: the input as typed, the https www/apex counterpart, then the
// other scheme of the input. An IP address or a single-label host has no www counterpart.
export function entryCandidates(siteUrl) {
  const input = new URL(siteUrl);
  const candidates = [input.toString()];
  const host = input.hostname;
  const isAddress = /^[\d.]+$/.test(host) || host.includes(":");
  if (!isAddress && host.includes(".")) {
    const toggled = new URL(input.toString());
    toggled.protocol = "https:";
    toggled.hostname = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    candidates.push(toggled.toString());
  }
  const otherScheme = new URL(input.toString());
  otherScheme.protocol = input.protocol === "https:" ? "http:" : "https:";
  candidates.push(otherScheme.toString());
  return [...new Set(candidates)];
}

// Finds the entry that answers 2xx, following each candidate's redirects hop by hop with the
// SSRF guard applied to every target. When nothing answers, the normalized input stays the
// target, so the container's own fallback chain runs as before.
export async function resolveEntryUrl(siteUrl, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs || 6000);
  const maxHops = Number(options.maxHops || 5);
  const attempts = [];
  for (const candidate of entryCandidates(siteUrl)) {
    let current = candidate;
    const seen = new Set();
    for (let hop = 0; hop < maxHops; hop += 1) {
      let target;
      try { target = assertPublicHttpUrl(current); } catch {
        attempts.push(`${current} blocked`);
        break;
      }
      if (seen.has(target.href)) { attempts.push(`${current} loop`); break; }
      seen.add(target.href);
      let response;
      try {
        response = await fetchImpl(target.href, {
          method: "GET",
          headers: PROBE_HEADERS,
          redirect: "manual",
          signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined
        });
      } catch (error) {
        attempts.push(`${current} ${String(error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : error?.code || error?.name || "error")}`);
        break;
      }
      try { await response.body?.cancel(); } catch { /* the body is not needed */ }
      const status = Number(response.status);
      if (status >= 200 && status < 300) {
        target.hash = "";
        attempts.push(`${current} ${status}`);
        return { url: target.toString(), reachable: true, attempts };
      }
      const location = response.headers?.get?.("location");
      if (status >= 300 && status < 400 && location) {
        attempts.push(`${current} ${status}`);
        try { current = new URL(location, target).toString(); } catch { attempts.push(`${location} invalid`); break; }
        continue;
      }
      attempts.push(`${current} ${status}`);
      break;
    }
  }
  return { url: siteUrl, reachable: false, attempts };
}
