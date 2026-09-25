import path from "node:path";

function stamp(now) { return now.toISOString().replace(/[:.]/g, "-").slice(0, 19); }

export function defaultAiEvidenceOutputDir(now = new Date()) { return path.join("research", "outputs", `ai-evidence-${stamp(now)}`); }
export function defaultRulesOutputDir(now = new Date()) { return path.join("research", "outputs", stamp(now)); }
