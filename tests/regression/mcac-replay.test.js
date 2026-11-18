const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const cli = path.join(root, "scripts/mcac/replay.cjs");
const example = path.join(root, "packages/geo-core/mcac/examples/noodle-shop.json");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mcac-replay-"));
const custom = path.join(temp, "input.json");
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: temp, encoding: "utf8" });

function recalculate(input) {
  fs.writeFileSync(custom, JSON.stringify(input));
  const output = run(custom);
  assert.equal(output.status, 0, output.stderr);
  return JSON.parse(output.stdout);
}

try {
  const defaultRun = run();
  assert.equal(defaultRun.status, 0, defaultRun.stderr);
  const complete = JSON.parse(defaultRun.stdout);
  assert.equal(complete.method_version, "0.2.0");
  assert.equal(complete.score.method, "exposure_funnel_v1");
  assert.deepEqual([complete.mention.hits, complete.mention.n, complete.citation.n, complete.score.value], [1, 2, 4, 86]);

  const input = JSON.parse(fs.readFileSync(example, "utf8"));
  assert.deepEqual(recalculate(input), complete);
  const redirected = structuredClone(input);
  const contact = redirected.probes[0].citations[0];
  redirected.probes[0].citations = ["https://redirect.example/source"];
  redirected.resolvedUrls = { "https://redirect.example/source": contact };
  assert.deepEqual(recalculate(redirected), complete);

  const second = input.probes[1];
  Object.assign(second, { status: "failed", answer: "", citations: [] });
  const three = recalculate(input);
  assert.deepEqual([three.mention.hits, three.mention.n, three.citation.n, three.score.value], [1, 1, 3, 100]);
  const unknown = recalculate({ ...input, probes: [] });
  assert.equal(unknown.mention.flag, "unknown");
  assert.equal(unknown.score.value, null);
  assert.equal(unknown.score.status, "unknown");

  for (const invalid of [
    {},
    { ...input, methodVersion: "9.0.0" },
    { ...input, siteHost: "https://noodle-shop.example/path" },
    { ...input, truth: { phone: "02-0000-0000" } },
    { ...input, probes: [{ ...second, status: "maybe" }] },
    { ...input, probes: [{ ...input.probes[0], status: "failed" }] },
    { ...input, probes: [{ ...input.probes[0], citations: null }] },
    { ...input, probes: [{ ...input.probes[0], citations: ["https:missing-slashes"] }] },
    { ...input, probes: [input.probes[0], input.probes[0]] },
    { ...input, probes: [...input.probes, { ...input.probes[0], id: "d3" }] }
  ]) {
    fs.writeFileSync(custom, JSON.stringify(invalid));
    const bad = run(custom);
    assert.notEqual(bad.status, 0);
    assert.equal(bad.stdout, "");
    assert.ok(bad.stderr.trim().length > 0);
  }
  fs.writeFileSync(custom, "{");
  assert.notEqual(run(custom).status, 0);
} finally {
  if (fs.existsSync(custom)) fs.unlinkSync(custom);
  fs.rmdirSync(temp);
}

console.log("MCAC offline replay tests passed");
