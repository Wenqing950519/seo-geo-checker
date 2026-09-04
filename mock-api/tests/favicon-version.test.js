const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const sources = [
  "mock-api/public/home.html",
  "mock-api/public/brand.html",
  "mock-api/public/whitepaper.html",
  "mock-api/server.js"
].map((relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8"));

for (const source of sources) {
  assert.match(source, /href="\/favicon\.svg\?v=radar-20260904"/);
  assert.match(source, /href="\/favicon\.png\?v=radar-20260904"/);
}

console.log("favicon version tests passed");
