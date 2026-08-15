const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { AppError } = require("./errors");
const { configureBrowserRuntime, hermeticBrowserPath } = require("./browser-runtime");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT_PATH = path.join(PROJECT_ROOT, "mock-api", "scripts", "scrapling-fetch.py");

async function fetchHomepageWithScrapling(url, previousError, options = {}) {
  const mode = options.mode || "http";
  const timeoutMs = boundedTimeout(options.timeoutMs ?? process.env.SCRAPLING_TIMEOUT_MS, 45_000);
  if (process.env.DISABLE_SCRAPLING_FETCH === "true") {
    throw scraplingError("Scrapling fallback is disabled", previousError, false, { mode });
  }
  if (!fs.existsSync(SCRIPT_PATH)) {
    throw scraplingError("Scrapling fetch script is unavailable", previousError, false, { mode });
  }

  let payload;
  try {
    payload = await (options.runner || runScrapling)({
      url,
      mode,
      timeoutMs,
      respectRobots: options.respectRobots ?? process.env.SCRAPLING_RESPECT_ROBOTS !== "false",
      env: options.env
    });
  } catch (error) {
    throw scraplingError(`Scrapling ${mode} fetch failed: ${error.message}`, previousError, isRetryable(error), { mode });
  }
  if (!payload || payload.ok !== true) {
    throw scraplingError(`Scrapling ${mode} fetch failed: ${payload?.error || "unknown error"}`, previousError, true, {
      mode,
      errorType: payload?.errorType || "unknown"
    });
  }
  if (!payload.html || payload.html.length < 100) {
    throw scraplingError(`Scrapling ${mode} fetch returned empty or very short HTML`, previousError, true, { mode, length: payload.html?.length || 0 });
  }
  return {
    html: payload.html,
    fetchMethod: `scrapling-${mode}`,
    statusCode: Number(payload.statusCode || 200),
    finalUrl: payload.finalUrl || url,
    headers: payload.headers || {},
    scraplingDiagnostics: { mode, timeoutMs, robots: payload.robots || { checked: false, allowed: null } }
  };
}

function runScrapling({ url, mode, timeoutMs, respectRobots = true, env = process.env }) {
  const python = resolvePython(env);
  const executablePath = resolvePlaywrightExecutable();
  const childEnv = {
    ...env,
    ...(executablePath ? { SCRAPLING_EXECUTABLE_PATH: executablePath } : {})
  };
  return new Promise((resolve, reject) => {
    const child = spawn(python, [SCRIPT_PATH], { env: childEnv, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => finish(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs + 5_000);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        child.kill();
        reject(error);
      } else resolve(value);
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 4_000_000) finish(new Error("response exceeded 4 MB"));
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (settled) return;
      try {
        const parsed = JSON.parse(stdout);
        return finish(null, parsed);
      } catch {
        return finish(new Error(stderr.trim() || `Scrapling process exited with code ${code}`));
      }
    });
    child.stdin.end(JSON.stringify({ url, mode, timeoutMs, respectRobots }));
  });
}

function resolvePython(env = process.env) {
  if (env.SCRAPLING_PYTHON_BIN) return env.SCRAPLING_PYTHON_BIN;
  const local = process.platform === "win32"
    ? path.join(PROJECT_ROOT, ".scrapling-runtime", "Scripts", "python.exe")
    : path.join(PROJECT_ROOT, ".scrapling-runtime", "bin", "python");
  return fs.existsSync(local) ? local : (process.platform === "win32" ? "python" : "python3");
}

function resolvePlaywrightExecutable() {
  // Must run before requiring Playwright: the package otherwise looks in the
  // machine-wide cache rather than this project's hermetic browser directory.
  configureBrowserRuntime();
  for (const candidate of ["playwright", process.env.PLAYWRIGHT_NODE_MODULES && path.join(process.env.PLAYWRIGHT_NODE_MODULES, "playwright")].filter(Boolean)) {
    try {
      const executablePath = require(candidate).chromium.executablePath();
      if (executablePath && fs.existsSync(executablePath)) return executablePath;
    } catch { /* the existing fallback records an unavailable browser separately */ }
  }
  return findHermeticHeadlessShell();
}

function findHermeticHeadlessShell() {
  const root = hermeticBrowserPath();
  if (!fs.existsSync(root)) return "";
  const expected = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";
  const queue = [root];
  while (queue.length) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      else if (entry.isFile() && entry.name === expected) return fullPath;
    }
  }
  return "";
}

function boundedTimeout(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(5_000, Math.min(numeric, 90_000)) : fallback;
}

function isRetryable(error) {
  return !/disabled|unavailable|not found|no module named/i.test(String(error?.message || ""));
}

function scraplingError(message, previousError, retryable, details) {
  return new AppError(message, {
    statusCode: previousError?.statusCode || 502,
    stage: "scrapling_fetch",
    retryable,
    details: { previousError: previousError?.message || "", ...details }
  });
}

module.exports = { fetchHomepageWithScrapling, resolvePython, runScrapling };
