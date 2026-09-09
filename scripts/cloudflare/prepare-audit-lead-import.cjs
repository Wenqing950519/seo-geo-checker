const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const source = path.resolve(root, "mock-api", "leads.jsonl");
const outputIndex = process.argv.indexOf("--emit-sql");
const output = outputIndex >= 0 ? path.resolve(root, process.argv[outputIndex + 1] || "") : null;

if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw new Error("--emit-sql requires a relative output path");
if (!fs.existsSync(source)) {
  console.log(JSON.stringify({ event: "audit_lead_import_dry_run", source_exists: false, accepted: 0 }));
  process.exit(0);
}

const rows = fs.readFileSync(source, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return normalize(JSON.parse(line)); }
  catch { throw new Error(`Invalid legacy lead JSONL line ${index + 1}`); }
});
const digest = crypto.createHash("sha256").update(rows.map((row) => JSON.stringify(row)).join("\n")).digest("hex");
const preview = rows.slice(0, 3).map((row) => ({
  lead_id: row.lead_id,
  email_sha256_prefix: crypto.createHash("sha256").update(row.email).digest("hex").slice(0, 12),
  site_host: new URL(row.site_url).hostname,
  created_at: row.created_at
}));
console.log(JSON.stringify({ event: "audit_lead_import_dry_run", source: "mock-api/leads.jsonl", accepted: rows.length, sha256: digest, preview }, null, 2));

if (output) {
  const sql = ["BEGIN;", ...rows.map(insertSql), "COMMIT;", ""].join("\n");
  fs.writeFileSync(output, sql, "utf8");
  console.log(JSON.stringify({ event: "audit_lead_import_sql_written", output: path.relative(root, output), sha256: crypto.createHash("sha256").update(sql).digest("hex") }));
}

function normalize(value) {
  const siteUrl = new URL(String(value.site || "").trim());
  if (!['http:', 'https:'].includes(siteUrl.protocol)) throw new Error("lead site must use http(s)");
  const email = String(value.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("lead email is invalid");
  const createdAt = new Date(value.createdAt || Date.now());
  if (Number.isNaN(createdAt.getTime())) throw new Error("lead createdAt is invalid");
  return {
    lead_id: String(value.id || crypto.randomUUID()), name: String(value.name || "").trim().slice(0, 100), email,
    site_url: siteUrl.toString(), need: String(value.need || "").trim().slice(0, 1000), interest: String(value.interest || "diagnostic").slice(0, 80),
    source: String(value.source || "website").slice(0, 80), report_id: String(value.reportId || "").slice(0, 120),
    consent_version: String(value.consentVersion || "legacy-import"), consented_at: new Date(value.consentedAt || createdAt).toISOString(), created_at: createdAt.toISOString()
  };
}

function quote(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function insertSql(row) {
  return `INSERT OR IGNORE INTO audit_leads (lead_id, name, email, site_url, need, interest, source, report_id, consent_version, consented_at, created_at) VALUES (${Object.values(row).map(quote).join(", ")});`;
}
