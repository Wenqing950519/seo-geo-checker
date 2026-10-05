import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { defaultAiEvidenceOutputDir } from "../../.agents/skills/geo-whitepaper-research/scripts/default-output-dir.mjs";

const script = fs.readFileSync(new URL("../../.agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs", import.meta.url), "utf8");
assert.match(script, /import \{ defaultAiEvidenceOutputDir as defaultOutputDir \} from "\.\/default-output-dir\.mjs"/, "AI evidence batch must take its default output dir from default-output-dir.mjs");

const dir = defaultAiEvidenceOutputDir(new Date("2026-09-25T01:02:03.456Z"));
assert.equal(dir, path.join("research", "outputs", "ai-evidence-2026-09-25T01-02-03"));

console.log("ai-evidence-batch-output-dir tests passed");
