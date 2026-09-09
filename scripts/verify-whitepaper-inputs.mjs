import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const rootDir = process.cwd();

console.log('=== Verifying Whitepaper H2-2026 Datasets ===\n');

// Helper to parse simple CSV
function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  const lines = content.split(/\r?\n/);
  const header = lines[0].split(',').map(h => h.replace(/^\ufeff/, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // Handle quotes in simple csv
    const cells = [];
    let inQuote = false;
    let current = '';
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    const obj = {};
    for (let h = 0; h < header.length; h++) {
      obj[header[h]] = (cells[h] || '').replace(/^"|"$/g, '').trim();
    }
    rows.push(obj);
  }
  return { header, rows };
}

// 1. Verify 70 Reviewed Cohort Registry
const reg70Path = path.join(rootDir, 'research/inputs/xinyi-restaurants-h2-2026/xinyi-70.cohort_registry.reviewed.csv');
assert(fs.existsSync(reg70Path), 'xinyi-70.cohort_registry.reviewed.csv does not exist');
const reg70 = parseCsv(reg70Path);
console.log(`1. Checking Cohort Registry: ${reg70.rows.length} rows`);
assert.equal(reg70.rows.length, 70, 'Registry must contain exactly 70 candidates');

let eligibleCount = 0;
let excludedCount = 0;

for (const r of reg70.rows) {
  assert(r.candidate_id, 'candidate_id missing');
  assert(r.candidate_name, 'candidate_name missing');
  assert.equal(r.eligibility_reviewer, 'eason', 'eligibility_reviewer must be eason');
  assert.equal(r.eligibility_reviewed_at, '2026-09-09', 'eligibility_reviewed_at must be 2026-09-09');
  assert(r.evidence_urls, `evidence_urls missing for ${r.candidate_name}`);

  if (r.cohort_status === 'eligible') {
    eligibleCount++;
    assert.equal(r.eligibility_decision, 'include');
    assert.equal(r.baseline_active_status, 'operating');
    assert(r.notes.includes('地址：'), `Address missing in notes for ${r.candidate_name}`);
  } else if (r.cohort_status === 'excluded') {
    excludedCount++;
    assert.equal(r.eligibility_decision, 'exclude');
    assert(r.cohort_exclusion_reason, `cohort_exclusion_reason missing for excluded candidate ${r.candidate_name}`);
  } else {
    assert.fail(`Invalid cohort_status: ${r.cohort_status} for ${r.candidate_name}`);
  }
}
assert.equal(eligibleCount, 63, 'Must have exactly 63 eligible candidates');
assert.equal(excludedCount, 7, 'Must have exactly 7 excluded candidates');
console.log(`   [PASS] 63 eligible, 7 excluded (all with explicit exclusion reasons).\n`);

// 2. Verify Reviewed Entity Master
const master70Path = path.join(rootDir, 'research/inputs/xinyi-restaurants-h2-2026/xinyi-70.entity_master.reviewed.csv');
assert(fs.existsSync(master70Path), 'xinyi-70.entity_master.reviewed.csv does not exist');
const master70 = parseCsv(master70Path);
console.log(`2. Checking Reviewed Entity Master: ${master70.rows.length} rows`);
assert.equal(master70.rows.length, 70, 'Entity master must contain exactly 70 records');

let sharedDomainCount = 0;
for (const r of master70.rows) {
  assert(r.store_id.startsWith('XY-'), `store_id invalid: ${r.store_id}`);
  assert(r.brand_id.startsWith('BR-'), `brand_id invalid: ${r.brand_id}`);
  assert(r.official_name_zh, `official_name_zh missing for ${r.store_id}`);
  assert.equal(r.district, '信義區');
  assert.equal(r.reviewed_by, 'eason');
  assert.equal(r.reviewed_at, '2026-09-09');

  if (r.shared_domain_flag === 'true') {
    sharedDomainCount++;
    assert(r.owned_urls, `Shared domain entity ${r.official_name_zh} (${r.store_id}) MUST have non-empty owned_urls!`);
  }
  if (r.include_status === 'excluded') {
    assert(r.exclusion_reason_code, `exclusion_reason_code missing for excluded store ${r.store_id}`);
  }
}
console.log(`   [PASS] Shared domain entities (${sharedDomainCount}) all have exact owned_urls.`);
console.log(`   [PASS] Entity Master schema verified.\n`);

// 3. Verify 49 Deduplicated Root Domains for 63 Eligible Candidates
const sitesPath = path.join(rootDir, 'research/inputs/xinyi-restaurants-h2-2026/xinyi-49.sites.approved.csv');
assert(fs.existsSync(sitesPath), 'xinyi-49.sites.approved.csv does not exist');
const sites = parseCsv(sitesPath);
console.log(`3. Checking Deduplicated Sites List: ${sites.rows.length} rows`);
assert.equal(sites.rows.length, 49, 'Sites list must contain exactly 49 root domains');

const uniqueDomains = new Set();
for (const r of sites.rows) {
  assert(r.root_domain, 'root_domain is missing');
  assert(r.url, `URL is missing for ${r.root_domain}`);
  assert(!uniqueDomains.has(r.root_domain), `Duplicate root domain found: ${r.root_domain}`);
  uniqueDomains.add(r.root_domain);
  assert.equal(r.include_in_batch, 'TRUE');
}
console.log(`   [PASS] All 49 root domains are unique and non-empty.\n`);

// 4. Verify Frozen Cohort Query Set
const qsPath = path.join(rootDir, 'research/inputs/xinyi-restaurants-h2-2026/query-set.xinyi-dining-h2-2026.approved.json');
assert(fs.existsSync(qsPath), 'query-set.xinyi-dining-h2-2026.approved.json does not exist');
const qs = JSON.parse(fs.readFileSync(qsPath, 'utf8'));
console.log(`4. Checking Approved Query Set`);
assert.equal(qs.review_status, 'approved', 'review_status must be approved');
assert.equal(qs.query_set_version, 'xinyi-dining-2026h2-v2.0', 'query_set_version must be pinned');
assert.equal(qs.reviewed_by, 'eason', 'reviewed_by must be eason');
assert.equal(qs.reviewed_at, '2026-09-09', 'reviewed_at must be 2026-09-09');
assert(Array.isArray(qs.queries) && qs.queries.length >= 2, 'Must have at least 2 queries');

for (const q of qs.queries) {
  assert(q.id, 'Query ID missing');
  assert(q.text, 'Query text missing');
  assert(!q.text.includes('鼎泰豐') && !q.text.includes('一蘭'), 'Queries must be unbranded!');
  console.log(`   - [${q.id}] (${q.intent}): "${q.text}"`);
}
console.log(`   [PASS] Query set is unbranded, approved, and properly versioned.\n`);

console.log('=== ALL 4 WHITEPAPER VERIFICATION CHECKS PASSED ===');
