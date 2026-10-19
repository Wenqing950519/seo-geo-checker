// MCAC Accuracy: what the official site says is the reference, what the fact answer
// says is the claim. Phone and address are judged; hours are recorded only (v0).
// Matching follows the research analysis (normalise, then compare), with the street
// address compared from the road name to the street number.

const PHONE_PATTERN = /(?:\+886[\s-]?\(?0?\d{1,3}\)?|\(0\d{1,3}\)|0\d{1,3})[\s-]?\d{3,4}[\s-]?\d{3,4}/g;
const ADDRESS_PATTERN = /(?:\d{3,6}\s*)?(?:台灣|臺灣)?\s*[一-鿿]{2}(?:市|縣)\s*[一-鿿]{1,3}(?:區|鄉|鎮|市)[一-鿿A-Za-z0-9\s\-之]{1,40}?號/g;
const LABELLED_PHONE = /(?:電話|聯絡電話|訂位專線|專線|TEL|Tel|Phone)\s*[:：]?\s*([+\d()（）\s-]{8,24})/;
const LABELLED_ADDRESS = /(?:地址|店址|門市地址|Address)\s*[:：]?\s*([^\n]{4,80}?號)/;
const LABELLED_HOURS = /(?:營業時間|Opening Hours|Business Hours)\s*[:：]?\s*([^\n]{4,80})/;
const UNKNOWN_VALUE = /^\s*(?:(?:unknown|n\/?a|none)\b|未知|不詳|無)/i;
const CHINESE_DIGITS = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9", 十: "10" };

function extractSiteFacts({ html = "", texts = [] } = {}) {
  const facts = { phone: null, address: null, hours: null };
  for (const node of jsonLdNodes(html)) {
    if (!facts.phone && node.telephone) facts.phone = fact(firstString(node.telephone), "json_ld");
    if (!facts.address && node.address) facts.address = fact(addressFromJsonLd(node.address), "json_ld");
    if (!facts.hours && (node.openingHoursSpecification || node.openingHours)) {
      facts.hours = fact(hoursFromJsonLd(node.openingHoursSpecification || node.openingHours), "json_ld");
    }
  }
  const visible = [visibleText(html), ...(Array.isArray(texts) ? texts : [])].filter(Boolean).join("\n");
  if (!facts.phone) {
    const labelled = visible.match(LABELLED_PHONE)?.[1];
    const phone = labelled?.match(new RegExp(PHONE_PATTERN.source))?.[0] || visible.match(new RegExp(PHONE_PATTERN.source))?.[0];
    if (phone) facts.phone = fact(phone, "visible_text");
  }
  if (!facts.address) {
    const address = visible.match(LABELLED_ADDRESS)?.[1] || visible.match(new RegExp(ADDRESS_PATTERN.source))?.[0];
    if (address) facts.address = fact(address, "visible_text");
  }
  if (!facts.hours) {
    const hours = visible.match(LABELLED_HOURS)?.[1];
    if (hours) facts.hours = fact(hours, "visible_text");
  }
  return facts;
}

// The site's own name and place, used when the planner cannot name the business.
function extractSiteIdentity(html) {
  const nodes = jsonLdNodes(html).filter((node) => node.name && !/^(?:WebSite|WebPage|BreadcrumbList|ItemList|ListItem|ImageObject)$/i.test(String(node["@type"] || "")));
  const business = nodes.find((node) => node.address || node.telephone) || nodes[0] || null;
  const address = Array.isArray(business?.address) ? business.address[0] : business?.address;
  return {
    name: business ? firstString(business.name) : null,
    alternateNames: [].concat(business?.alternateName || []).map((value) => String(value).trim()).filter(Boolean).slice(0, 4),
    region: typeof address === "object" ? String(address?.addressRegion || "").trim() || null : null,
    locality: typeof address === "object" ? String(address?.addressLocality || "").trim() || null : null
  };
}

function parseFactAnswer(answer) {
  const text = String(answer || "");
  const addressLine = text.match(/ADDRESS\s*[:：]\s*([^\n；;]*)/i);
  const phoneLine = text.match(/PHONE\s*[:：]\s*([^\n；;]*)/i);
  const address = addressLine
    ? (UNKNOWN_VALUE.test(addressLine[1]) ? [] : [addressLine[1].trim()].filter(Boolean))
    : [...text.matchAll(ADDRESS_PATTERN)].map((match) => match[0].trim());
  const phone = phoneLine
    ? (UNKNOWN_VALUE.test(phoneLine[1]) ? [] : [...phoneLine[1].matchAll(PHONE_PATTERN)].map((match) => match[0]))
    : [...text.matchAll(PHONE_PATTERN)].map((match) => match[0]);
  return { address, phone, structured: Boolean(addressLine || phoneLine) };
}

// correct | incorrect | not_provided | unverifiable. Missing reference data is never
// counted against the answer.
function judgeFact(field, truthValue, claimed = []) {
  if (!truthValue) return "unverifiable";
  const values = (Array.isArray(claimed) ? claimed : [claimed]).filter(Boolean);
  if (field === "phone") {
    const truth = normalizePhone(truthValue);
    if (truth.length < 8) return "unverifiable";
    const phones = values.map(normalizePhone).filter((value) => value.length >= 8);
    if (!phones.length) return "not_provided";
    return phones.some((value) => value === truth || value.includes(truth)) ? "correct" : "incorrect";
  }
  if (field === "address") {
    const truth = addressCore(truthValue);
    if (!truth) return "unverifiable";
    const cores = values.map(addressCore).filter(Boolean);
    if (!cores.length) return "not_provided";
    return cores.includes(truth) ? "correct" : "incorrect";
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
