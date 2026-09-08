const net = require("node:net");
const https = require("node:https");
const { AppError } = require("../shared/errors.js");

async function fetchHomepageWithGoogleTranslate(url, options = {}) {
  const translatedUrl = buildGoogleTranslateUrl(url);
  let response;

  try {
    response = await requestText(translatedUrl, {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"
    }, options.requestImpl);
  } catch (error) {
    throw new AppError(`Google Translate fallback failed: ${error.name === "AbortError" ? "timeout" : error.message}`, {
      statusCode: 502,
      stage: "translate_fetch",
      retryable: true,
      details: { url, translatedUrl }
    });
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || (contentType && !/text\/html|application\/xhtml/i.test(contentType))) {
    throw new AppError(`Google Translate fallback returned HTTP ${response.status}`, {
      statusCode: response.status >= 500 ? 502 : 400,
      stage: "translate_fetch",
      retryable: response.status >= 500 || response.status === 429,
      details: { url, translatedUrl, httpStatus: response.status, contentType }
    });
  }

  const html = response.text;
  if (looksLikeChallenge(html)) {
    throw new AppError("Google Translate fallback also received a bot challenge", {
      statusCode: 403,
      stage: "translate_challenge",
      retryable: false,
      details: { url, translatedUrl }
    });
  }

  return {
    html,
    fetchMethod: "google-translate",
    statusCode: response.status,
    finalUrl: url,
    sourceUrl: translatedUrl,
    headers: {
      contentType,
      xRobotsTag: response.headers.get("x-robots-tag") || ""
    }
  };
}

function buildGoogleTranslateUrl(value) {
  const source = new URL(value);
  if (!isEligiblePublicUrl(source)) {
    throw new AppError("Google Translate fallback only supports public HTTP(S) URLs", {
      statusCode: 400,
      stage: "translate_fetch",
      retryable: false,
      details: { url: value }
    });
  }

  const translatedHost = `${source.hostname.replace(/-/g, "--").replace(/\./g, "-")}.translate.goog`;
  const translated = new URL(source.toString());
  translated.protocol = "https:";
  translated.host = translatedHost;
  translated.searchParams.set("_x_tr_sl", "auto");
  translated.searchParams.set("_x_tr_tl", "zh-TW");
  translated.searchParams.set("_x_tr_hl", "zh-TW");
  return translated.toString();
}

function isEligiblePublicUrl(url) {
  const hostname = String(url.hostname || "").toLowerCase();
  return ["http:", "https:"].includes(url.protocol)
    && !url.username
    && !url.password
    && hostname !== "localhost"
    && !hostname.endsWith(".local")
    && net.isIP(hostname) === 0;
}

function looksLikeChallenge(html) {
  const source = String(html || "").slice(0, 50_000).toLowerCase();
  return ["checking the site connection security", "just a moment", "checking your browser", "cf-challenge"]
    .some((needle) => source.includes(needle));
}

function requestText(url, headers, requestImpl) {
  if (requestImpl) return requestImpl(url, headers);
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode || 0,
        headers: { get: (name) => response.headers[String(name).toLowerCase()] || "" },
        text: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.setTimeout(25_000, () => request.destroy(new Error("timeout")));
    request.on("error", reject);
  });
}

module.exports = { buildGoogleTranslateUrl, fetchHomepageWithGoogleTranslate, isEligiblePublicUrl, looksLikeChallenge };
