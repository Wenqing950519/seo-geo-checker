const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const sources = [
  "apps/web/public/home.html",
  "apps/web/public/brand.html",
  "apps/web/public/whitepaper.html",
  "apps/web/public/developers.html",
  "apps/web/public/developers/docs.html",
  "apps/web/public/developers-console.html",
  "services/api/server.js"
].map((relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8"));

for (const source of sources) {
  assert.match(source, /href="\/favicon\.svg\?v=radar-20260904"/);
  assert.match(source, /href="\/favicon\.png\?v=radar-20260904"/);
}

console.log("favicon version tests passed");
