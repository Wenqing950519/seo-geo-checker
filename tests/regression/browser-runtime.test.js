const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../../package.json");
const { configureBrowserRuntime, hermeticBrowserPath } = require("../../packages/crawler/browser-runtime.js");
const installScript = fs.readFileSync(path.resolve(__dirname, "../../scripts/runtime/install-browser-runtime.js"), "utf8");

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "geocheck-browser-runtime-"));
try {
  const env = {};
  const expectedPath = hermeticBrowserPath(temporaryRoot);
  assert.equal(configureBrowserRuntime({ env, projectRoot: temporaryRoot }).hermeticInstalled, false);
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, undefined);

  fs.mkdirSync(expectedPath, { recursive: true });
  const configured = configureBrowserRuntime({ env, projectRoot: temporaryRoot });
  assert.equal(configured.hermeticInstalled, true);
  assert.equal(configured.browserPath, expectedPath);
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, "0");

  const explicitEnv = { PLAYWRIGHT_BROWSERS_PATH: "D:\\shared-playwright" };
  configureBrowserRuntime({ env: explicitEnv, projectRoot: temporaryRoot });
  assert.equal(explicitEnv.PLAYWRIGHT_BROWSERS_PATH, "D:\\shared-playwright");

  assert.equal(
    packageJson.scripts.postinstall,
    "node mock-api/scripts/install-browser-runtime.js && node mock-api/scripts/install-scrapling-runtime.js"
  );
  assert.match(installScript, /install", "chromium", "--only-shell"/);
  assert.doesNotMatch(installScript, /chromium\.launch/);
  console.log("browser runtime tests passed");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
