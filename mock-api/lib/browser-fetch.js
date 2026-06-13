const path = require("path");
const { AppError } = require("./errors");

async function fetchHomepageWithBrowser(url, previousError) {
  const playwright = loadPlaywright();
  if (!playwright) {
    throw new AppError("Browser fallback is unavailable because Playwright is not installed", {
      statusCode: previousError?.statusCode || 502,
      stage: "browser_fetch",
      retryable: false,
      details: {
        previousError: previousError?.message,
        installHint: "Install playwright in the project or set PLAYWRIGHT_NODE_MODULES to a node_modules path."
      }
    });
  }

  let browser;
  try {
    browser = await playwright.chromium.launch({
      headless: true
    });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      locale: "zh-TW",
      viewport: { width: 1366, height: 900 }
    });
    const page = await context.newPage();
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 35_000
    });
    await page.waitForTimeout(1500);

    const html = await page.content();
    const title = await page.title().catch(() => "");
    if (looksLikeBotChallenge(html, title)) {
      throw new AppError("Browser fallback reached a bot protection or challenge page", {
        statusCode: 403,
        stage: "browser_fetch",
        retryable: false,
        details: {
          title,
          previousError: previousError?.message
        }
      });
    }
    if (!html || html.length < 100) {
      throw new AppError("Browser fallback returned empty or very short HTML", {
        statusCode: 502,
        stage: "browser_fetch",
        retryable: true,
        details: {
          title,
          length: html?.length || 0,
          previousError: previousError?.message
        }
      });
    }
    return {
      html,
      fetchMethod: "browser"
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Browser fallback failed: ${error.message}`, {
      statusCode: 502,
      stage: "browser_fetch",
      retryable: /timeout/i.test(error.message),
      details: {
        previousError: previousError?.message
      }
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function loadPlaywright() {
  const candidates = [
    "playwright",
    process.env.PLAYWRIGHT_NODE_MODULES
      ? path.join(process.env.PLAYWRIGHT_NODE_MODULES, "playwright")
      : null,
    "C:\\Users\\eason\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright"
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function looksLikeBotChallenge(html, title) {
  const source = `${title}\n${html}`.toLowerCase();
  return [
    "just a moment",
    "checking your browser",
    "cf-challenge",
    "cloudflare",
    "attention required",
    "captcha",
    "enable javascript and cookies"
  ].some((needle) => source.includes(needle));
}

module.exports = { fetchHomepageWithBrowser };
