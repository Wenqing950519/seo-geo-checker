const fs = require("fs");
const path = require("path");

const LEDGER_FILE = path.resolve(__dirname, "..", "usage-events.jsonl");
const MAX_EVENTS = 2000;

function recordAiUsage(event) {
  const normalized = normalizeEvent(event);
  fs.appendFileSync(LEDGER_FILE, `${JSON.stringify(normalized)}\n`, "utf8");
  return normalized;
}

function getUsageSummary({ limit = 40 } = {}) {
  const events = readEvents();
  const totals = events.reduce((acc, event) => mergeEvent(acc, event), emptyTotals());
  const byProvider = {};
  for (const event of events) {
    const key = `${event.provider}:${event.model}`;
    byProvider[key] = mergeEvent(byProvider[key] || { provider: event.provider, model: event.model, ...emptyTotals() }, event);
  }
  return {
    generatedAt: new Date().toISOString(), ledgerFile: path.basename(LEDGER_FILE),
    totals: finalizeTotals(totals), byProvider: Object.values(byProvider).map(finalizeTotals),
    recentEvents: events.slice(-Math.max(1, Math.min(Number(limit) || 40, 200))).reverse()
  };
}

function readEvents() {
  if (!fs.existsSync(LEDGER_FILE)) return [];
  return fs.readFileSync(LEDGER_FILE, "utf8").split(/\r?\n/).filter(Boolean).slice(-MAX_EVENTS).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function normalizeEvent(event = {}) {
  const provider = String(event.provider || "unknown"); const inputTokens = safeNumber(event.inputTokens); const outputTokens = safeNumber(event.outputTokens);
  const totalTokens = safeNumber(event.totalTokens) || inputTokens + outputTokens; const rates = getRates(provider);
  const costConfigured = rates.input !== null || rates.output !== null || rates.request !== null;
  const estimatedCostUsd = (inputTokens / 1_000_000) * (rates.input || 0) + (outputTokens / 1_000_000) * (rates.output || 0) + (rates.request || 0);
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`, occurredAt: new Date().toISOString(), provider, model: String(event.model || "unknown"), operation: String(event.operation || "unknown"), status: event.status === "success" ? "success" : "error", inputTokens, outputTokens, totalTokens, estimatedCostUsd: round(estimatedCostUsd, 8), costConfigured, latencyMs: safeNumber(event.latencyMs), errorStage: event.errorStage ? String(event.errorStage) : undefined };
}

function mergeEvent(totals, event) { totals.requests += 1; totals.successfulRequests += event.status === "success" ? 1 : 0; totals.inputTokens += event.inputTokens; totals.outputTokens += event.outputTokens; totals.totalTokens += event.totalTokens; totals.estimatedCostUsd += event.estimatedCostUsd || 0; totals.costConfigured = totals.costConfigured || event.costConfigured; return totals; }
function getRates(provider) { const prefix = provider === "gemini" ? "GEMINI" : provider === "perplexity" ? "PERPLEXITY" : "AI"; return { input: envRate(`${prefix}_INPUT_USD_PER_1M_TOKENS`), output: envRate(`${prefix}_OUTPUT_USD_PER_1M_TOKENS`), request: envRate(`${prefix}_USD_PER_REQUEST`) }; }
function envRate(name) { const value = process.env[name]; if (value === undefined || value === "") return null; const rate = Number(value); return Number.isFinite(rate) && rate >= 0 ? rate : null; }
function emptyTotals() { return { requests: 0, successfulRequests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, costConfigured: false }; }
function finalizeTotals(totals) { return { ...totals, estimatedCostUsd: round(totals.estimatedCostUsd, 8), successRate: totals.requests ? round(totals.successfulRequests / totals.requests * 100, 1) : 0 }; }
function safeNumber(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0; }
function round(value, digits) { return Number(value.toFixed(digits)); }

module.exports = { getUsageSummary, recordAiUsage };
