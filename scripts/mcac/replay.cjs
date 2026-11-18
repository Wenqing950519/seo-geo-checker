const { readFileSync } = require("node:fs");
const path = require("node:path");
const { buildBrandTermSet } = require("../../packages/geo-core/evidence/brand-match.js");
const { MCAC_VERSION, evaluateMcac } = require("../../packages/geo-core/mcac/index.js");

const example = path.resolve(__dirname, "../../packages/geo-core/mcac/examples/noodle-shop.json");
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasText = (value) => typeof value === "string" && value.trim().length > 0;

function isWebUrl(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function replay(input) {
  if (!isObject(input) || input.methodVersion !== MCAC_VERSION) {
    throw new Error(`methodVersion 應為 ${MCAC_VERSION}。`);
  }
  if (!hasText(input.siteHost) || /[\s/:?#@\\]/u.test(input.siteHost)) {
    throw new Error("siteHost 請填入受測網域，例如 noodle-shop.example。");
  }
  const host = new URL(`https://${input.siteHost}`).hostname;
  if (!Array.isArray(input.brandNames) || !input.brandNames.every(hasText)) {
    throw new Error("brandNames 應為這次判讀使用的品牌名稱陣列。");
  }
  if (!isObject(input.truth)) throw new Error("truth 應包含網頁上可核對的資料；沒有資料時填 {}。");
  for (const key of ["address", "phone"]) {
    const field = input.truth[key];
    if (field == null) continue;
    if (!isObject(field) || (field.values !== undefined
      ? !Array.isArray(field.values) || !field.values.length || !field.values.every(hasText)
      : !hasText(field.value))) {
      throw new Error(`truth.${key} 請提供字串 value 或非空的字串陣列 values。`);
    }
  }
  if (!Array.isArray(input.probes)) throw new Error("probes 應為題目陣列。");
  const remaining = new Map([["discovery", 2], ["fact", 1], ["action", 1]]);
  const ids = new Set();
  for (const probe of input.probes) {
    if (!isObject(probe) || !hasText(probe.id) || ids.has(probe.id) || !hasText(probe.query)) {
      throw new Error("每題都需要不同的 id 與問題原文 query。");
    }
    if (!remaining.get(probe.type)) throw new Error("題組最多納入兩題 discovery、一題 fact 與一題 action。");
    remaining.set(probe.type, remaining.get(probe.type) - 1);
    ids.add(probe.id);
    if (probe.status !== "answered" && probe.status !== "failed") {
      throw new Error(`${probe.id} 的 status 應為 answered 或 failed。`);
    }
    if (probe.status === "answered" && (typeof probe.answer !== "string" ||
      !Array.isArray(probe.citations) || !probe.citations.every(isWebUrl))) {
      throw new Error(`${probe.id} 需要 answer 字串與 citations 網址陣列；沒有引用時填 []。`);
    }
    if (probe.status === "failed" &&
      ((probe.answer !== undefined && probe.answer !== "") ||
       (probe.citations !== undefined && !(Array.isArray(probe.citations) && probe.citations.length === 0)))) {
      throw new Error(`${probe.id} 標為 failed。請刪除該題的 answer 和 citations，或分別填入空字串及 []。`);
    }
  }
  const resolutions = input.resolvedUrls === undefined ? {} : input.resolvedUrls;
  if (!isObject(resolutions) || !Object.entries(resolutions).every(([from, to]) => isWebUrl(from) && isWebUrl(to))) {
    throw new Error("resolvedUrls 應為原網址對應已解析網址的物件。");
  }
  const brandTerms = buildBrandTermSet({ masterTerms: input.brandNames });
  return evaluateMcac({
    siteHost: host,
    brandTerms,
    truth: input.truth,
    probes: input.probes,
    resolveUrl: (url) => resolutions[url] || url
  });
}

try {
  if (process.argv.length > 3) throw new Error("用法：node scripts/mcac/replay.cjs [input.json]");
  const raw = readFileSync(process.argv[2] || example, "utf8").replace(/^\uFEFF/u, "");
  process.stdout.write(JSON.stringify(replay(JSON.parse(raw)), null, 2) + "\n");
} catch (error) {
  console.error(`MCAC 重算失敗：${error.message}`);
  process.exitCode = 1;
}
