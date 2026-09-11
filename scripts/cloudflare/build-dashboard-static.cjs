const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const dashboardDir = path.join(root, "apps", "web", "app");
const outputDir = path.join(root, "dist", "dashboard");

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.cpSync(dashboardDir, outputDir, { recursive: true });

const indexPath = path.join(outputDir, "index.html");
const index = fs.readFileSync(indexPath, "utf8")
  .replace('href="/app/app.css"', 'href="/app.css"')
  .replace('src="/app/app.js"', 'src="/app.js"');
fs.writeFileSync(indexPath, index);

console.log(`Built Dashboard Pages artifact: ${path.relative(root, outputDir)}`);
