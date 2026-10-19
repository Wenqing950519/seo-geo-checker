// MCAC Conversion-readiness: does the answer hand the reader a next step (phone,
// address, website, map, booking, ordering, LINE)? A phone number or an address is
// already a next step; whether the step is the brand's own is recorded separately.

const { classifySourceType, isFirstParty, safeHostname } = require("../evidence/brand-match.js");
const { ADDRESS_PATTERN, PHONE_PATTERN } = require("./facts.js");

const ACTIONABLE_TYPES = new Set(["website", "map", "phone", "booking", "order", "line", "address"]);
const URL_PATTERN = /https?:\/\/[^\s|）)」』,，。；;]+/gi;
const TYPE_KEYWORDS = [
  ["map", /地圖|導航|map/i],
  ["booking", /訂位|預約|訂房|訂票|booking|reserv/i],
  ["order", /點餐|外送|外帶|購買|訂購|商店|order|delivery|shop/i],
  ["line", /\bline\b|官方帳號/i],
  ["phone", /電話|撥打|phone|\btel\b|call/i],
  ["address", /地址|address/i],
  ["website", /官網|官方網站|網站|網頁|website|official/i]
];

// resolveUrl maps a redirect written into the answer (a Gemini grounding link, a short URL)
// to where it leads; the entry shows and is credited by that target.
function parseActions(answer, { siteHost = "", officialDomains = [], resolveUrl = (url) => url } = {}) {
  const text = String(answer || "");
  const resolve = (url) => resolveUrl(url) || url;
  const lines = text.split(/\r?\n/).filter((line) => /ACTION\s*[:：]/i.test(line));
  const entries = lines.length ? lines.map((line) => fromActionLine(line, siteHost, officialDomains, resolve)).filter(Boolean)
    : fromFreeText(text, siteHost, officialDomains, resolve);
  const urls = [...text.matchAll(URL_PATTERN)].map((match) => resolve(match[0]));
  return {
    entries,
    hasActionable: entries.some((entry) => ACTIONABLE_TYPES.has(entry.type)),
    officialEntry: entries.some((entry) => entry.official) || urls.some((url) => isFirstParty(url, siteHost, officialDomains))
  };
}

function fromActionLine(line, siteHost, officialDomains, resolve) {
  const [typeText = "", written = "", owner = ""] = line.replace(/^.*?ACTION\s*[:：]\s*/i, "").split("|").map((part) => part.trim());
  if (!written || /^unknown$/i.test(written) || /^unknown$/i.test(typeText)) return null;
  const writtenUrl = written.match(URL_PATTERN)?.[0] || null;
  const url = writtenUrl ? resolve(writtenUrl) : null;
  const target = writtenUrl ? written.replace(writtenUrl, url) : written;
  return {
    type: classify(typeText, target, url),
    target: target.slice(0, 200),
    owner: owner.slice(0, 40) || null,
    official: Boolean(url && isFirstParty(url, siteHost, officialDomains))
  };
}

function fromFreeText(text, siteHost, officialDomains, resolve) {
  const entries = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = resolve(match[0]);
    entries.push({ type: classify("", url, url), target: url, owner: null, official: isFirstParty(url, siteHost, officialDomains) });
  }
  for (const match of text.matchAll(PHONE_PATTERN)) entries.push({ type: "phone", target: match[0], owner: null, official: false });
  for (const match of text.matchAll(ADDRESS_PATTERN)) entries.push({ type: "address", target: match[0].trim(), owner: null, official: false });
  return entries;
}

// A URL's host decides first (a maps link is a map whatever the label says); the
// label decides for phone numbers and plain text.
function classify(typeText, target, url) {
  if (url) {
    const host = safeHostname(url);
    if (/^maps\./.test(host) || /(?:^|\.)google\.[a-z.]+$/.test(host) && /\/maps/.test(url) || host === "maps.app.goo.gl") return "map";
    const sourceType = classifySourceType(url, "", []);
    if (sourceType === "booking") return "booking";
    if (/^(?:line\.me|lin\.ee)$/.test(host)) return "line";
  }
  for (const [type, pattern] of TYPE_KEYWORDS) {
    if (pattern.test(typeText)) return type;
  }
  if (url) return "website";
  if (new RegExp(PHONE_PATTERN.source).test(target)) return "phone";
  if (new RegExp(ADDRESS_PATTERN.source).test(target)) return "address";
  return "other";
}

module.exports = { ACTIONABLE_TYPES, ANSWER_URL_PATTERN: URL_PATTERN, parseActions };
