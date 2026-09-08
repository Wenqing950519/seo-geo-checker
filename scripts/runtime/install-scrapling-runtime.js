const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(projectRoot, ".scrapling-runtime");
const requirements = path.join(projectRoot, "requirements.txt");

if (process.env.DISABLE_SCRAPLING_FETCH === "true") {
  console.log("Scrapling fallback disabled; skipping Python runtime installation.");
  process.exit(0);
}

const bootstrapPython = findPython();
if (!bootstrapPython) {
  console.error("Scrapling runtime setup failed: Python 3.10+ is required. Set DISABLE_SCRAPLING_FETCH=true only when this fallback is intentionally disabled.");
  process.exit(1);
}

const runtimePython = process.platform === "win32"
  ? path.join(runtimeRoot, "Scripts", "python.exe")
  : path.join(runtimeRoot, "bin", "python");

try {
  if (!fs.existsSync(runtimePython)) {
    execFileSync(bootstrapPython, ["-m", "venv", runtimeRoot], { stdio: "inherit" });
  }
  execFileSync(runtimePython, ["-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir", "-r", requirements], { stdio: "inherit" });
  console.log(`Scrapling runtime ready at ${runtimePython}`);
} catch (error) {
  console.error("Scrapling runtime setup failed:", error.message);
  process.exit(1);
}

function findPython() {
  const candidates = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];
  return candidates.find((candidate) => {
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    return probe.status === 0;
  });
}
