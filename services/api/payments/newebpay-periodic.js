const { createCipheriv, createDecipheriv, randomUUID } = require("node:crypto");

const SANDBOX_URL = "https://ccore.newebpay.com/MPG/period";
const VERSION = "1.5";

function createNewebpayPeriodicSandbox(options = {}) {
  const merchantId = required(options.merchantId, "merchantId", 15);
  const key = exactKey(options.hashKey, 32, "hashKey");
  const iv = exactKey(options.hashIv, 16, "hashIv");
  return {
    createCheckout({ orderNo = `gc_${randomUUID().replaceAll("-", "").slice(0, 27)}`, periodNo, returnUrl, notifyUrl, amount = 330 }) {
      const payload = new URLSearchParams({
        RespondType: "JSON", Version: VERSION, TimeStamp: String(Math.floor(Date.now() / 1000)),
        MerOrderNo: safeIdentifier(orderNo, 30, "orderNo"), PeriodNo: safeIdentifier(periodNo, 20, "periodNo"),
        PeriodAmt: String(positiveInteger(amount, "amount")), PeriodType: "M", PeriodPoint: "1",
        ReturnURL: requiredUrl(returnUrl, "returnUrl"), NotifyURL: requiredUrl(notifyUrl, "notifyUrl")
      }).toString();
      return { action: SANDBOX_URL, fields: { MerchantID_: merchantId, PostData_: encrypt(payload, key, iv) } };
    },
    decodeCallback(postData) {
      const decoded = Object.fromEntries(new URLSearchParams(decrypt(required(postData, "postData", 65536), key, iv)));
      if (decoded.MerchantID && decoded.MerchantID !== merchantId) throw coded("merchant_mismatch", "Payment callback merchant does not match");
      return decoded;
    }
  };
}

function encrypt(value, key, iv) { const cipher = createCipheriv("aes-256-cbc", key, iv); return Buffer.concat([cipher.update(value, "utf8"), cipher.final()]).toString("hex"); }
function decrypt(value, key, iv) { const decipher = createDecipheriv("aes-256-cbc", key, iv); return Buffer.concat([decipher.update(Buffer.from(value, "hex")), decipher.final()]).toString("utf8"); }
function exactKey(value, length, label) { const key = Buffer.from(String(value || ""), "utf8"); if (key.length !== length) throw coded("invalid_config", `${label} must be exactly ${length} bytes`); return key; }
function required(value, label, max) { const text = String(value || "").trim(); if (!text || text.length > max) throw coded("invalid_request", `${label} is required`); return text; }
function requiredUrl(value, label) { const text = required(value, label, 2048); try { const parsed = new URL(text); if (parsed.protocol !== "https:") throw new Error(); return parsed.toString(); } catch { throw coded("invalid_request", `${label} must be https`); } }
function positiveInteger(value, label) { const number = Number(value); if (!Number.isInteger(number) || number <= 0) throw coded("invalid_request", `${label} must be a positive integer`); return number; }
function safeIdentifier(value, max, label) { const text = required(value, label, max); if (!/^[A-Za-z0-9_]+$/.test(text)) throw coded("invalid_request", `${label} may only use letters, numbers and underscores`); return text; }
function coded(code, message) { const error = new Error(message); error.code = code; return error; }

module.exports = { createNewebpayPeriodicSandbox, SANDBOX_URL, VERSION };
