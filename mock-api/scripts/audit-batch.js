const { loadEnvFiles } = require("../lib/env");
const { runRealLiteAudit } = require("../lib/real-lite-audit");

loadEnvFiles();

const urls = process.argv.slice(2);

if (!urls.length) {
  console.error("Usage: node mock-api/scripts/audit-batch.js <url> [url...]");
  process.exit(1);
}

async function main() {
  const results = [];
  for (const url of urls) {
    const started = Date.now();
    try {
      const report = await runRealLiteAudit(url);
      results.push({
        ok: true,
        url,
        elapsedSeconds: Math.round((Date.now() - started) / 1000),
        score: report.audit?.score?.value,
        label: report.audit?.score?.label,
        provider: report.provider,
        model: report.model,
        attempts: report.attempts,
        latencyMs: report.latencyMs,
        fetchMethod: report.homepage?.fetchMethod || "unknown",
        textLength: report.homepage?.textLength || 0,
        perceivedCategory: report.audit?.positioning?.perceived_category_zh || "",
        summary: report.audit?.score?.summary_zh || "",
        scoringBasis: report.audit?.score?.scoring_basis_zh || ""
      });
    } catch (error) {
      results.push({
        ok: false,
        url,
        elapsedSeconds: Math.round((Date.now() - started) / 1000),
        error: error.message,
        stage: error.stage,
        retryable: Boolean(error.retryable),
        details: error.details
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
