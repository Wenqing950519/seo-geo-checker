const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const publicDir = path.join(root, "apps", "web", "public");
const dashboardDir = path.join(root, "apps", "web", "app");
const outputDir = path.join(root, "dist", "pages");

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.cpSync(publicDir, outputDir, { recursive: true });
// Pages needs a real root document. A shared _redirects root rewrite also runs
// inside the Developer Worker asset binding and shadows platform.lslabs.tw.
fs.copyFileSync(path.join(publicDir, "home.html"), path.join(outputDir, "index.html"));
fs.cpSync(dashboardDir, path.join(outputDir, "app"), { recursive: true });
// Host-specific routing must not enter the assets shared with the API Worker.
fs.copyFileSync(path.join(root, 'services/cloudflare/pages/worker.mjs'), path.join(outputDir, '_worker.js'));
fs.writeFileSync(path.join(outputDir, '_routes.json'), JSON.stringify({
  version: 1, include: ['/*'], exclude: ['/api/*','/app-api/*','/report/*','/v1/*','/internal/*']
}, null, 2) + '\n');

console.log(`Built Cloudflare Pages artifact: ${path.relative(root, outputDir)}`);
