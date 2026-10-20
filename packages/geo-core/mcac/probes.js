// MCAC probe set: three kinds of task instead of one question asked four times.
// Prompt wording follows the published research (AI 搜尋時代的檢索機制報告, appendix A),
// generalised from Taipei beef-noodle shops to any business with a name and a place.

const MCAC_PROBE_SET_VERSION = "mcac-probes-0.2.0";
const MAX_DISCOVERY_PROBES = 2;

const MCAC_SYSTEM_PROMPT = "你是台灣商家與品牌研究助理。只使用公開網頁搜尋所得資料，保留不確定性，不把搜尋摘要當作無條件真實。";
const DISCOVERY_INSTRUCTION = "請列出最多 10 個選項，簡述理由，並為每個選項附可核對的網頁來源。不要假設任何特定品牌必須出現在答案中。";

// Discovery questions never name the brand; fact and action questions name the brand
// and its place but never the domain, so the question itself cannot steer the answer
// toward the official site and inflate Citation.
function buildMcacProbes({ brandName = "", location = "", siteHost = "", discoveryQuestions = [] } = {}) {
  const host = normalizeHost(siteHost);
  const brand = cleanText(brandName, 60);
  if (brand && host && brand.toLowerCase().includes(host)) {
    throw new Error("MCAC brand name must not be the site domain");
  }
  const place = cleanText(location, 30) || "台灣";
  const questions = [...new Set((Array.isArray(discoveryQuestions) ? discoveryQuestions : [])
    .map((question) => cleanText(question, 200))
    .filter((question) => question && (!host || !question.toLowerCase().includes(host))))]
    .slice(0, MAX_DISCOVERY_PROBES);

  const probes = questions.map((question, index) => probe(`d${index + 1}`, "discovery", question, `${question}\n${DISCOVERY_INSTRUCTION}`));
  if (brand) {
    probes.push(probe("f1", "fact", `${place}「${brand}」地址與電話`,
      `請查證${place}的「${brand}」目前地址與電話。只輸出兩行：ADDRESS: <地址或 UNKNOWN>；PHONE: <電話或 UNKNOWN>。逐項使用可核對來源，不要猜測。`));
    probes.push(probe("a1", "action", `${place}「${brand}」可執行的下一步`,
      `我想前往或聯絡${place}的「${brand}」。請提供至少一個可執行的下一步（官方網站、地圖、電話、訂位或購買）。每項寫成 ACTION: <類型> | <URL 或電話> | <由品牌自有或第三方平台提供>，並附來源；無法確認請寫 UNKNOWN。`));
  }
  return probes;
}

function probe(id, type, query, task) {
  return { id, type, query, prompt: `${MCAC_SYSTEM_PROMPT}\n\n${task}` };
}

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function cleanText(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

module.exports = {
  DISCOVERY_INSTRUCTION,
  MAX_DISCOVERY_PROBES,
  MCAC_PROBE_SET_VERSION,
  MCAC_SYSTEM_PROMPT,
  buildMcacProbes
};
