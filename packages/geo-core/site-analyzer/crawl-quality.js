function assessCrawlQuality(result = {}) {
  const metadata = result.metadata || {};
  const textLength = String(result.text || "").trim().length;
  const statusCode = Number(result.statusCode || 0);
  const signals = {
    title: hasText(metadata.title),
    description: hasText(metadata.description),
    h1: hasText(metadata.h1),
    canonical: hasText(metadata.canonical),
    text: textLength >= 120
  };
  const semanticCount = [signals.title, signals.description, signals.h1].filter(Boolean).length;
  const reachable = statusCode > 0 && statusCode < 400;
  const scorable = reachable && textLength >= 120 && semanticCount >= 1;
  const complete = scorable && textLength >= 500 && semanticCount >= 2;
  const coverage = Math.round(([
    signals.title,
    signals.description,
    signals.h1,
    signals.canonical,
    textLength >= 500
  ].filter(Boolean).length / 5) * 100);

  return {
    status: complete ? "complete" : scorable ? "partial" : "insufficient",
    scorable,
    coverage,
    textLength,
    semanticCount,
    signals,
    reason: !reachable
      ? "homepage_unreachable"
      : textLength < 120
        ? "insufficient_readable_text"
        : semanticCount < 1
          ? "missing_semantic_identity"
          : complete
            ? "sufficient_evidence"
            : "partial_evidence"
  };
}

function shouldRenderWithBrowser(result = {}) {
  const quality = assessCrawlQuality(result);
  const html = String(result.html || "");
  const hydrationShell = /<script\b[^>]+src=/i.test(html)
    && /<(?:div|main)\b[^>]+(?:id|class)=["'][^"']*(?:app|root|__next|nuxt)[^"']*["']/i.test(html);
  return !quality.scorable || quality.status === "partial" || hydrationShell;
}

function chooseBetterResult(httpResult, browserResult) {
  if (!httpResult) return browserResult;
  if (!browserResult) return httpResult;
  const httpQuality = assessCrawlQuality(httpResult);
  const browserQuality = assessCrawlQuality(browserResult);
  if (browserQuality.scorable !== httpQuality.scorable) return browserQuality.scorable ? browserResult : httpResult;
  if (browserQuality.coverage !== httpQuality.coverage) return browserQuality.coverage > httpQuality.coverage ? browserResult : httpResult;
  return browserQuality.textLength > httpQuality.textLength ? browserResult : httpResult;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

module.exports = { assessCrawlQuality, chooseBetterResult, shouldRenderWithBrowser };
