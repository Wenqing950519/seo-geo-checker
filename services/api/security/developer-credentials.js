const { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } = require("node:crypto");

const TOKEN_BYTES = 32;

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    const error = new Error("A valid email address is required");
    error.code = "invalid_request";
    error.statusCode = 400;
    throw error;
  }
  return email;
}

function createOpaqueToken(prefix) {
  return `${prefix}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

function hashToken(token, pepper) {
  return createHmac("sha256", requirePepper(pepper)).update(String(token || "")).digest("hex");
}

function tokenPrefix(token) {
  const value = String(token || "");
  return value.length <= 14 ? value : `${value.slice(0, 14)}…`;
}

function encryptToken(token, pepper) {
  const key = createHash("sha256").update(requirePepper(pepper)).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(value, pepper) {
  const [ivValue, tagValue, encryptedValue] = String(value || "").split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted token");
  const key = createHash("sha256").update(requirePepper(pepper)).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function requirePepper(value) {
  const pepper = String(value || "");
  if (Buffer.byteLength(pepper, "utf8") < 32) {
    throw new Error("DEVELOPER_API_TOKEN_PEPPER must be at least 32 bytes");
  }
  return pepper;
}

module.exports = {
  createOpaqueToken,
  decryptToken,
  encryptToken,
  hashToken,
  normalizeEmail,
  requirePepper,
  tokenPrefix
};
