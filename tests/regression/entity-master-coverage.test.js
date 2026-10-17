const assert = require('node:assert/strict');
const { findEntityForUrl, assertReviewedEntityCoverage, normalizeComparableUrl } = require('../../research/lib/entity-master.js');

function row(id, owned, extra = {}) {
  return { store_id: id, official_name_zh: id, aliases: [], official_domains: ['hotel.example'],
    owned_urls: [owned], shared_domain_flag: 'true', include_status: 'included',
    reviewed_by: 'reviewer', reviewed_at: '2026-09-09', truth_source: 'official-location', ...extra };
}
function master(rows) { return { rows, byDomain: new Map([['hotel.example', rows]]) }; }
const a = row('restaurant-a', 'https://hotel.example/dining?restaurant=a');
const b = row('restaurant-b', 'https://hotel.example/dining?restaurant=b');
const m = master([a, b]);
assert.equal(findEntityForUrl(m, b.owned_urls[0]).row.store_id, b.store_id, 'exact page must select the correct row, not the first row');
assert.notEqual(normalizeComparableUrl(a.owned_urls[0]), normalizeComparableUrl(b.owned_urls[0]), 'query selects a different restaurant');
assert.notEqual(normalizeComparableUrl(a.owned_urls[0]), normalizeComparableUrl('https://hotel.example/'), 'root must not equal owned page');
assert.doesNotThrow(() => assertReviewedEntityCoverage([a.owned_urls[0], b.owned_urls[0]], m));
assert.throws(() => assertReviewedEntityCoverage(['https://hotel.example/'], m), /exact owned_urls|ambiguous/);
assert.throws(() => assertReviewedEntityCoverage(['https://hotel.example/'], master([a, row('closed', 'https://hotel.example/', { include_status: 'excluded' })])), /exact owned_urls|ambiguous/, 'excluded root mapping must not override an included restaurant');
assert.throws(() => assertReviewedEntityCoverage([a.owned_urls[0]], master([a, row('duplicate', a.owned_urls[0])])), /ambiguous/);
assert.throws(() => assertReviewedEntityCoverage([a.owned_urls[0]], master([row('pending', a.owned_urls[0], { include_status: 'pending' })])), /pending/);
assert.throws(() => assertReviewedEntityCoverage(['https://missing.example/'], m), /no matching official domain/);
assert.doesNotThrow(() => assertReviewedEntityCoverage(['https://hotel.example/'], master([row('single', 'https://hotel.example/', { shared_domain_flag: 'false' })])));
console.log('entity master exact coverage tests passed');
