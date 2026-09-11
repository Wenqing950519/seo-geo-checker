const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
execFileSync(process.execPath, ["scripts/cloudflare/build-pages-static.cjs"], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, ["scripts/cloudflare/build-dashboard-static.cjs"], { cwd: root, stdio: "inherit" });

const output = (...parts) => path.join(root, "dist", "pages", ...parts);
for (const file of [
  "home.html",
  "index.html",
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
assert.equal(
  fs.readFileSync(output("index.html"), "utf8"),
  fs.readFileSync(output("home.html"), "utf8"),
  "The Pages root must be a concrete home document, not a shared redirect rule"
);

const dashboardOutput = (...parts) => path.join(root, "dist", "dashboard", ...parts);
for (const file of ["index.html", "app.js", "app.css", "shared/api.js", "overview/overview-view.js"]) {
  assert.ok(fs.existsSync(dashboardOutput(file)), `Dashboard Pages artifact must include ${file}`);
}
const dashboardIndex = fs.readFileSync(dashboardOutput("index.html"), "utf8");
assert.match(dashboardIndex, /href="\/app\.css"/, "Dashboard deployment must serve assets from its root");
assert.match(dashboardIndex, /src="\/app\.js"/, "Dashboard deployment must serve its module from its root");
assert.match(dashboardIndex, /https:\/\/app\.lslabs\.tw\//, "Dashboard must declare its new canonical origin");

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
// Pages maps an extensionless path to its .html file, so a rule whose target is
// a .html file degrades into a redirect to the extensionless form — which the
// reverse rule then sends back. The docs therefore live at their canonical path
// as a real file, and only the legacy path needs a rule.
// The root is the exception: "/" has no extensionless form to bounce to.
for (const rule of rules.filter((entry) => !entry.startsWith("/ "))) {
  assert.doesNotMatch(
    rule, /\.html(\s|$)/,
    "A rule targeting a .html file becomes a redirect to its extensionless form and can loop"
  );
}
assert.ok(
  fs.existsSync(output("developers", "docs.html")),
  "The docs page must be a real file at its canonical /developers/docs path"
);
assert.ok(
  !fs.existsSync(output("developers-docs.html")),
  "The hyphenated docs file must not also exist; two copies drift"
);
assert.match(
  redirects, /^\/developers-docs\s+\/developers\/docs\s+308$/m,
  "The legacy hyphenated docs path must keep working"
);

// The Console must be same-origin with the B API it calls. On platform.lslabs.tw
// the canonical link is therefore root-relative and cannot drift to the legacy host.
const CONSOLE_PATH = "/console";
for (const page of ["developers.html", "developers/docs.html", "developers-console.html"]) {
  const html = fs.readFileSync(output(page), "utf8");
  assert.doesNotMatch(
    html, /href="[^"]*\/developers-(console|docs)"/,
    `${page} must not link to a hyphenated developer path`
  );
  assert.doesNotMatch(html, /href="\/developers\/console"/, `${page} must use the Platform Console path`);
}
assert.ok(
  fs.readFileSync(output("developers.html"), "utf8").includes(`href="${CONSOLE_PATH}"`),
  "The developers page must link to the Console"
);

console.log("Cloudflare Pages artifact tests passed");
