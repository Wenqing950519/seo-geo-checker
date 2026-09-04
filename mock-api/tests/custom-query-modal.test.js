const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const home = fs.readFileSync(path.resolve(__dirname, "../public/home.html"), "utf8");

// Leaving the modal questions blank must keep the evidence-backed, site-specific
// query planner enabled. A page-level demo question must never become an audit's
// default query for every submitted website.
assert.doesNotMatch(home, /台北新莊有推薦適合帶筆電工作/);
assert.doesNotMatch(home, /const QUESTION_BANK_[12]/);
assert.doesNotMatch(home, /detectIndustryHint/);
assert.doesNotMatch(home, /伺服器連線正常/);
assert.match(home, /const customQueries = \[q1, q2\]\.filter\(Boolean\);/);
assert.match(home, /customQueries\.length \? customQueries : undefined/);
assert.match(home, /留空.*依網站內容/);

console.log("custom query modal tests passed");
