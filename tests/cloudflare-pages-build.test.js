const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
execFileSync(process.execPath, ["scripts/cloudflare/build-pages-static.cjs"], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, ["scripts/cloudflare/build-dashboard-static.cjs"], { cwd: root, stdio: "inherit" });

const output = (...parts) => path.join(root, "dist", "pages", ...parts);
assert.ok(fs.existsSync(output("404.html")), "Unknown Pages routes must return 404");
assert.equal(fs.readFileSync(output("_worker.js"), "utf8"), fs.readFileSync(path.join(root, "services/cloudflare/pages/worker.mjs"), "utf8"));
assert.deepEqual(JSON.parse(fs.readFileSync(output("_routes.json"), "utf8")).exclude, ["/api/*", "/app-api/*", "/report/*", "/v1/*", "/internal/*"]);
assert.ok(!fs.existsSync(path.join(root, "apps/web/public/_worker.js")), "Pages routing lives in the build output, never in the static asset directory");
for (const file of [
  "home.html",
  "index.html",
  "privacy.html",
  "terms.html",
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
assert.match(redirects, /^\/home\s+\/\s+301$/m, "GeoCheck /home must permanently redirect to /");
assert.match(redirects, /^\/home\/\s+\/\s+301$/m, "GeoCheck /home/ must permanently redirect to /");
assert.doesNotMatch(redirects, /^\/(privacy|terms|refund)\s/m, "Pages automatically maps extensionless HTML paths; duplicate redirects loop");

// _redirects configures Cloudflare Pages only since the Platform code moved to ls-labs (LSL-D-009), so a
// cross-origin rule is allowed - but only to the Platform host, which is where the removed pages went.
const rules = redirects.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
for (const rule of rules) {
  const [, destination] = rule.split(/\s+/);
  assert.ok(
    !/^https?:\/\//.test(destination) || destination.startsWith("https://platform.lslabs.tw/"),
    `_redirects may only send people to platform.lslabs.tw: ${rule}`
  );
}
// Pages maps an extensionless path to its .html file, so a rule whose target is
// a .html file degrades into a redirect to the extensionless form — which the
// reverse rule then sends back. The Platform pages no longer exist here, so each removed path
// redirects straight to a real path on platform.lslabs.tw.
// The root is the exception: "/" has no extensionless form to bounce to.
for (const rule of rules.filter((entry) => !entry.startsWith("/ "))) {
  const [, destination] = rule.split(/\s+/);
  assert.doesNotMatch(
    destination, /\.html$/,
    "A rule targeting a .html file becomes a redirect to its extensionless form and can loop"
  );
}
// The Platform pages left this artifact (LSL-D-009). Every removed path must still land on its page at
// platform.lslabs.tw, and none of the files may come back.
const platformRedirects = [
  ["/developers", "/"], ["/developers/", "/"], ["/developers.html", "/"],
  ["/developers/docs", "/docs"], ["/developers/docs/", "/docs"], ["/developers/docs.html", "/docs"], ["/developers-docs", "/docs"],
  ["/developers-console", "/console"], ["/developers-console.html", "/console"],
  ["/developers/console", "/console"], ["/developers/console/", "/console"],
  ...["pricing", "privacy", "refund", "terms", "promotions"].flatMap((page) => [
    [`/platform/${page}`, `/${page}`], [`/platform/${page}/`, `/${page}`], [`/platform/${page}.html`, `/${page}`]
  ]),
  ["/platform-sitemap.xml", "/sitemap.xml"], ["/platform-robots.txt", "/robots.txt"]
];
for (const [from, to] of platformRedirects) {
  const rule = `${from} https://platform.lslabs.tw${to} 308`;
  assert.ok(rules.includes(rule), `_redirects must keep: ${rule}`);
}
for (const removed of [
  "developers.html", "developers-console.html", "developers/docs.html", "developers-docs.html",
  "platform/pricing.html", "platform/privacy.html", "platform/refund.html", "platform/terms.html",
  "platform/promotions.html", "platform-sitemap.xml", "platform-robots.txt"
]) {
  assert.ok(!fs.existsSync(output(removed)), `${removed} moved to ls-labs products/platform and must not be published here`);
}

const sitemap = fs.readFileSync(output("sitemap.xml"), "utf8");
for (const route of ["privacy", "terms"]) {
  assert.ok(!sitemap.includes(`https://geocheck.lslabs.tw/${route}`), `${route} must stay out of the sitemap`);
  const html = fs.readFileSync(output(`${route}.html`), "utf8");
  assert.match(html, /<meta name="robots" content="noindex,follow">/, `${route} must be noindex,follow`);
  assert.match(html, new RegExp(`<link rel="canonical" href="https://geocheck\\.lslabs\\.tw/${route}">`));
}
for (const route of ["whitepaper"]) {
  const html = fs.readFileSync(output(`${route}.html`), "utf8");
  assert.match(html, new RegExp(`<link rel="canonical" href="https://geocheck\\.lslabs\\.tw/${route}">`));
}
const whitepaper = fs.readFileSync(output("whitepaper.html"), "utf8");
assert.match(whitepaper, /src="\/assets\/dashboard-banner\.webp"/, "Whitepaper must use the optimized dashboard banner");
assert.ok(fs.statSync(output("assets", "dashboard-banner.webp")).size < 1_000_000, "Dashboard banner must stay below 1 MB");
assert.match(
  fs.readFileSync(output("home.html"), "utf8"),
  /<!--email_off--><a href="mailto:me@lslabs\.tw">聯絡我們<\/a><!--\/email_off-->/,
  "Cloudflare must not rewrite the public contact link into an email-protection crawl URL"
);

// The Console same-origin and hyphenated-path checks moved to ls-labs tests/platform/public-surface.test.js.

console.log("Cloudflare Pages artifact tests passed");
