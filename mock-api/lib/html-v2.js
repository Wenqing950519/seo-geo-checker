const { fetchHomepageWithBrowser } = require("./browser-fetch-v2");
const { assessCrawlQuality, chooseBetterResult, shouldRenderWithBrowser } = require("./crawl-quality");
const { AppError } = require("./errors");

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
  const jsonLd = extractJsonLd(source);
  const images = [...source.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  return {
    title: clean(matchFirst(source, /<title[^>]*>([\s\S]*?)<\/title>/i)),
    description: clean(metaContent(source, "name", "description")),
    h1: clean(stripHtml(matchFirst(source, /<h1[^>]*>([\s\S]*?)<\/h1>/i))),
    canonical: clean(linkHref(source, "canonical")),
    robots: clean(metaContent(source, "name", "robots")).toLowerCase(),
    googlebot: clean(metaContent(source, "name", "googlebot")).toLowerCase(),
    ogTitle: clean(metaContent(source, "property", "og:title")),
    ogDescription: clean(metaContent(source, "property", "og:description")),
    hasJsonLd: jsonLd.count > 0,
    jsonLd,
    imageCount: images.length,
    imagesWithAlt: images.filter((tag) => /\balt\s*=\s*["'][^"']+["']/i.test(tag)).length,
    headingLevels: [...source.matchAll(/<h([1-6])\b[^>]*>/gi)].map((match) => Number(match[1]))
  };
}

function metaContent(source, key, value) {
  const expected = String(value).toLowerCase();
  for (const tag of source.match(/<meta\b[^>]*>/gi) || []) {
    if (attributeValue(tag, key).toLowerCase() === expected) return attributeValue(tag, "content");
  }
  return "";
}

function linkHref(source, rel) {
  const expected = String(rel).toLowerCase();
  for (const tag of source.match(/<link\b[^>]*>/gi) || []) {
    if (attributeValue(tag, "rel").toLowerCase().split(/\s+/).includes(expected)) return attributeValue(tag, "href");
  }
  return "";
}

function attributeValue(tag, name) {
  const quoted = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  if (quoted) return quoted[2];
  const unquoted = tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return unquoted ? unquoted[1] : "";
}

function extractJsonLd(source) {
  const blocks = [...source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const types = new Set();
  let validCount = 0;
  let invalidCount = 0;
  for (const block of blocks) {
    try {
      const value = JSON.parse(block[1]);
      validCount += 1;
      collectSchemaTypes(value, types);
    } catch {
      invalidCount += 1;
    }
  }
  return { count: blocks.length, validCount, invalidCount, types: [...types] };
}

function collectSchemaTypes(value, types) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((item) => collectSchemaTypes(item, types));
  const type = value["@type"];
  if (Array.isArray(type)) type.forEach((item) => types.add(String(item)));
  else if (type) types.add(String(type));
  Object.values(value).forEach((item) => collectSchemaTypes(item, types));
}

function matchFirst(source, pattern) {
  const match = source.match(pattern);
  return match ? match[1] : "";
}

function clean(value) {
  return stripHtml(value).slice(0, 500);
}

async function fetchHomepage(url) {
  let httpResult = null;
  let browserResult = null;
  let httpError = null;
  let browserError = null;

  try {
    httpResult = decorateResult(await fetchHomepageWithHttp(url), url);
  } catch (error) {
    httpError = error;
  }

  const renderNeeded = !httpResult || shouldRenderWithBrowser(httpResult);
  if (renderNeeded && process.env.DISABLE_BROWSER_FETCH !== "true") {
    try {
      const rawBrowser = await fetchHomepageWithBrowser(url, httpError);
      browserResult = decorateResult({
        ...processHtml(rawBrowser.html, rawBrowser.fetchMethod),
        ...rawBrowser
      }, url);
    } catch (error) {
      browserError = error;
    }
  }

  const chosen = chooseBetterResult(httpResult, browserResult);
  if (!chosen) throw browserError || httpError || new AppError("Unable to fetch homepage", { stage: "fetch_homepage", retryable: true });

  const crawlQuality = assessCrawlQuality(chosen);
  if (!crawlQuality.scorable) {
    throw new AppError("首頁資料不足，無法產生可信分數", {
      statusCode: 422,
      stage: "crawl_quality",
      retryable: false,
      details: {
        crawlQuality,
        httpError: httpError?.message,
        browserError: browserError?.message,
        fetchMethod: chosen.fetchMethod
      }
    });
  }

  return {
    ...chosen,
    crawlQuality,
    initialHtml: httpResult?.html || "",
    initialText: httpResult?.text || "",
    initialTextLength: httpResult?.text?.length || 0,
    renderAttempted: renderNeeded,
    renderGain: browserResult && httpResult ? Math.max(0, browserResult.text.length - httpResult.text.length) : 0,
    renderError: browserError?.message || "",
    crawlDiagnostics: {
      http: httpResult ? assessCrawlQuality(httpResult) : { status: "failed", error: httpError?.message || "unknown" },
      browser: browserResult ? assessCrawlQuality(browserResult) : renderNeeded ? { status: "failed", error: browserError?.message || "unavailable" } : { status: "not_needed" },
      selectedMethod: chosen.fetchMethod
    }
  };
}

async function fetchHomepageWithHttp(url) {
  let response;
  try {
    response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache"
      },
      redirect: "follow"
    }, 20_000);
  } catch (error) {
    throw new AppError(`Failed to fetch homepage: ${error.name === "AbortError" ? "timeout" : error.message}`, {
      statusCode: 502, stage: "fetch_homepage", retryable: true, details: { url }
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
      statusCode: 400, stage: "fetch_homepage", retryable: false, details: { url, contentType }
    });
  }
  const html = await response.text();
  return {
    ...processHtml(html, "http"),
    statusCode: response.status,
    finalUrl: response.url || url,
    headers: { contentType, xRobotsTag: response.headers.get("x-robots-tag") || "" }
  };
}

function decorateResult(result, requestedUrl) {
  const finalUrl = result.finalUrl || requestedUrl;
  return {
    ...result,
    finalUrl,
    internalLinks: extractInternalLinks(result.html, finalUrl),
    crawlQuality: assessCrawlQuality(result)
  };
}

function extractInternalLinks(html, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const urls = [];
  const seen = new Set();
  for (const match of String(html || "").matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)) {
    try {
      const url = new URL(match[2], baseUrl);
      url.hash = "";
      if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) continue;
      const normalized = url.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      urls.push(normalized);
      if (urls.length >= 100) break;
    } catch { /* ignore malformed links */ }
  }
  return urls;
}

async function fetchRepresentativePages(urls, limit = 3) {
  const selected = [...new Set((urls || []).filter(Boolean))].slice(0, limit);
  const results = await Promise.allSettled(selected.map(async (url) => {
    const result = decorateResult(await fetchHomepageWithHttp(url), url);
    return {
      url,
      finalUrl: result.finalUrl,
      statusCode: result.statusCode,
      fetchMethod: result.fetchMethod,
      metadata: result.metadata,
      text: result.text.slice(0, 2500),
      textLength: result.text.length,
      crawlQuality: result.crawlQuality
    };
  }));
  return results.map((result, index) => result.status === "fulfilled" ? result.value : {
    url: selected[index],
    statusCode: 0,
    fetchMethod: "failed",
    text: "",
    textLength: 0,
    crawlQuality: { status: "failed", scorable: false, reason: result.reason?.message || "unknown" }
  });
}

function processHtml(html, fetchMethod) {
  if (!html || html.length < 100) {
    throw new AppError("Homepage HTML was empty or too short", {
      statusCode: 502, stage: "fetch_homepage", retryable: true, details: { fetchMethod, length: html.length }
    });
  }
  return { html, metadata: extractMetadata(html), text: stripHtml(html).slice(0, 8000), fetchMethod };
}

function looksClientRendered(result) {
  if (!result || result.text.length >= 500) return false;
  const source = String(result.html || "");
  return /<script\b[^>]+src=/i.test(source)
    && /<(?:div|main)\b[^>]+(?:id|class)=["'][^"']*(?:app|root|__next|nuxt)[^"']*["']/i.test(source);
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function shouldTryBrowserFallback(error) {
  if (!(error instanceof AppError) || process.env.DISABLE_BROWSER_FETCH === "true") return false;
  return error.stage === "fetch_homepage" && (error.retryable || error.details?.httpStatus === 401 || error.details?.httpStatus === 403);
}

module.exports = { assessCrawlQuality, extractInternalLinks, extractMetadata, fetchHomepage, fetchRepresentativePages, looksClientRendered, stripHtml };
