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

// The public developer pages link to /developers/console and /developers/docs.
// Pages must resolve both, or a signed-in user lands on 404 after Google login.
assert.match(
  redirects, /^\/developers\/console\s+https:\/\/api\.geocheck\.lisheng\.cv\/developers\/console\s+308$/m,
  "The Console must redirect to the B API origin, which it shares with /v1/console"
);
assert.match(
  redirects, /^\/developers\/docs\s+\/developers-docs\.html\s+200$/m,
  "The canonical docs path must serve the docs page"
);
assert.match(
  redirects, /^\/developers-console\s+https:\/\/api\.geocheck\.lisheng\.cv\/developers\/console\s+308$/m,
  "The legacy hyphenated Console path must keep working"
);
assert.match(
  redirects, /^\/developers-docs\s+\/developers\/docs\s+308$/m,
  "The legacy hyphenated docs path must keep working"
);

// Every in-page developer link must use the canonical slash form.
for (const page of ["developers.html", "developers-docs.html", "developers-console.html"]) {
  const html = fs.readFileSync(output(page), "utf8");
  assert.doesNotMatch(
    html, /href="[^"]*\/developers-(console|docs)"/,
    `${page} must link to the canonical /developers/console and /developers/docs`
  );
}

console.log("Cloudflare Pages artifact tests passed");
