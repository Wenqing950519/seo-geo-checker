// Portaly Payment callback signature v1.
//
// Ported from portaly-ai/portaly-skills (MIT License, Copyright (c) 2025 Portaly),
// skills/portaly-payment-integration/scripts/sign_callback.webcrypto.mjs at
// commit 4c3ef192ea6b8d7bd7c0cd6ea385aab78e5b369a. stableJson must stay
// byte-identical to Portaly's signer: localeCompare key order (not code-point
// .sort()) plus JSON.stringify undefined semantics. tests/developer-points.test.js
// checks it against Portaly's production-derived vectors.

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (typeof item === "undefined" ? "null" : stableJson(item))).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => typeof item !== "undefined")
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signPortalyCallback({ secret, payload, timestamp }) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${stableJson(payload)}`));
  return toHex(signature);
}

function timingSafeEqualHex(left, right) {
  if (typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function verifyPortalyCallback({ secret, payload, timestamp, signature }) {
  const expected = await signPortalyCallback({ secret, payload, timestamp });
  return timingSafeEqualHex(expected, signature);
}

module.exports = { signPortalyCallback, stableJson, verifyPortalyCallback };
