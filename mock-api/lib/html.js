function stripHtml(html) {
  return String(html || "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMetadata(html) {
  const source = String(html || "");
  const title = matchFirst(source, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = matchFirst(source, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || matchFirst(source, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i);
  const h1 = matchFirst(source, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(source);
  return {
    title: clean(title),
    description: clean(description),
    h1: clean(stripHtml(h1)),
    hasJsonLd
  };
}

function matchFirst(source, pattern) {
  const match = source.match(pattern);
  return match ? match[1] : "";
}

function clean(value) {
  return stripHtml(value).slice(0, 500);
}

const { fetchHomepageWithBrowser } = require("./browser-fetch");
const { AppError } = require("./errors");

async function fetchHomepage(url) {
  try {
    return await fetchHomepageWithHttp(url);
  } catch (error) {
    if (shouldTryBrowserFallback(error)) {
      const browserResult = await fetchHomepageWithBrowser(url, error);
      return processHtml(browserResult.html, browserResult.fetchMethod);
    }
    throw error;
  }
}

async function fetchHomepageWithHttp(url) {
  let response;
  try {
    response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache"
      },
      redirect: "follow"
    }, 20_000);
  } catch (error) {
    throw new AppError(`Failed to fetch homepage: ${error.name === "AbortError" ? "timeout" : error.message}`, {
      statusCode: 502,
      stage: "fetch_homepage",
      retryable: true,
      details: { url }
    });
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    throw new AppError(`Failed to fetch homepage: HTTP ${response.status}`, {
      statusCode: response.status >= 500 ? 502 : 400,
      stage: "fetch_homepage",
      retryable: response.status >= 500 || response.status === 429,
      details: { url, httpStatus: response.status }
    });
  }

  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new AppError(`Target URL did not return HTML (${contentType})`, {
      statusCode: 400,
      stage: "fetch_homepage",
      retryable: false,
      details: { url, contentType }
    });
  }

  const html = await response.text();
  return processHtml(html, "http");
}

function processHtml(html, fetchMethod) {
  if (!html || html.length < 100) {
    throw new AppError("Homepage HTML was empty or too short", {
      statusCode: 502,
      stage: "fetch_homepage",
      retryable: true,
      details: { fetchMethod, length: html.length }
    });
  }

  const metadata = extractMetadata(html);
  const text = stripHtml(html).slice(0, 8000);
  return { html, metadata, text, fetchMethod };
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function shouldTryBrowserFallback(error) {
  if (!(error instanceof AppError)) return false;
  if (process.env.DISABLE_BROWSER_FETCH === "true") return false;
  return error.stage === "fetch_homepage" && (
    error.retryable ||
    error.details?.httpStatus === 401 ||
    error.details?.httpStatus === 403
  );
}

module.exports = { extractMetadata, fetchHomepage, stripHtml };
