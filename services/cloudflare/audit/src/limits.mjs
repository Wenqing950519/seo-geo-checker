// Admission limits for the public GeoCheck quick check (LSL-D-006). The daily and per-client
// ceilings are kept out of this public repo: they live in the AUDIT_LIMITS secret, as
// {"daily":n,"per_ip":n,"per_ip_hours":n}, and client addresses are stored only as a hash keyed
// by the AUDIT_IP_PEPPER secret. Without valid settings the Worker accepts no new audits.

// Must equal queues.consumers[0].max_retries in wrangler.jsonc (checked by the MCAC tests).
export const QUEUE_MAX_RETRIES = 1;

export function parseLimits(env = {}) {
  let raw;
  try { raw = JSON.parse(String(env.AUDIT_LIMITS || "")); } catch { return null; }
  const daily = positiveInteger(raw?.daily);
  const perIp = positiveInteger(raw?.per_ip);
  const perIpHours = positiveInteger(raw?.per_ip_hours);
  const pepper = String(env.AUDIT_IP_PEPPER || "");
  if (!daily || !perIp || !perIpHours || pepper.length < 16) return null;
  return { daily, perIp, perIpHours, pepper };
}

// An IPv6 client usually holds a whole /64, so one /64 counts as one client.
export function clientBucket(ip) {
  const value = String(ip || "").trim().toLowerCase();
  if (!value) return "unknown";
  if (!value.includes(":")) return value;
  const [head, tail] = value.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = value.includes("::")
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left;
  return groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":");
}

export async function clientKey(ip, pepper) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(clientBucket(ip)));
  return [...new Uint8Array(mac)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Queue attempts count from 1, so with one retry the second failure is the last one.
export function isFinalAttempt(attempts, maxRetries = QUEUE_MAX_RETRIES) {
  return Number(attempts || 1) > Number(maxRetries);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
