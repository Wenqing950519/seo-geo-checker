// MCAC Accuracy: what the official site says is the reference, what the fact answer
// says is the claim. Phone and address are judged; hours are recorded only (v0).
// Matching follows the research analysis (normalise, then compare), with the street
// address compared from the road name to the street number.

const PHONE_PATTERN = /(?:\+886[\s-]?\(?0?\d{1,3}\)?|\(0\d{1,3}\)|0\d{1,3})[\s-]?\d{3,4}[\s-]?\d{3,4}/g;
const ADDRESS_PATTERN = /(?:\d{3,6}\s*)?(?:台灣|臺灣)?\s*[一-鿿]{2}(?:市|縣)\s*[一-鿿]{1,3}(?:區|鄉|鎮|市)[一-鿿A-Za-z0-9\s\-之]{1,40}?號/g;
const LABELLED_ADDRESS = /(?:地址|店址|門市地址|Address)\s*[:：/]?\s*([^\n]{4,80}?號)/;
const LABELLED_HOURS = /(?:營業時間|Opening Hours|Business Hours)\s*[:：]?\s*([^\n]{4,80})/;
const UNKNOWN_VALUE = /^\s*(?:(?:unknown|n\/?a|none)\b|未知|不詳|無)/i;
const CITATION_MARKER = /\s*(?:\[\d{1,3}(?:\s*[,，、]\s*\d{1,3})*\]|【\d{1,3}】)/g;
const CHINESE_DIGITS = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9", 十: "10" };

// Every phone and address the official site publishes is a reference value: chains
// list a customer-service line on the homepage and store lines on a store page, and
// an answer giving any of them is correct. The first value found is the one displayed.
// Order: the homepage's JSON-LD, its visible text, extra pages (html), then plain texts.
function extractSiteFacts({ html = "", extraHtml = [], texts = [] } = {}) {
  const phones = [];
  const addresses = [];
  const hours = [];
  const pages = [html, ...(Array.isArray(extraHtml) ? extraHtml : [])].filter(Boolean);
  for (const page of pages) {
    for (const node of jsonLdNodes(page)) {
      if (node.telephone) phones.push(fact(firstString(node.telephone), "json_ld"));
      if (node.address) addresses.push(fact(addressFromJsonLd(node.address), "json_ld"));
      if (node.openingHoursSpecification || node.openingHours) hours.push(fact(hoursFromJsonLd(node.openingHoursSpecification || node.openingHours), "json_ld"));
    }
  }
  const visible = [...pages.map(visibleText), ...(Array.isArray(texts) ? texts : [])].filter(Boolean).join("\n");
  for (const match of visible.matchAll(PHONE_PATTERN)) {
    if (!/(?:傳真|fax)\s*[:：/]?\s*$/i.test(visible.slice(Math.max(0, match.index - 8), match.index))) phones.push(fact(match[0], "visible_text"));
  }
  const visibleAddresses = [
    ...[...visible.matchAll(new RegExp(LABELLED_ADDRESS.source, "g"))].map((match) => ({ value: match[1], index: match.index })),
    ...[...visible.matchAll(ADDRESS_PATTERN)].map((match) => ({ value: match[0], index: match.index }))
  ].sort((a, b) => a.index - b.index);
  for (const item of visibleAddresses) addresses.push(fact(item.value, "visible_text"));
  const labelledHours = visible.match(LABELLED_HOURS)?.[1];
  if (labelledHours) hours.push(fact(labelledHours, "visible_text"));
  return {
    phone: collect(phones, (value) => (normalizePhone(value).length >= 8 ? normalizePhone(value) : null)),
    address: collect(addresses, (value) => addressCore(value) || normalizeAddress(value) || null),
    hours: hours.find(Boolean) || null
  };
}

function collect(items, keyOf) {
  const seen = new Set();
  const kept = [];
  for (const item of items) {
    const key = item && keyOf(item.value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return kept.length ? { value: kept[0].value, source: kept[0].source, values: kept.slice(0, 12).map((item) => item.value) } : null;
}

// The site's own name and place, used when the planner cannot name the business.
function extractSiteIdentity(html) {
  const nodes = jsonLdNodes(html).filter((node) => node.name && !/^(?:WebSite|WebPage|BreadcrumbList|ItemList|ListItem|ImageObject)$/i.test(String(node["@type"] || "")));
  const business = nodes.find((node) => node.address || node.telephone) || nodes[0] || null;
  const address = Array.isArray(business?.address) ? business.address[0] : business?.address;
  return {
    name: business ? stripPageLabel(firstString(business.name)) : null,
    alternateNames: [].concat(business?.alternateName || []).map((value) => String(value).trim()).filter(Boolean).slice(0, 4),
    region: typeof address === "object" ? String(address?.addressRegion || "").trim() || null : null,
    locality: typeof address === "object" ? String(address?.addressLocality || "").trim() || null : null
  };
}

function parseFactAnswer(answer) {
  const text = String(answer || "");
  const addressLine = lineValue(text.match(/ADDRESS\s*[:：]\s*([^\n；;]*)/i));
  const phoneLine = lineValue(text.match(/PHONE\s*[:：]\s*([^\n；;]*)/i));
  const address = addressLine != null
    ? (UNKNOWN_VALUE.test(addressLine) ? [] : [addressLine].filter(Boolean))
    : [...text.matchAll(ADDRESS_PATTERN)].map((match) => match[0].trim());
  const phone = phoneLine != null
    ? (UNKNOWN_VALUE.test(phoneLine) ? [] : [...phoneLine.matchAll(PHONE_PATTERN)].map((match) => match[0]))
    : [...text.matchAll(PHONE_PATTERN)].map((match) => match[0]);
  return { address, phone, structured: addressLine != null || phoneLine != null };
}

// Engines append citation markers ([1][6], 【2】) to each line; they are not part of the value.
function lineValue(match) {
  return match ? match[1].replace(CITATION_MARKER, "").trim() : null;
}

// correct | mismatch | not_provided | unverifiable. The reference may be one value or
// every value the owner's page lists. A value missing from the page is a mismatch, not an
// error: the page may be out of date, or another platform may list another number
// (2026-10-20 smoke). Missing reference data is never counted against the answer.
function judgeFact(field, truthValue, claimed = []) {
  const truths = (Array.isArray(truthValue) ? truthValue : [truthValue]).filter(Boolean);
  if (!truths.length) return "unverifiable";
  const values = (Array.isArray(claimed) ? claimed : [claimed]).filter(Boolean);
  if (field === "phone") {
    const references = truths.map(normalizePhone).filter((value) => value.length >= 8);
    if (!references.length) return "unverifiable";
    const phones = values.map(normalizePhone).filter((value) => value.length >= 8);
    if (!phones.length) return "not_provided";
    return phones.some((value) => references.some((reference) => value === reference || value.includes(reference))) ? "correct" : "mismatch";
  }
  if (field === "address") {
    const references = truths.map(addressCore).filter(Boolean);
    if (!references.length) return "unverifiable";
    const cores = values.map(addressCore).filter(Boolean);
    if (!cores.length) return "not_provided";
    return cores.some((core) => references.includes(core)) ? "correct" : "mismatch";
  }
  return "not_judged";
}

function normalizePhone(value) {
  let digits = String(value || "").normalize("NFKC").replace(/[^\d+]/g, "");
  if (digits.startsWith("+886")) digits = `0${digits.slice(4).replace(/^0/, "")}`;
  else if (digits.startsWith("886") && digits.length >= 11) digits = `0${digits.slice(3).replace(/^0/, "")}`;
  return digits.replace(/\D/g, "");
}

function normalizeAddress(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/臺/g, "台")
    .replace(/台灣|taiwan/gi, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .replace(/^\d{3,6}/, "")
    .replace(/([一二三四五六七八九十])段/g, (_, digit) => `${CHINESE_DIGITS[digit]}段`);
}

// The road-to-number part ("仁愛路4段27巷3號"): a missing city, district or floor
// does not change which door the address points at.
function addressCore(value) {
  const normalized = normalizeAddress(value)
    .replace(/^[一-鿿]{2}(?:市|縣)/, "")
    .replace(/^[一-鿿]{1,3}?(?:區|鄉|鎮|市)/, "");
  return normalized.match(/^(.+?號)/)?.[1] || null;
}

function jsonLdNodes(html) {
  const nodes = [];
  for (const match of String(html || "").matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1].trim()), nodes); } catch { /* malformed JSON-LD is ignored, not guessed */ }
  }
  // Business nodes with contact data first, so a WebSite or BreadcrumbList cannot win.
  return nodes.sort((a, b) => contactWeight(b) - contactWeight(a));
}

function walk(value, out) {
  if (Array.isArray(value)) { value.forEach((item) => walk(item, out)); return; }
  if (!value || typeof value !== "object") return;
  out.push(value);
  for (const key of ["@graph", "mainEntity", "location", "department", "subOrganization", "itemListElement"]) {
    if (value[key]) walk(value[key], out);
  }
}

function contactWeight(node) {
  return (node.telephone ? 2 : 0) + (node.address ? 2 : 0) + (node.openingHours || node.openingHoursSpecification ? 1 : 0);
}

function addressFromJsonLd(address) {
  const value = Array.isArray(address) ? address[0] : address;
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  let text = String(value.streetAddress || "");
  for (const part of [value.addressLocality, value.addressRegion]) {
    if (part && !text.includes(part)) text = `${part}${text}`;
  }
  return text || null;
}

function hoursFromJsonLd(value) {
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => {
    if (typeof item === "string") return item;
    const days = [].concat(item?.dayOfWeek || []).map((day) => String(day).replace(/^https?:\/\/schema\.org\//, "")).join(",");
    return [days, item?.opens && item?.closes ? `${item.opens}-${item.closes}` : ""].filter(Boolean).join(" ");
  }).filter(Boolean).join("; ") || null;
}

function visibleText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ");
}

// 「洪師父官方網站」 names the page, not the business.
function stripPageLabel(value) {
  const stripped = String(value || "").replace(/\s*[-|｜–—:：]?\s*(?:官方網站|官方網頁|官網|official\s*(?:web\s*)?site)\s*$/i, "").trim();
  return stripped || (value ? String(value).trim() : null);
}

function firstString(value) {
  return String(Array.isArray(value) ? value[0] : value || "").trim() || null;
}

function fact(value, source) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? { value: text.slice(0, 200), source } : null;
}

module.exports = {
  addressCore,
  extractSiteFacts,
  extractSiteIdentity,
  judgeFact,
  normalizeAddress,
  normalizePhone,
  parseFactAnswer,
  PHONE_PATTERN,
  ADDRESS_PATTERN
};
