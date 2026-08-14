const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..", "..");

async function main() {
  if (process.env.DISABLE_BROWSER_FETCH === "true") {
    console.log("Browser fallback disabled; skipping Chromium installation.");
    return;
  }

  const playwrightCli = path.join(projectRoot, "node_modules", "playwright", "cli.js");
  const browserEnv = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "0" };
  const install = spawnSync(process.execPath, [playwrightCli, "install", "chromium", "--only-shell"], {
    cwd: projectRoot,
    env: browserEnv,
    stdio: "inherit"
  });

  if (install.error) throw install.error;
  if (install.status !== 0) {
    throw new Error(`Playwright Chromium installation failed with exit code ${install.status}`);
  }

  // Render's build container and its runtime container have different limits.
  // Installing the shell here is deterministic; launching it during build is not.
  // The crawler attempts the browser at request time and records/falls back when
  // the runtime cannot launch it.
  console.log("Playwright Chromium headless shell installed.");
}

main().catch((error) => {
  console.error("Playwright browser runtime setup failed:", error.message);
  process.exitCode = 1;
});
