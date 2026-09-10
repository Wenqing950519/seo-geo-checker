const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
execFileSync(process.execPath, ["scripts/cloudflare/build-pages-static.cjs"], { cwd: root, stdio: "inherit" });

const output = (...parts) => path.join(root, "dist", "pages", ...parts);
for (const file of [
  "home.html",
  "privacy.html",
  "terms.html",
  "refund.html",
  "app/index.html",
  "app/app.js",
  "app/shared/api.js",
  "app/overview/overview-view.js"
]) {
  assert.ok(fs.existsSync(output(file)), `Pages artifact must include ${file}`);
}

const redirects = fs.readFileSync(output("_redirects"), "utf8");
assert.doesNotMatch(redirects, /^\/(privacy|terms|refund)\s/m, "Pages automatically maps extensionless HTML paths; duplicate redirects loop");

console.log("Cloudflare Pages artifact tests passed");
