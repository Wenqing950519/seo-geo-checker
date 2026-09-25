import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { defaultRulesOutputDir } from "../../.agents/skills/geo-whitepaper-research/scripts/default-output-dir.mjs";

const script = fs.readFileSync(new URL("../../.agents/skills/geo-whitepaper-research/scripts/run-rules-batch.mjs", import.meta.url), "utf8");
assert.match(script, /import \{ defaultRulesOutputDir as defaultOutputDir \} from "\.\/default-output-dir\.mjs"/, "Rules batch must take its default output dir from default-output-dir.mjs");

const dir = defaultRulesOutputDir(new Date("2026-09-25T01:02:03.456Z"));
assert.equal(dir, path.join("research", "outputs", "2026-09-25T01-02-03"));

console.log("rules-batch-output-dir tests passed");
