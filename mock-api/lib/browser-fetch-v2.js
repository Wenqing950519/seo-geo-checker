const path = require("path");
const { AppError } = require("./errors");
const { configureBrowserRuntime } = require("./browser-runtime");

configureBrowserRuntime();

async function fetchHomepageWithBrowser(url, previousError) {
  const playwright = loadPlaywright();
  if (!playwright) throw browserError("Playwright 瀏覽器執行環境不可用", previousError, false);

  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      locale: "zh-TW",
      timezoneId: "Asia/Taipei",
      viewport: { width: 1366, height: 900 },
      extraHTTPHeaders: { "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8" }
    });
    await context.route("**/*", async (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font"].includes(type)) return route.abort();
      return route.continue();
    });

    const page = await context.newPage();
    let response = null;
    let navigationError = null;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40_000 });
    } catch (error) {
      navigationError = error;
      if (!/timeout/i.test(error.message)) throw error;
    }
    await Promise.race([
      page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {}),
      page.waitForFunction(() => (document.body?.innerText || "").trim().length >= 300, null, { timeout: 8_000 }).catch(() => {})
    ]);
    await page.waitForTimeout(750);

    const settledPage = await waitForBotChallengeToClear(page);
    const { html, title, bodyTextLength, challengeWaitMs } = settledPage;
    if (looksLikeBotChallenge(html, title, bodyTextLength)) {
      throw new AppError("網站回傳了防機器人驗證頁，無法取得實際內容", {
        statusCode: 403,
        stage: "browser_challenge",
        retryable: false,
        details: { title, bodyTextLength, challengeWaitMs, previousError: previousError?.message }
      });
    }
    if (!html || html.length < 100) throw browserError("瀏覽器渲染後仍沒有取得有效 HTML", previousError, true);

    return {
      html,
      fetchMethod: "browser",
      statusCode: response?.status() || 200,
      finalUrl: page.url() || url,
      headers: {
        contentType: (await response?.allHeaders().catch(() => ({})))?.["content-type"] || "text/html",
        xRobotsTag: (await response?.allHeaders().catch(() => ({})))?.["x-robots-tag"] || ""
      },
      browserDiagnostics: { title, bodyTextLength, challengeWaitMs, previousError: previousError?.message || "", navigationError: navigationError?.message || "" }
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw browserError(`瀏覽器渲染失敗：${error.message}`, previousError, /timeout/i.test(error.message));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function loadPlaywright() {
  const candidates = [
    "playwright",
    process.env.PLAYWRIGHT_NODE_MODULES ? path.join(process.env.PLAYWRIGHT_NODE_MODULES, "playwright") : null,
    "C:\\Users\\eason\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright"
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* try next */ }
  }
  return null;
}

function looksLikeBotChallenge(html, title, bodyTextLength) {
  if (bodyTextLength > 1200) return false;
  const source = `${title}\n${String(html).slice(0, 50_000)}`.toLowerCase();
  return ["just a moment", "checking your browser", "cf-challenge", "attention required", "captcha", "enable javascript and cookies"]
    .some((needle) => source.includes(needle));
}

async function waitForBotChallengeToClear(page, options = {}) {
  const maxAttempts = Number.isInteger(options.maxAttempts) ? Math.max(0, options.maxAttempts) : 6;
  const intervalMs = Number.isFinite(options.intervalMs) ? Math.max(0, options.intervalMs) : 2_000;
  let snapshot = await readPageSnapshot(page);

  for (let attempt = 0; attempt < maxAttempts && looksLikeBotChallenge(snapshot.html, snapshot.title, snapshot.bodyTextLength); attempt += 1) {
    await page.waitForTimeout(intervalMs);
    snapshot = await readPageSnapshot(page);
    snapshot.challengeWaitMs = (attempt + 1) * intervalMs;
  }
  return snapshot;
}

async function readPageSnapshot(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const html = await page.content();
      const title = await page.title().catch(() => "");
      const bodyTextLength = await page.locator("body").innerText().then((text) => text.trim().length).catch(() => 0);
      return { html, title, bodyTextLength, challengeWaitMs: 0 };
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(250);
    }
  }
}

function browserError(message, previousError, retryable) {
  return new AppError(message, {
    statusCode: previousError?.statusCode || 502,
    stage: "browser_fetch",
    retryable,
    details: { previousError: previousError?.message || "" }
  });
}

module.exports = { fetchHomepageWithBrowser, looksLikeBotChallenge, waitForBotChallengeToClear };
