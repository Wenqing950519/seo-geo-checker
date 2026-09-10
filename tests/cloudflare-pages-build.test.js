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

// _redirects is shared by Cloudflare Pages and the B API Worker, whose assets
// directory is this same folder. A rule naming an absolute origin therefore also
// runs on that origin and redirects it to itself, so every rule stays path-only.
const rules = redirects.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
for (const rule of rules) {
  assert.doesNotMatch(
    rule, /\shttps?:\/\//,
    "_redirects is shared with the B API Worker; a cross-origin rule loops on that origin"
  );
}
assert.match(
  redirects, /^\/developers\/docs\s+\/developers-docs\.html\s+200$/m,
  "The canonical docs path must serve the docs page"
);
assert.match(
  redirects, /^\/developers-docs\s+\/developers\/docs\s+308$/m,
  "The legacy hyphenated docs path must keep working"
);

// The Console must be same-origin with the B API it calls, so its links are
// absolute. Every other developer link stays on the canonical slash form.
const CONSOLE_URL = "https://api.geocheck.lisheng.cv/developers/console";
for (const page of ["developers.html", "developers-docs.html", "developers-console.html"]) {
  const html = fs.readFileSync(output(page), "utf8");
  assert.doesNotMatch(
    html, /href="[^"]*\/developers-(console|docs)"/,
    `${page} must not link to a hyphenated developer path`
  );
  assert.doesNotMatch(
    html, /href="\/developers\/console"/,
    `${page} must link the Console at ${CONSOLE_URL}, which shares an origin with /v1/console`
  );
}
assert.ok(
  fs.readFileSync(output("developers.html"), "utf8").includes(CONSOLE_URL),
  "The developers page must link to the Console"
);

console.log("Cloudflare Pages artifact tests passed");
