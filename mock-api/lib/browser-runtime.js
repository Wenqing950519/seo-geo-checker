const fs = require("node:fs");
const path = require("node:path");

function hermeticBrowserPath(projectRoot = path.resolve(__dirname, "..", "..")) {
  return path.join(projectRoot, "node_modules", "playwright-core", ".local-browsers");
}

function configureBrowserRuntime({ env = process.env, projectRoot } = {}) {
  const browserPath = hermeticBrowserPath(projectRoot);
  const hermeticInstalled = fs.existsSync(browserPath);
  if (!env.PLAYWRIGHT_BROWSERS_PATH && hermeticInstalled) {
    env.PLAYWRIGHT_BROWSERS_PATH = "0";
  }
  return {
    browserPath,
    hermeticInstalled,
    playwrightBrowsersPath: env.PLAYWRIGHT_BROWSERS_PATH || ""
  };
}

module.exports = { configureBrowserRuntime, hermeticBrowserPath };
