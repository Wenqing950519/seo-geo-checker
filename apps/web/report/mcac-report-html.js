// Report page and Markdown export for an MCAC GeoCheck report:
// - Dark tech-navy SaaS canvas with multi-accent MCAC cues and 0-100 AI 可見度 ring gauge upfront
// - Structured A-E first screen (Identity, Score + 4 concise MCAC blocks, 1-sentence conclusion,
//   1-3 genuine priorities, detail navigation anchors) with restrained scannable copy
// - Visual 4-module evidence grid, role-grouped collapsible site checks, raw AI transcripts & Markdown/PDF
// Every model-written string is HTML-escaped.

const { computeMcacScore, extractOptionList } = require("../../../packages/geo-core/mcac/evaluate.js");

const FLAG = {
  yes: ["有", "yes"],
  part: ["部分", "part"],
  no: ["無", "no"],
  unknown: ["未知", "unknown"],
  correct: ["一致", "yes"],
  mismatch: ["資訊不一致／待核對", "part"],
  not_provided: ["未提供", "absent"],
  unverifiable: ["無法核對", "unknown"]
};
const FIELD = {
  correct: "一致（正確）",
  mismatch: "資訊不一致／待核對（和你的頁面不一致）",
  not_provided: "AI 未提供",
  unverifiable: "無法核對（頁面未寫）",
  unknown: "未知",
  not_judged: "未納入比對（v0）"
};
const SOURCE = {
  official: "官網",
  maps: "地圖",
  social: "社群",
  booking: "訂位平台",
  ugc: "評論論壇",
  wiki: "維基",
  gov_edu: "政府學校",
  other: "其他",
  unattributable: "無法歸屬"
};
const SOURCE_COLORS = {
  official: "#34D399",
  maps: "#60A5FA",
  booking: "#818CF8",
  social: "#F472B6",
  ugc: "#FBBF24",
  wiki: "#38BDF8",
  gov_edu: "#2DD4BF",
  other: "#94A3B8",
  unattributable: "#64748B"
};
const ENTRY = {
  website: "網站",
  map: "地圖",
  phone: "電話",
  booking: "訂位",
  order: "訂購",
  line: "LINE",
  address: "地址",
  other: "其他"
};
const ACTION_CHANNELS = ["website", "phone", "map", "booking", "order", "line", "address"];
const PROBE = {
  discovery: "推薦題（不帶店名）",
  fact: "事實題",
  action: "行動題"
};
const TRUTH_SOURCE = {
  json_ld: "結構化資料",
  visible_text: "頁面文字"
};
const ACTION_TYPE_LABELS = {
  technical: "網站設定",
  content: "網站內容",
  positioning: "品牌說明"
};

const CHECK_META = {
  homepage_fetch: { label: "首頁連線讀取", group: "爬蟲存取", role: "developer" },
  indexable: { label: "搜尋引擎收錄設定", group: "爬蟲存取", role: "developer" },
  googlebot_access: { label: "Google 搜尋爬蟲權限", group: "爬蟲存取", role: "developer" },
  oai_search_access: { label: "ChatGPT 搜尋爬蟲權限", group: "爬蟲存取", role: "developer" },
  claude_search_access: { label: "Claude 搜尋爬蟲權限", group: "爬蟲存取", role: "developer" },
  sitemap_valid: { label: "網站地圖 (sitemap.xml)", group: "索引探索", role: "developer" },
  homepage_in_sitemap: { label: "首頁列於網站地圖", group: "索引探索", role: "developer" },
  sitemap_declared: { label: "robots.txt 宣告網站地圖", group: "索引探索", role: "developer" },
  canonical: { label: "主要網址設定 (Canonical)", group: "索引探索", role: "developer" },
  title: { label: "頁面標題 (Title)", group: "語意標記", role: "owner" },
  description: { label: "頁面摘要 (Meta Description)", group: "語意標記", role: "owner" },
  h1: { label: "首頁大標題 (H1)", group: "語意標記", role: "owner" },
  open_graph: { label: "社群分享標籤 (Open Graph)", group: "語意標記", role: "developer" },
  valid_schema: { label: "商家結構化資料 (JSON-LD)", group: "語意標記", role: "developer" },
  relevant_schema: { label: "商家資料類型相符", group: "語意標記", role: "developer" },
  readable_text: { label: "首頁可讀文字份量", group: "內容可讀", role: "owner" },
  initial_html_text: { label: "原始 HTML 內文可讀性", group: "內容可讀", role: "developer" },
  render_consistency: { label: "網頁渲染與文字呈現", group: "內容可讀", role: "developer" },
  image_alt: { label: "圖片文字說明 (Alt)", group: "內容可讀", role: "owner" },
  heading_structure: { label: "標題層級結構", group: "內容可讀", role: "owner" },
  faq: { label: "常見問答 (FAQ) 段落", group: "可引用性", role: "owner" },
  cases: { label: "案例、菜單或服務實例", group: "可引用性", role: "owner" },
  comparisons: { label: "服務地區、分店或方案說明", group: "可引用性", role: "owner" },
  proof: { label: "評價、證照或客觀證明", group: "可引用性", role: "owner" },
  service_clarity: { label: "服務與聯絡資訊清楚度", group: "可引用性", role: "owner" }
};

const ISSUE_TO_CHECK_ID = {
  "Homepage fetchability": "homepage_fetch",
  "Indexability": "indexable",
  "Googlebot access": "googlebot_access",
  "OAI-SearchBot": "oai_search_access",
  "Claude-SearchBot": "claude_search_access",
  "Sitemap": "sitemap_valid",
  "Canonical": "canonical",
  "HTML title": "title",
  "Meta description": "description",
  "H1": "h1",
  "Structured data": "valid_schema",
  "Readable content": "readable_text",
  "JavaScript rendering": "render_consistency",
  "Image alt": "image_alt",
  "Heading structure": "heading_structure"
};

const MISMATCH_ADVICE = "AI 給的電話或地址和你的頁面不同。可能是頁面資料過時，也可能是 Google 地圖等其他平台列的資料不一樣；請確認哪一個正確，並把官網、粉專、Google 商家等各平台的資料統一。";

// Always recomputed from the four results: reports stored before 2026-11-15 carry a score that
// was rescaled from fewer than four results, and the stored copy must not override the rule.
function resolveScore(m) {
  return computeMcacScore(m);
}

function isDemoReport(report) {
  return Boolean(
    report?.isDemo === true
    || report?.demo === true
    || report?.mode === "demo"
    || /^(real_lite_)?demo([-_]|$)/i.test(String(report?.id || ""))
  );
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function brandLogoSvg() {
  return `<svg class="brand-wordmark" viewBox="0 0 203.84 53" role="img" aria-label="LS-Labs"><title>LS-Labs</title><g transform="translate(-9.5 -5.5)"><path d="M9.5 5.5H14.3V50H58.5V54.5H9.5Z" fill="#F8FAFC"/><rect x="31.5" y="54.5" width="2.5" height="4" fill="#F8FAFC"/><rect x="51.75" y="54.5" width="2.5" height="4" fill="#F8FAFC"/><path class="ls-curve" d="M19.5 43.5C37 43.5 28.5 13 46 13" fill="none" stroke="#F8FAFC" stroke-width="5"/><circle class="ls-dot" cx="53" cy="13" r="4.5" fill="#60A5FA"/><path d="M80.41 42.25V17.75H85.03V38.05H96.23V42.25Z M107.36 42.74Q104.525 42.74 102.355 41.725Q100.185 40.71 98.96 38.82Q97.735 36.93 97.735 34.27V33.29H102.285V34.27Q102.285 36.475 103.65 37.578Q105.015 38.68 107.36 38.68Q109.74 38.68 110.912 37.735Q112.085 36.79 112.085 35.32Q112.085 34.305 111.507 33.675Q110.93 33.045 109.827 32.642Q108.725 32.24 107.15 31.89L106.345 31.715Q103.825 31.155 102.022 30.297Q100.22 29.44 99.257 28.04Q98.295 26.64 98.295 24.4Q98.295 22.16 99.362 20.567Q100.43 18.975 102.372 18.117Q104.315 17.26 106.94 17.26Q109.565 17.26 111.612 18.152Q113.66 19.045 114.832 20.812Q116.005 22.58 116.005 25.24V26.29H111.455V25.24Q111.455 23.84 110.912 22.982Q110.37 22.125 109.355 21.722Q108.34 21.32 106.94 21.32Q104.84 21.32 103.842 22.107Q102.845 22.895 102.845 24.26Q102.845 25.17 103.317 25.8Q103.79 26.43 104.735 26.85Q105.68 27.27 107.15 27.585L107.955 27.76Q110.58 28.32 112.522 29.195Q114.465 30.07 115.55 31.505Q116.635 32.94 116.635 35.18Q116.635 37.42 115.497 39.117Q114.36 40.815 112.277 41.778Q110.195 42.74 107.36 42.74Z M118.91 31.995V28.005H129.27V31.995Z M132.735 42.25V17.75H137.355V38.05H148.555V42.25Z M149.5 42.25 155.94 17.75H163.99L170.43 42.25H165.67L164.34 36.86H155.59L154.26 42.25ZM156.675 32.59H163.255L160.28 20.655H159.65Z M172.145 42.25V38.19H175.365V21.81H172.145V17.75H184.745Q186.985 17.75 188.647 18.502Q190.31 19.255 191.237 20.637Q192.165 22.02 192.165 23.945V24.295Q192.165 25.975 191.535 27.042Q190.905 28.11 190.047 28.688Q189.19 29.265 188.42 29.51V30.14Q189.19 30.35 190.1 30.928Q191.01 31.505 191.657 32.59Q192.305 33.675 192.305 35.425V35.775Q192.305 37.805 191.36 39.258Q190.415 40.71 188.752 41.48Q187.09 42.25 184.885 42.25ZM179.985 38.05H184.325Q185.83 38.05 186.757 37.315Q187.685 36.58 187.685 35.215V34.865Q187.685 33.5 186.775 32.765Q185.865 32.03 184.325 32.03H179.985ZM179.985 27.83H184.255Q185.69 27.83 186.617 27.095Q187.545 26.36 187.545 25.065V24.715Q187.545 23.385 186.635 22.667Q185.725 21.95 184.255 21.95H179.985Z M204.065 42.74Q201.23 42.74 199.06 41.725Q196.89 40.71 195.665 38.82Q194.44 36.93 194.44 34.27V33.29H198.99V34.27Q198.99 36.475 200.355 37.578Q201.72 38.68 204.065 38.68Q206.445 38.68 207.617 37.735Q208.79 36.79 208.79 35.32Q208.79 34.305 208.212 33.675Q207.635 33.045 206.532 32.642Q205.43 32.24 203.855 31.89L203.05 31.715Q200.53 31.155 198.727 30.297Q196.925 29.44 195.962 28.04Q195 26.64 195 24.4Q195 22.16 196.067 20.567Q197.135 18.975 199.077 18.117Q201.02 17.26 203.645 17.26Q206.27 17.26 208.317 18.152Q210.365 19.045 211.537 20.812Q212.71 22.58 212.71 25.24V26.29H208.16V25.24Q208.16 23.84 207.617 22.982Q207.075 22.125 206.06 21.722Q205.045 21.32 203.645 21.32Q201.545 21.32 200.547 22.107Q199.55 22.895 199.55 24.26Q199.55 25.17 200.022 25.8Q200.495 26.43 201.44 26.85Q202.385 27.27 203.855 27.585L204.66 27.76Q207.285 28.32 209.227 29.195Q211.17 30.07 212.255 31.505Q213.34 32.94 213.34 35.18Q213.34 37.42 212.202 39.117Q211.065 40.815 208.982 41.778Q206.9 42.74 204.065 42.74Z" fill="#F8FAFC"/></g></svg>`;
}

function probeScopeText(probes) {
  const list = Array.isArray(probes) ? probes : [];
  if (!list.length) return "0 題實測（未詢問 AI）";
  const counts = { discovery: 0, fact: 0, action: 0 };
  for (const p of list) {
    if (p?.type in counts) counts[p.type] += 1;
  }
  const parts = [];
  if (counts.discovery) parts.push(`推薦 ${counts.discovery} 題`);
  if (counts.fact) parts.push(`事實 ${counts.fact} 題`);
  if (counts.action) parts.push(`行動 ${counts.action} 題`);
  return `${list.length} 題實測${parts.length ? `（${parts.join("・")}）` : ""}`;
}

function buildNaturalConclusion(report, m) {
  const men = m.mention || {};
  const cit = m.citation || {};
  const acc = m.accuracy || {};
  const conv = m.conversion || {};

  const allUnknown = [men.flag, cit.flag, acc.flag, conv.flag]
    .every((val) => !val || val === "unknown");

  if (allUnknown) {
    return report.limited
      ? "本次因無法完整讀取網站內容，尚未進行 AI 實測與資訊核對；請確認網址可公開瀏覽後再檢查一次。"
      : "本次尚未取得足夠可判讀的 AI 回應，暫無法評估各項表現；建議確認受測網址狀態後再檢查一次。";
  }

  let lead = "";
  if (men.flag === "yes" && cit.flag === "yes") {
    lead = "AI 已在推薦提問中提到你的店，且回答有附上你的網站連結";
  } else if (men.flag === "yes") {
    lead = "AI 已經提到你的店";
  } else if (men.flag === "part") {
    lead = `AI 在部分推薦提問中有提到你的店（${men.hits} / ${men.n} 題）`;
  } else if (men.flag === "no" && (cit.flag === "yes" || cit.flag === "part")) {
    lead = "AI 查核時能找到你的網站，但在不帶店名的推薦提問中尚未提到你的店";
  } else if (men.flag === "no") {
    lead = "AI 在本次不帶店名的推薦提問中尚未提到你的店";
  } else {
    lead = "本次推薦提問未取得足夠回應，尚無法判讀是否被提及";
  }

  let tail = "";
  if (hasMismatch(m)) {
    const phoneDiff = acc.fields?.phone === "mismatch";
    const addrDiff = acc.fields?.address === "mismatch";
    if (phoneDiff && addrDiff) {
      tail = "，但電話與地址資訊和你的頁面不一致，建議優先確認並統一各平台資料。";
    } else if (addrDiff) {
      tail = "，但地址資訊有差異（和你的頁面不一致），建議優先確認。";
    } else if (phoneDiff) {
      tail = "，但電話資訊有差異（和你的頁面不一致），建議優先確認。";
    } else {
      tail = "，但聯絡資訊和你的頁面不一致，建議優先確認。";
    }
  } else if (acc.flag === "not_provided") {
    tail = "，但 AI 未能提供你的電話或地址，建議優先在官網補齊文字版營業資訊。";
  } else if (acc.flag === "unverifiable" && conv.flag === "no") {
    tail = "，且受測頁面未偵測到電話或地址、AI 回答也缺少聯絡入口，建議先補齊文字版聯絡資訊。";
  } else if (acc.flag === "unverifiable") {
    tail = "，但受測頁面未偵測到文字版電話或地址，目前無法核對 AI 說法是否一致，建議優先補齊。";
  } else if (conv.flag === "no") {
    tail = "，但回答中缺少電話、地圖或預約等聯絡入口，建議優先在網站明顯處補上行動管道。";
  } else if (conv.flag === "yes" && conv.official_entry === false && cit.reason !== "platform_root_input") {
    tail = cit.flag === "no"
      ? "，且回答尚未引用官網或提供官網直連入口，建議確認官網說明與外部平台網址設定。"
      : "，但顧客行動入口僅導向第三方平台或電話、未直連官網，建議在商家檔案補上官網連結。";
  } else if (cit.flag === "no" && cit.reason !== "platform_root_input") {
    tail = "，但回答尚未引用你的網站作為來源，建議優先補強官網的品牌介紹與服務說明。";
  } else if (men.flag === "no") {
    tail = "，建議優先補強網站上的地區、服務特色與常見問題，讓 AI 更容易辨識並推薦你。";
  } else if (cit.reason === "platform_root_input") {
    tail = acc.flag === "correct"
      ? "，聯絡資訊已可核對；因本次輸入為社群或平台共用網址，引用來源無法單獨歸屬為獨立官網。"
      : "；因本次輸入為社群或平台共用網址，引用來源無法單獨歸屬為獨立官網。";
  } else if (acc.flag === "correct" && conv.flag === "yes") {
    tail = "，基本聯絡資訊與頁面一致且具備行動入口，建議持續維持官網與各平台資料同步。";
  } else {
    tail = "，部分項目因當次回應缺漏尚未判讀完整，建議參考下方各題實錄與網站基礎檢查。";
  }

  return `${lead}${tail}`;
}

function buildHeroSummaryTiles(report, m) {
  const men = m.mention || {};
  const cit = m.citation || {};
  const acc = m.accuracy || {};
  const conv = m.conversion || {};

  const ranks = (men.ranks || []).filter((r) => Number.isFinite(r));
  const bestRank = ranks.length ? Math.min(...ranks) : null;
  const totalSources = Object.values(cit.by_type || {}).reduce((s, n) => s + Number(n || 0), 0);
  const officialCount = Number(cit.by_type?.official || 0);
  const convEntries = Array.isArray(conv.entries) ? conv.entries : [];
  const isPlatformRoot = cit.reason === "platform_root_input";
  const phoneField = acc.fields?.phone === "mismatch" ? "不一致" : acc.fields?.phone === "correct" ? "正確" : (FIELD[acc.fields?.phone] || "未知");
  const addrField = acc.fields?.address === "mismatch" ? "不一致" : acc.fields?.address === "correct" ? "正確" : (FIELD[acc.fields?.address] || "未知");

  return [
    {
      id: "mention",
      cls: "m",
      code: "M",
      question: "AI 有沒有提到你？",
      dimLabel: "提及",
      flagValue: men.flag,
      stat: men.n
        ? `${men.hits} / ${men.n} 題提到${bestRank ? ` · 第 ${bestRank} 項` : ""}`
        : "無有效回答",
      note: men.n
        ? (men.hits > 0 ? `不帶店名 ${men.n} 題中出現 ${men.hits} 次` : `不帶店名 ${men.n} 題均未提及`)
        : "推薦題尚無可判讀回應"
    },
    {
      id: "citation",
      cls: "c1",
      code: "C",
      question: "AI 有沒有引用你的網站？",
      dimLabel: "引用來源",
      flagValue: cit.flag,
      stat: isPlatformRoot
        ? "共用平台網址"
        : (cit.n ? `${cit.official_probes} / ${cit.n} 題引用官網` : "無可判讀來源"),
      note: isPlatformRoot
        ? "非獨立官網網域"
        : (totalSources ? `共 ${totalSources} 筆來源${officialCount ? `（官網 ${officialCount} 筆）` : ""}` : "尚無外部引用來源")
    },
    {
      id: "accuracy",
      cls: "a",
      code: "A",
      question: "店家資訊有沒有一致？",
      dimLabel: "資訊正確性",
      flagValue: acc.flag,
      stat: `電話${phoneField} ｜ 地址${addrField}`,
      note: acc.flag === "mismatch"
        ? "與頁面有差異，請比對下方並統一"
        : acc.flag === "correct"
          ? "與受測頁面公開資料相符"
          : acc.flag === "unverifiable"
            ? "頁面未寫文字版電話或地址"
            : acc.flag === "not_provided"
              ? "AI 未回覆電話或地址"
              : "尚無可核對回應"
    },
    {
      id: "conversion",
      cls: "c2",
      code: "C",
      question: "顧客能不能找到聯絡入口？",
      dimLabel: "行動資訊",
      flagValue: conv.flag,
      stat: conv.flag === "unknown"
        ? "無有效回答"
        : (convEntries.length
          ? `${convEntries.length} 種入口${isPlatformRoot ? "" : ` · 官網直連：${conv.official_entry ? "有" : "無"}`}`
          : "0 種聯絡入口"),
      note: conv.flag === "unknown"
        ? "行動題尚無可判讀回應"
        : (convEntries.length ? convEntries.map((e) => ENTRY[e] || e).join("・") : "未給出聯絡或導航方式")
    }
  ];
}

function buildPriorityItems(report, m, checks) {
  const items = [];
  const acc = m.accuracy || {};
  const conv = m.conversion || {};
  const cit = m.citation || {};
  const men = m.mention || {};

  if (hasMismatch(m)) {
    const diffFields = [];
    if (acc.fields?.phone === "mismatch") diffFields.push("電話");
    if (acc.fields?.address === "mismatch") diffFields.push("地址");
    const which = diffFields.length ? diffFields.join("與") : "電話與地址";
    items.push({
      priority: "p1",
      badge: "優先 1",
      basis: "資訊正確性",
      title: `核對並統一各平台的${which}`,
      summary: "確認正確資訊並同步官網、Google 商家與粉專。"
    });
  }

  if (acc.flag === "unverifiable" || acc.flag === "not_provided") {
    items.push({
      priority: items.length === 0 ? "p1" : "p2",
      badge: `優先 ${items.length + 1}`,
      basis: acc.flag === "unverifiable" ? "頁面文字擷取" : "事實查核",
      title: "首頁或聯絡頁補齊純文字電話地址",
      summary: acc.flag === "unverifiable"
        ? "頁面未偵測到純文字電話或地址，勿僅放圖片。"
        : "在頁尾、聯絡頁與商家檔案補齊完整聯絡資訊。"
    });
  }

  if (conv.flag === "no") {
    items.push({
      priority: items.length === 0 ? "p1" : "p2",
      badge: `優先 ${items.length + 1}`,
      basis: "行動資訊",
      title: "補上明顯的電話、地圖與預約連結",
      summary: "首頁頂部與頁尾建議放置可點擊聯絡與導航入口。"
    });
  } else if (conv.flag === "yes" && conv.official_entry === false && cit.reason !== "platform_root_input") {
    items.push({
      priority: items.length === 0 ? "p1" : "p2",
      badge: `優先 ${items.length + 1}`,
      basis: "行動資訊",
      title: "在 Google 商家綁定官網連結",
      summary: "補齊外部平台官網網址，導回品牌自有頁面。"
    });
  }

  const hasVisibilityGap = men.flag === "no" || men.flag === "part" || (cit.flag === "no" && cit.reason !== "platform_root_input");
  if (items.length < 3 && hasVisibilityGap && !report.limited) {
    const siteActions = Array.isArray(checks?.actions) ? checks.actions : [];
    for (const action of siteActions) {
      if (items.length >= 3) break;
      const title = String(action.target_zh || "").trim();
      if (!title) continue;
      if (items.some((it) => it.title.includes("電話") && /聯絡|service_clarity/.test(title))) continue;
      items.push({
        priority: `p${items.length + 1}`,
        badge: `優先 ${items.length + 1}`,
        basis: ACTION_TYPE_LABELS[action.type] || "網站條件",
        title,
        summary: String(action.recommendation_zh || action.reason_zh || "").slice(0, 68)
      });
    }
    if (items.length < 3 && (men.flag === "no" || cit.flag === "no") && !items.some((it) => it.title.includes("地區"))) {
      items.push({
        priority: `p${items.length + 1}`,
        badge: `優先 ${items.length + 1}`,
        basis: men.flag === "no" ? "推薦提及" : "官網引用",
        title: "補充服務地區、主打項目與常見問題",
        summary: "用清楚文字說明地區與特色，協助 AI 辨識品牌。"
      });
    }
  }

  return items.slice(0, 3);
}

function scoreRingSvg(score) {
  const radius = 47;
  const circumference = 2 * Math.PI * radius;
  const value = Number.isFinite(score?.value) ? Math.max(0, Math.min(100, score.value)) : 0;
  const dashOffset = Number.isFinite(score?.value) ? circumference * (1 - value / 100) : circumference;
  const stroke = !Number.isFinite(score?.value)
    ? "#64748B"
    : score.tone === "yes"
      ? "#34D399"
      : score.tone === "part"
        ? "#FBBF24"
        : "#F87171";
  return `<svg width="116" height="116" viewBox="0 0 116 116" aria-hidden="true">
    <circle cx="58" cy="58" r="${radius}" fill="none" stroke="rgba(226,232,240,.12)" stroke-width="10"/>
    <circle cx="58" cy="58" r="${radius}" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}"
      transform="rotate(-90 58 58)"/>
  </svg>`;
}

function flagBadge(label, tone) {
  const safeTone = ["yes", "part", "no", "unknown", "absent"].includes(tone) ? tone : "unknown";
  return `<span class="f f-${safeTone}">${esc(label || "未知")}</span>`;
}

function heroSheetHtml(report, m, probes, checklist, passCount, checks) {
  const host = safeHost(report.finalUrl || report.url);
  const displayBrand = report.entity?.name || host;
  const subParts = [];
  if (report.entity?.name && report.entity.name !== host && host) subParts.push(host);
  if (report.entity?.location) subParts.push(report.entity.location);
  const measuredUrl = report.finalUrl || report.url || "";
  const entry = entryNote(report);
  const demo = isDemoReport(report);
  const score = resolveScore(m);
  const scoreAvailable = Number.isFinite(score.value);
  const scoreNote = scoreAvailable
    ? "綜合主動提及、官網引用、資訊正確性與行動入口。"
    : score.status === "partial"
      ? "四項都量到才給分；這次有項目沒拿到可判讀的回答，請看右側各項結果（未知不等於 0）。"
      : "缺少可判讀回答，暫不計分（未知不等於 0）。";

  const conclusion = buildNaturalConclusion(report, m);
  const tiles = buildHeroSummaryTiles(report, m);
  const priorities = buildPriorityItems(report, m, checks);
  const conclusionTone = hasMismatch(m) ? "part" : (m.mention?.flag === "yes" && m.citation?.flag === "yes" ? "yes" : "info");

  return `<section class="hero-sheet" aria-label="AI 能見度檢測單">
    <!-- A. Report Identity -->
    <div class="hero-identity">
      <div class="hero-eyebrow-row">
        <div class="hero-eyebrow-group">
          <span class="hero-eyebrow">GeoCheck · AI 能見度檢測單</span>
          ${demo ? `<span class="demo-badge">示範資料（非實際即時檢測）</span>` : ""}
        </div>
        <a class="method-link" href="#method-note">檢測方法與評估範圍說明 →</a>
      </div>
      <h1 class="hero-title">${esc(displayBrand)}${subParts.length ? ` <span class="hero-title-sub">${esc(subParts.join(" · "))}</span>` : ""}</h1>
      <div class="hero-meta">
        <span class="hero-meta-item">受檢網址 <b>${esc(measuredUrl || host || "—")}</b>${entry ? `（${esc(entry)}）` : ""}</span>
        <span class="hero-meta-item">檢測日期 <b>${esc(taipeiTime(report.createdAt))}</b></span>
        <span class="hero-meta-item">檢測範圍 <b>${esc(probeScopeText(probes))}</b></span>
      </div>
    </div>

    ${report.limited ? `<div class="limited-banner">本次無法完整讀取受測網站，未能詢問全部或部分 AI 題目；以下標示「未知」代表缺乏可判讀資料，不代表 0。</div>` : ""}

    <!-- B + C. Unified Score Ring + 4 Colorful MCAC Summary Grid -->
    <div class="overview-card" aria-label="AI 可見度總覽與四項結果摘要">
      <div class="gauge-zone">
        <div class="gauge-wrap">
          ${scoreRingSvg(score)}
          <div class="gauge-center">
            <span class="gauge-num">${scoreAvailable ? esc(score.value) : "—"}</span>
            <span class="gauge-den">${scoreAvailable ? "/ 100" : "未知"}</span>
          </div>
        </div>
        <div class="gauge-meta">
          <p class="score-label">AI 可見度</p>
          ${flagBadge(score.label, score.tone)}
          <p class="score-desc">${esc(scoreNote)}</p>
        </div>
      </div>
      <div class="strip-zone">
        ${tiles.map((t) => `<article class="hero-dim-card dim-tone--${t.cls}">
          <div class="hero-dim-top">
            <span class="hero-dim-label"><i class="dim-code-dot" aria-hidden="true">${t.code}</i> ${esc(t.dimLabel)}</span>
            ${flag(t.flagValue)}
          </div>
          <h3>${esc(t.question)}</h3>
          <div class="hero-dim-stat">${esc(t.stat)}</div>
          <p class="hero-dim-note">${esc(t.note)}</p>
        </article>`).join("\n")}
      </div>
    </div>

    <!-- One-sentence Dynamic Conclusion -->
    <div class="hero-conclusion tone-${conclusionTone}">
      <span class="hero-block-kicker">一句話結論</span>
      <p class="hero-conclusion__text">${esc(conclusion)}</p>
    </div>

    <!-- D. 1-3 Priority Actions -->
    <div class="hero-section">
      <div class="hero-section-head">
        <h2>建議優先處理事項</h2>
      </div>
      ${priorities.length ? `<ol class="hero-actions-list cols-${Math.min(priorities.length, 3)}">
        ${priorities.map((item) => `<li class="hero-action-item hero-action-item--${item.priority}">
          <div class="hero-action-head">
            <span class="hero-action-badge">${esc(item.badge)}</span>
            <span class="hero-action-basis">依據：${esc(item.basis)}</span>
          </div>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.summary)}</p>
        </li>`).join("\n")}
      </ol>` : `<div class="hero-actions-empty">
        <p>${(report.limited || [m.mention?.flag, m.citation?.flag, m.accuracy?.flag, m.conversion?.flag].every((v) => !v || v === "unknown"))
          ? "本次未能完整取得可核對資料，暫無足夠證據列出改善項目。"
          : "本次四項檢測未發現明確缺口，維持各平台資訊同步即可。"}</p>
      </div>`}
    </div>

    <!-- E. Navigation to Detailed Results -->
    <nav class="hero-detail-nav" aria-label="查看詳細結果">
      <span class="hero-detail-nav__label">詳細證據</span>
      <div class="hero-detail-nav__links">
        <a class="hero-jump" href="#detail-mcac">四項證據明細 ↓</a>
        <a class="hero-jump" href="#detail-probes">AI 原始回答（${esc(probes.length)} 題）↓</a>
        <a class="hero-jump" href="#detail-checks">網站基礎檢查（${checklist.length ? `${esc(passCount)}/${esc(checklist.length)} 通過` : "查看項目"}）↓</a>
      </div>
    </nav>
  </section>`;
}

function mcacReportHtml(report) {
  const m = report.mcac || {};
  const probes = Array.isArray(m.probes) ? m.probes : [];
  const checks = report.siteChecks || {};
  const host = safeHost(report.finalUrl || report.url);
  const brandTerms = resolveBrandTerms(report, m);
  const checklist = buildSiteChecklist(checks, report.limited);
  const passCount = checklist.filter((row) => row.status === "pass").length;

  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>AI 可見度健檢報告｜${esc(report.entity?.name || host)}｜LS-Labs GeoCheck</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=lslabs-20261023">
<link rel="icon" type="image/png" href="/favicon.png?v=lslabs-20261023">
<link rel="stylesheet" href="/assets/tokens.css">
<style>
:root{
  /* Compatibility & Canonical Palette Tokens */
  --ls-void:#070B14;
  --ls-navy:#0B1F3B;
  --ls-ink:#1E293B;
  --ls-accent-on-light:#1D4ED8;
  --text-body:1rem;

  /* Tech-Dark Surface System & Aurora */
  --void:#04060A;
  --surface:rgba(11,18,32,.90);
  --surface-elevated:rgba(15,24,42,.96);
  --surface-inset:rgba(6,10,18,.78);
  --line:rgba(226,232,240,.11);
  --line-strong:rgba(226,232,240,.22);

  /* Dark-Mode Typography Ink */
  --text-white:#FFFFFF;
  --text-heading:#F8FAFC;
  --text-main:#E2E8F0;
  --text-muted:#94A3B8;

  /* Multi-Accent MCAC Dimension Hues */
  --blue:#3B82F6;
  --blue-deep:#1D4ED8;
  --blue-bright:#60A5FA;
  --gc-m:#60A5FA;
  --gc-c1:#2DD4BF;
  --gc-a:#FBBF24;
  --gc-c2:#A78BFA;

  /* Semantic Status Colors (Dark Ground AA+) */
  --yes:#34D399;
  --yes-bg:rgba(16,185,129,.12);
  --yes-border:rgba(52,211,153,.32);
  --part:#FBBF24;
  --part-bg:rgba(245,158,11,.12);
  --part-border:rgba(251,191,36,.32);
  --no:#F87171;
  --no-bg:rgba(239,68,68,.12);
  --no-border:rgba(248,113,113,.32);
  --grey:#94A3B8;
  --grey-bg:rgba(148,163,184,.10);
  --grey-border:rgba(148,163,184,.24);

  /* System Typography Scale (No Custom Web Fonts) */
  --font-sans:system-ui,-apple-system,"Segoe UI","PingFang TC","Microsoft JhengHei",sans-serif;
  --text-h1:clamp(1.6rem,2.5vw,2.05rem);
  --text-h2:1.25rem;
  --text-h3:1.05rem;
  --text-sm:0.9375rem;
  --text-meta:0.875rem;
  --leading-tight:1.3;
  --leading-snug:1.48;
  --leading-body:1.65;

  /* Layout, Spacing & Restrained Elevation */
  --container-max:1120px;
  --space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;
  --space-5:20px;--space-6:24px;--space-8:32px;--space-10:42px;
  --radius-sm:6px;--radius-md:10px;--radius-lg:14px;
  --shadow-card:0 20px 50px -28px rgba(0,0,0,.88);
  --transition-fast:150ms cubic-bezier(.4,0,.2,1);
  --focus-ring:2px solid var(--blue-bright);
}

*{box-sizing:border-box}
html{font-size:16px;scroll-behavior:smooth;overflow-x:hidden}
body{
  margin:0;
  min-height:100vh;
  background-color:var(--void);
  background-image:
    radial-gradient(38% 30% at 74% 12%,rgba(59,130,246,.16),transparent 70%),
    radial-gradient(30% 26% at 16% 70%,rgba(139,124,246,.12),transparent 70%),
    radial-gradient(24% 22% at 88% 82%,rgba(45,212,191,.08),transparent 70%);
  background-attachment:fixed;
  color:var(--text-main);
  font-family:var(--font-sans);
  font-size:var(--text-body);
  line-height:var(--leading-body);
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}
a{color:var(--blue-bright);text-decoration:none;transition:color var(--transition-fast)}
a:hover{color:#93C5FD;text-decoration:underline;text-underline-offset:3px}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:var(--focus-ring);outline-offset:2px;border-radius:4px}

.wrap{max-width:var(--container-max);margin:0 auto;padding-inline:var(--space-6)}

/* Sticky Dark Glass Header */
.gc-header{background:rgba(4,6,10,.82);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
.gc-header__inner{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-3) var(--space-5);min-height:62px;padding-block:10px}
.gc-brand{display:inline-flex;align-items:center;gap:12px;color:#FFFFFF;text-decoration:none;flex-shrink:0}
.gc-brand:hover{text-decoration:none;color:#FFFFFF}
.brand-wordmark{height:25px;width:auto;display:block}
.gc-brand__product{padding-left:12px;border-left:1px solid var(--line-strong);font:600 var(--text-sm)/1 var(--font-sans);color:var(--text-muted);letter-spacing:.01em}
.top-actions{display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:600 var(--text-meta)/1 var(--font-sans);padding:9px 14px;border-radius:var(--radius-sm);border:1px solid transparent;cursor:pointer;text-decoration:none;white-space:nowrap;transition:background-color var(--transition-fast),border-color var(--transition-fast),color var(--transition-fast)}
.btn-header-ghost{background:rgba(15,24,42,.78);border-color:var(--line-strong);color:var(--text-heading)}
.btn-header-ghost:hover{text-decoration:none;background:rgba(59,130,246,.16);border-color:var(--blue-bright);color:#FFFFFF}
.btn-primary{background:var(--blue-deep);border-color:rgba(96,165,250,.4);color:#FFFFFF}
.btn-primary:hover{text-decoration:none;background:#1E40AF;color:#FFFFFF}

/* Main Report Canvas */
.main{padding:20px 0 var(--space-10)}

/* First Screen Dark Tech Sheet */
.hero-sheet{background:var(--surface);color:var(--text-main);border:1px solid var(--line-strong);border-radius:var(--radius-lg);padding:var(--space-5) 26px;box-shadow:var(--shadow-card)}
.hero-identity{padding-bottom:var(--space-3);border-bottom:1px solid var(--line)}
.hero-eyebrow-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-2) var(--space-4);margin-bottom:6px}
.hero-eyebrow-group{display:flex;align-items:center;flex-wrap:wrap;gap:var(--space-2)}
.hero-eyebrow{font:600 var(--text-meta)/1.3 var(--font-sans);color:var(--blue-bright)}
.demo-badge{display:inline-flex;align-items:center;padding:0 0 0 10px;border:0;border-left:1px solid var(--line-strong);border-radius:0;background:transparent;font:600 var(--text-meta)/1.3 var(--font-sans);color:var(--part)}
.method-link{font:600 var(--text-meta)/1.3 var(--font-sans);color:var(--blue-bright)}
.hero-title{margin:0;font:700 var(--text-h1)/1.24 var(--font-sans);color:var(--text-white);letter-spacing:-.015em;overflow-wrap:anywhere}
.hero-title-sub{display:inline-block;font:500 .54em/1.4 var(--font-sans);color:var(--text-muted);margin-left:8px;vertical-align:baseline}
.hero-meta{display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:6px;font:400 var(--text-meta)/1.5 var(--font-sans);color:var(--text-muted)}
.hero-meta-item b{color:var(--text-heading);font-weight:600;overflow-wrap:anywhere}

.limited-banner{margin-top:var(--space-3);background:var(--part-bg);border:1px solid var(--part-border);border-left:3px solid var(--part);color:#FDE68A;border-radius:var(--radius-sm);padding:var(--space-3) var(--space-4);font:500 var(--text-sm)/1.55 var(--font-sans)}

/* Unified Overview Card (0-100 Score Ring + 2x2 Colorful MCAC Strip) */
.overview-card{margin-top:var(--space-4);background:rgba(15,24,42,.55);border:1px solid var(--line-strong);border-radius:var(--radius-md);display:grid;grid-template-columns:285px minmax(0,1fr);overflow:hidden}
.gauge-zone{padding:var(--space-4) var(--space-5);border-right:1px solid var(--line);display:flex;align-items:center;gap:16px;min-width:0;background:linear-gradient(180deg,rgba(15,24,42,.82),rgba(11,18,32,.48))}
.gauge-wrap{position:relative;width:116px;height:116px;flex-shrink:0}
.gauge-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.gauge-num{font:700 2.15rem/1 var(--font-sans);color:var(--text-white);font-variant-numeric:tabular-nums;letter-spacing:-.03em}
.gauge-den{font:500 13px/1 var(--font-sans);color:var(--text-muted);margin-top:4px}
.gauge-meta{min-width:0}
.score-label{margin:0 0 6px;font:700 var(--text-sm)/1.2 var(--font-sans);color:var(--text-white)}
.score-desc{margin:6px 0 0;font:400 13.5px/1.48 var(--font-sans);color:var(--text-muted)}

.strip-zone{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--line);min-width:0}
.hero-dim-card{background:var(--surface);padding:13px var(--space-4);display:flex;flex-direction:column;gap:4px;min-width:0;position:relative}
.dim-tone--m{box-shadow:inset 3px 0 0 var(--gc-m)}
.dim-tone--c1{box-shadow:inset 3px 0 0 var(--gc-c1)}
.dim-tone--a{box-shadow:inset 3px 0 0 var(--gc-a)}
.dim-tone--c2{box-shadow:inset 3px 0 0 var(--gc-c2)}
.hero-dim-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.hero-dim-label{display:inline-flex;align-items:center;gap:6px;font:600 13.5px/1.2 var(--font-sans);color:var(--text-muted)}
.dim-code-dot{font-style:normal;font-weight:800;font-size:13px}
.dim-tone--m .dim-code-dot{color:var(--gc-m)}
.dim-tone--c1 .dim-code-dot{color:var(--gc-c1)}
.dim-tone--a .dim-code-dot{color:var(--gc-a)}
.dim-tone--c2 .dim-code-dot{color:var(--gc-c2)}
.hero-dim-card h3{margin:2px 0 0;font:700 var(--text-h3)/1.3 var(--font-sans);color:var(--text-white)}
.hero-dim-stat{font:700 var(--text-sm)/1.4 var(--font-sans);font-variant-numeric:tabular-nums;color:var(--text-heading);overflow-wrap:anywhere}
.hero-dim-note{margin:0;font:400 13.5px/1.4 var(--font-sans);color:var(--text-muted)}

/* One-sentence Conclusion */
.hero-conclusion{margin-top:var(--space-3);background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.22);border-left:3px solid var(--blue-bright);border-radius:var(--radius-sm);padding:10px var(--space-4)}
.hero-conclusion.tone-part{background:var(--part-bg);border-color:var(--part-border);border-left-color:var(--part)}
.hero-conclusion.tone-yes{background:var(--yes-bg);border-color:var(--yes-border);border-left-color:var(--yes)}
.hero-block-kicker{display:inline-block;font:600 13px/1.2 var(--font-sans);color:var(--blue-bright);margin-bottom:2px}
.hero-conclusion.tone-part .hero-block-kicker{color:var(--part)}
.hero-conclusion.tone-yes .hero-block-kicker{color:var(--yes)}
.hero-conclusion__text{margin:0;font:700 var(--text-body)/1.5 var(--font-sans);color:var(--text-white)}

/* D. Compact Priority Actions */
.hero-section{margin-top:var(--space-4)}
.hero-section-head{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px var(--space-4);margin-bottom:var(--space-2)}
.hero-section-head h2{margin:0;font:700 var(--text-sm)/1.3 var(--font-sans);color:var(--text-muted)}
.hero-actions-list{list-style:none;margin:0;padding:0;display:grid;gap:var(--space-3);grid-template-columns:minmax(0,1fr)}
.hero-actions-list.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.hero-actions-list.cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.hero-action-item{background:var(--surface-inset);border:1px solid var(--line);border-left:3px solid var(--blue-bright);border-radius:var(--radius-sm);padding:10px 14px;min-width:0}
.hero-action-item--p1{border-left-color:var(--no)}
.hero-action-item--p2{border-left-color:var(--part)}
.hero-action-head{display:flex;align-items:center;flex-wrap:wrap;gap:6px var(--space-2);margin-bottom:3px}
.hero-action-badge{padding:0;border:0;border-radius:0;background:transparent;font:700 var(--text-meta)/1.2 var(--font-sans);color:var(--blue-bright)}
.hero-action-item--p1 .hero-action-badge{color:var(--no);background:transparent}
.hero-action-item--p2 .hero-action-badge{color:var(--part);background:transparent}
.hero-action-basis{font:500 13px/1.2 var(--font-sans);color:var(--text-muted)}
.hero-action-item h3{margin:0 0 2px;font:700 var(--text-sm)/1.35 var(--font-sans);color:var(--text-white)}
.hero-action-item p{margin:0;font:400 13.5px/1.45 var(--font-sans);color:var(--text-muted)}
.hero-actions-empty{background:var(--surface-inset);border:1px solid var(--line);border-radius:var(--radius-sm);padding:10px 14px}
.hero-actions-empty p{margin:0;font:500 var(--text-sm)/1.5 var(--font-sans);color:var(--text-muted)}

/* E. Navigation to Detail Sections */
.hero-detail-nav{margin-top:var(--space-4);padding-top:var(--space-3);border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-2) var(--space-4)}
.hero-detail-nav__label{font:600 var(--text-meta)/1.4 var(--font-sans);color:var(--text-muted)}
.hero-detail-nav__links{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.hero-jump{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:var(--radius-sm);background:var(--surface-elevated);border:1px solid var(--line-strong);color:var(--text-heading);font:600 var(--text-meta)/1.3 var(--font-sans);transition:background-color var(--transition-fast),border-color var(--transition-fast),color var(--transition-fast)}
.hero-jump:hover{text-decoration:none;border-color:var(--blue-bright);color:#FFFFFF;background:rgba(59,130,246,.16)}

/* Semantic Status Indicators (Plain text + dot, zero capsule backgrounds) */
.f{display:inline-flex;align-items:center;gap:6px;padding:0;border:0;border-radius:0;background:transparent;font:700 var(--text-meta)/1.35 var(--font-sans);white-space:nowrap;flex-shrink:0}
.f::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0}
.f-yes{color:var(--yes)}
.f-part{color:var(--part)}
.f-no{color:var(--no)}
.f-unknown{color:var(--grey);font-weight:500}.f-unknown::before{background:transparent;border:1.5px solid currentColor}
.f-absent{color:var(--grey);font-weight:500}.f-absent::before{width:7px;height:1.5px;border-radius:1px}

/* Section Headers */
.sec-head{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:var(--space-2) var(--space-4);margin:var(--space-10) 0 var(--space-5);padding-bottom:var(--space-3);border-bottom:1px solid var(--line-strong);scroll-margin-top:84px}
.sec-head h2{margin:0;font:700 var(--text-h2)/var(--leading-tight) var(--font-sans);color:var(--text-white);letter-spacing:-.01em}
.sec-head-meta{font:400 var(--text-meta)/1.5 var(--font-sans);color:var(--text-muted);display:flex;align-items:center;gap:10px;flex-wrap:wrap}

/* 2x2 Deep-Dive Evidence Cards */
.card{background:var(--surface);border:1px solid var(--line-strong);border-radius:var(--radius-md);padding:var(--space-5) var(--space-6);min-width:0;box-shadow:var(--shadow-card)}
.dim-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-5)}
@media(max-width:860px){.dim-grid{grid-template-columns:minmax(0,1fr)}}
.dim-card{display:flex;flex-direction:column;gap:var(--space-4);border-top-width:3px}
#dim-mention{border-top-color:var(--gc-m)}
#dim-citation{border-top-color:var(--gc-c1)}
#dim-accuracy{border-top-color:var(--gc-a)}
#dim-conversion{border-top-color:var(--gc-c2)}
.dim-head{display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3)}
.dim-code{font:700 13px/1.2 var(--font-sans);color:var(--text-muted);display:block;margin-bottom:3px;letter-spacing:.02em}
#dim-mention .dim-code{color:var(--gc-m)}
#dim-citation .dim-code{color:var(--gc-c1)}
#dim-accuracy .dim-code{color:var(--gc-a)}
#dim-conversion .dim-code{color:var(--gc-c2)}
.dim-head h3{margin:0;font:700 var(--text-h3)/var(--leading-snug) var(--font-sans);color:var(--text-white)}
.dim-hint{margin:4px 0 0;font-size:var(--text-meta);line-height:1.5;color:var(--text-muted)}
.sub-label{font:600 var(--text-meta)/1.35 var(--font-sans);color:var(--text-heading);margin:0 0 var(--space-2)}
.detail-subblock{padding-top:var(--space-3);border-top:1px solid var(--line)}

/* Visual Module 1: Mention Position Bar (1-10 listed slots + compact probe rows) */
.pos-bar-wrap{display:flex;flex-direction:column;gap:8px}
.pos-grid{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:5px}
.pos-slot{text-align:center;font:600 13px/28px var(--font-sans);font-variant-numeric:tabular-nums;border-radius:6px;background:var(--surface-inset);color:var(--text-muted);border:1px solid var(--line)}
.pos-slot.hit{background:var(--blue);color:#FFFFFF;border-color:var(--blue-bright);box-shadow:0 0 14px rgba(59,130,246,.45)}
.pos-caption{margin:0;font:400 13.5px/1.45 var(--font-sans);color:var(--text-muted)}
.pos-caption strong{color:var(--gc-m)}
.mention-probe-list{list-style:none;margin:0;padding:0}
.mention-probe-row{padding:10px 0;display:flex;flex-direction:column;gap:4px}
.mention-probe-row+.mention-probe-row{border-top:1px solid var(--line)}
.mention-probe-row:first-child{padding-top:0}
.mention-probe-row:last-child{padding-bottom:0}
.mention-probe-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-2)}
.mention-probe-title{color:var(--text-heading);font:600 var(--text-sm)/1.4 var(--font-sans);min-width:0;overflow-wrap:anywhere}
.mention-probe-meta{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px var(--space-3);font-size:13.5px;color:var(--text-muted)}
.evidence-jump{display:inline-flex;align-items:center;gap:4px;font:600 13.5px/1.3 var(--font-sans);color:var(--blue-bright);white-space:nowrap}

/* Visual Module 2: Citation Split + Multi-Color Proportional Bar & Legend */
.citation-metrics-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--radius-sm);overflow:hidden}
.citation-metric-cell{background:var(--surface-inset);padding:var(--space-3) var(--space-4);display:flex;flex-direction:column;gap:3px;min-width:0}
.citation-metric-label{font:600 13px/1.3 var(--font-sans);color:var(--text-muted)}
.citation-metric-val{font:700 1.0625rem/1.35 var(--font-sans);font-variant-numeric:tabular-nums;color:var(--text-white)}
.citation-metric-sub{font:400 12.5px/1.4 var(--font-sans);color:var(--text-muted)}
.source-bar-track{display:flex;height:10px;border-radius:3px;background:var(--surface-inset);overflow:hidden;gap:2px}
.source-bar-fill{display:block;height:100%;min-width:6px}
.legend-list{display:flex;flex-wrap:wrap;gap:8px 16px;list-style:none;margin:10px 0 0;padding:0;font-size:13.5px}
.legend-item{display:inline-flex;align-items:center;gap:6px;color:var(--text-main)}
.legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.url-ref-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.url-ref-item{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;font-size:13.5px;overflow-wrap:anywhere}
.url-ref-item a.url-raw{font-family:var(--font-sans);color:var(--gc-c1);overflow-wrap:anywhere}
.url-ref-links{display:flex;flex-wrap:wrap;gap:6px 10px}

/* Visual Module 3: Accuracy Compact Table */
table{width:100%;border-collapse:collapse}
.facts th,.facts td{text-align:left;vertical-align:top;padding:10px 8px;border-bottom:1px solid var(--line);font-size:var(--text-sm);overflow-wrap:anywhere}
.facts thead th{font:600 13px/1.3 var(--font-sans);color:var(--text-muted);background:var(--surface-inset);border-bottom:1px solid var(--line-strong)}
.facts thead th:last-child{text-align:right}
.facts tbody th{color:var(--text-heading);font-weight:600;white-space:nowrap;padding-right:10px}
.facts tbody tr:last-child th,.facts tbody tr:last-child td{border-bottom:0}
.facts td.flag{text-align:right;white-space:nowrap;font-weight:600;color:var(--text-heading)}
.fact-row--mismatch th,.fact-row--mismatch td{background:var(--part-bg)}
.fact-row--mismatch th{box-shadow:inset 3px 0 0 var(--part)}
.fact-status-plain{font:500 var(--text-sm)/1.4 var(--font-sans);color:var(--text-muted)}
.fact-sub-status{display:block;font:500 12.5px/1.35 var(--font-sans);color:#FDE68A;margin-top:2px;white-space:normal}
.mismatch-banner{background:var(--part-bg);border:1px solid var(--part-border);border-left:3px solid var(--part);color:#FDE68A;border-radius:var(--radius-sm);padding:10px 14px;font-size:13.5px;line-height:1.55}
.dim-foot-link{margin-top:auto;padding-top:var(--space-3);border-top:1px solid var(--line);display:flex;justify-content:flex-end}

/* Visual Module 4: Conversion Compact 2x2 Entry Tiles */
.entry-check-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.entry-check-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:var(--surface-inset);border:1px solid var(--line);border-radius:var(--radius-sm)}
.entry-check-row--yes{border-color:var(--yes-border);background:var(--yes-bg)}
.entry-check-row--no{border-color:var(--no-border);background:var(--no-bg)}
.entry-check-name{font:600 var(--text-sm)/1.35 var(--font-sans);color:var(--text-heading);min-width:0;overflow-wrap:anywhere}
.entry-badge{display:inline-flex;align-items:center;padding:0;border:0;border-radius:0;background:transparent;font:700 var(--text-meta)/1.3 var(--font-sans);white-space:nowrap;flex-shrink:0}
.entry-badge--yes{color:var(--yes)}
.entry-badge--no{color:var(--no)}
.entry-badge--untested,.entry-badge--na{color:var(--grey);font-weight:500}
.conv-action-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.conv-action-row{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap;font-size:var(--text-sm);padding-bottom:8px;border-bottom:1px solid var(--line)}
.conv-action-row:last-child{padding-bottom:0;border-bottom:0}
.conv-action-main{min-width:0;flex:1;overflow-wrap:anywhere}
.conv-action-type{font-weight:700;color:var(--gc-c2);margin-right:8px}
.conv-action-owner{font:500 var(--text-meta)/1.3 var(--font-sans);padding:0;border:0;border-radius:0;background:transparent;color:var(--text-muted);white-space:nowrap}
.conv-action-owner.official{color:var(--yes);font-weight:600;background:transparent}

/* Transcripts */
.probes-group{background:var(--surface);border:1px solid var(--line-strong);border-radius:var(--radius-md);overflow:hidden;box-shadow:var(--shadow-card)}
.probe-card{background:transparent;scroll-margin-top:84px}
.probe-card+.probe-card{border-top:1px solid var(--line)}
.probe-card[open]{border-left:3px solid var(--blue-bright)}
.probe-card summary{cursor:pointer;padding:var(--space-4) var(--space-5);font:600 var(--text-body)/1.5 var(--font-sans);color:var(--text-white);display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);list-style:none;transition:background-color var(--transition-fast)}
.probe-card summary::-webkit-details-marker{display:none}
.probe-card summary:hover{background:rgba(59,130,246,.08)}
.probe-q{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;flex:1}
.probe-q::before{content:"▸";color:var(--text-muted);font-size:.9em;flex-shrink:0}
.probe-card[open] .probe-q::before{content:"▾";color:var(--blue-bright)}
.probe-num{font:600 var(--text-meta)/1.2 var(--font-sans);color:var(--text-muted);flex-shrink:0}
.probe-type{font:700 var(--text-meta)/1.3 var(--font-sans);padding:0;border:0;border-radius:0;background:transparent;color:var(--gc-m);flex-shrink:0}
.probe-type--fact{color:var(--gc-a)}
.probe-type--action{color:var(--gc-c2)}
.probe-badges{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0}
.probe-src-tag{font:400 var(--text-meta)/1.3 var(--font-sans);padding:0 0 0 10px;border:0;border-left:1px solid var(--line-strong);border-radius:0;background:transparent;color:var(--text-muted);white-space:nowrap}
.probe-src-tag.is-official{color:var(--gc-c1);font-weight:600;background:transparent}
.probe-body{padding:0 var(--space-5) var(--space-5);border-top:1px solid var(--line)}
.probe-evidence-box{margin-top:var(--space-4);padding:var(--space-3) var(--space-4);background:rgba(59,130,246,.10);border-left:3px solid var(--blue-bright);border-radius:0 var(--radius-sm) var(--radius-sm) 0;font:400 var(--text-sm)/1.6 var(--font-sans);color:var(--text-heading);overflow-wrap:anywhere}
.probe-evidence-label{display:block;font:600 13px/1.3 var(--font-sans);color:var(--blue-bright);margin-bottom:4px}
.probe-sub-head{margin:var(--space-4) 0 6px;font:600 var(--text-meta)/1.3 var(--font-sans);color:var(--text-muted)}
.answer{white-space:pre-wrap;background:var(--surface-inset);border:1px solid var(--line);border-radius:var(--radius-sm);padding:var(--space-4);font:400 var(--text-body)/1.7 var(--font-sans);margin:0;color:var(--text-heading);overflow-wrap:anywhere}
mark.brand-mark{background:rgba(59,130,246,.28);color:#BAE6FD;font-weight:700;padding:1px 4px;border-radius:3px;border-bottom:1.5px solid var(--blue-bright)}
.src-block{margin-top:var(--space-3);padding-top:var(--space-3);border-top:1px solid var(--line)}
.src{font:400 var(--text-meta)/1.75 var(--font-sans);color:var(--text-muted);margin:0;padding-left:20px;overflow-wrap:anywhere}

/* Role-Grouped Collapsible Site Checks */
.checks-groups{display:flex;flex-direction:column;gap:var(--space-4)}
.checks-role-card{padding:0;overflow:hidden}
.checks-role-head{padding:var(--space-4) var(--space-6);border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--space-2) var(--space-4);background:var(--surface-inset)}
.checks-role-head h3{margin:0;font:700 var(--text-h3)/1.35 var(--font-sans);color:var(--text-white)}
.checks-role-head p{margin:2px 0 0;font-size:13.5px;color:var(--text-muted)}
.checks-role-count{font:600 var(--text-meta)/1.2 var(--font-sans);font-variant-numeric:tabular-nums;color:var(--yes);white-space:nowrap}
.checks-all-pass{margin:0;padding:var(--space-4) var(--space-6);font-size:var(--text-sm);color:var(--yes)}
.checks-table th,.checks-table td{padding:var(--space-3) var(--space-6);border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:var(--text-sm)}
.checks-table thead th{font:600 13px/1.3 var(--font-sans);color:var(--text-muted);background:var(--surface-inset)}
.checks-table tbody tr:last-child td,.checks-table tbody tr:last-child th{border-bottom:0}
.chk-group{display:inline-block;font:600 13px/1.3 var(--font-sans);color:var(--text-muted);background:transparent;border:0;padding:0;margin-right:8px}
.chk-name{font-weight:700;color:var(--text-heading)}
.chk-impact{display:block;font-size:13px;color:var(--text-muted);margin-top:3px}
.chk-status{text-align:right;white-space:nowrap}
.chk-pill{display:inline-flex;align-items:center;gap:5px;padding:0;border:0;border-radius:0;background:transparent;font:600 var(--text-meta)/1.3 var(--font-sans)}
.chk-pill.pass{color:var(--yes);font-weight:700;background:transparent}
.chk-pill.grey{color:var(--grey);font-weight:500;background:transparent}
.checks-summary-badge{font:600 var(--text-meta)/1.3 var(--font-sans);font-variant-numeric:tabular-nums;padding:0;border:0;border-radius:0;background:transparent;color:var(--yes)}
.checks-pass-group{border-top:1px solid var(--line);background:var(--surface-inset)}
.checks-pass-group summary{cursor:pointer;padding:12px var(--space-6);font:600 var(--text-sm)/1.4 var(--font-sans);color:var(--blue-bright);list-style:none;transition:background-color var(--transition-fast)}
.checks-pass-group summary::-webkit-details-marker{display:none}
.checks-pass-group summary:hover{background:rgba(59,130,246,.08)}

/* Method & Boundary Note Section */
.method-card{margin-top:var(--space-10);scroll-margin-top:84px}
.method-card h2{margin:0 0 var(--space-2);font:700 var(--text-h2)/1.35 var(--font-sans);color:var(--text-white)}
.method-lead{margin:0 0 var(--space-3);font:400 var(--text-body)/var(--leading-body) var(--font-sans);color:var(--text-main)}
.limits-list{margin:0;padding-left:20px;font:400 var(--text-sm)/1.7 var(--font-sans);color:var(--text-muted)}
.foot{margin-top:var(--space-8);padding-top:var(--space-5);border-top:1px solid var(--line);text-align:center;font:400 var(--text-meta)/1.75 var(--font-sans);color:var(--text-muted);overflow-wrap:anywhere}

@media(max-width:960px){
  .overview-card{grid-template-columns:minmax(0,1fr)}
  .gauge-zone{border-right:0;border-bottom:1px solid var(--line)}
  .hero-actions-list.cols-2,.hero-actions-list.cols-3{grid-template-columns:minmax(0,1fr)}
}
@media(max-width:720px){
  .strip-zone,.citation-metrics-split,.entry-check-list{grid-template-columns:minmax(0,1fr)}
}
@media(max-width:640px){
  .wrap{padding-inline:var(--space-4)}
  .gc-header__inner{padding-block:10px}
  .brand-wordmark{height:23px}
  .top-actions{width:100%}
  .top-actions .btn{flex:1 1 auto;min-height:40px;padding:8px 10px}
  .hero-sheet{padding:var(--space-5) var(--space-4);border-radius:var(--radius-md)}
  .gauge-zone{flex-direction:column;text-align:center;padding:var(--space-4)}
  .hero-dim-card{padding:var(--space-4)}
  .hero-title-sub{display:block;margin-left:0;margin-top:4px;font-size:.6em}
  .hero-detail-nav{align-items:flex-start}
  .hero-jump{width:100%;justify-content:space-between;min-height:42px}
  .card{padding:var(--space-5) var(--space-4)}
  .pos-grid{grid-template-columns:repeat(5,minmax(0,1fr))}
  .facts thead{display:none}
  .facts tr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 10px;padding:12px 0;border-bottom:1px solid var(--line)}
  .fact-row--mismatch{padding-inline:10px}
  .facts tbody th{grid-column:1;border:0;padding:0;white-space:normal}
  .facts td{grid-column:1 / -1;border:0;padding:0;font-size:var(--text-sm)}
  .facts td[data-label]::before{content:attr(data-label) "：";font-weight:600;color:var(--text-muted)}
  .facts td.flag{grid-row:1;grid-column:2;align-self:start}
  .probe-card summary{flex-direction:column;align-items:flex-start}
  .checks-role-head,.checks-pass-group summary,.probe-card summary,.probe-body{padding-inline:var(--space-4)}
  .checks-table thead{display:none}
  .checks-table,.checks-table tbody,.checks-table tr,.checks-table th,.checks-table td{display:block;width:100%}
  .checks-table tr{padding:12px var(--space-4);border-bottom:1px solid var(--ls-line)}
  .checks-table th,.checks-table td{padding:3px 0;border:0}
  .chk-status{text-align:left;margin-top:6px}
}

@media print{
  @page{margin:12mm}
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  body{background:#fff !important;color:#1E293B !important;font-size:12.5px}
  .top-actions,.hero-detail-nav,.method-link{display:none !important}
  .gc-header{position:static;background:#fff !important;border-bottom:2px solid #0B1F3B}
  .brand-wordmark path,.brand-wordmark rect{fill:#0B1F3B !important}
  .brand-wordmark path.ls-curve{fill:none !important;stroke:#0B1F3B !important}
  .brand-wordmark circle.ls-dot{fill:#1D4ED8 !important}
  .gc-brand__product{color:#475569 !important;border-color:#CBD5E1 !important}
  .hero-sheet,.overview-card,.hero-dim-card,.gauge-zone,.card,.probes-group,.method-card,.citation-metric-cell,.entry-check-row,.answer,.hero-action-item,.checks-role-head,.checks-pass-group{background:#fff !important;color:#1E293B !important;border-color:#CBD5E1 !important;box-shadow:none !important}
  .hero-title,.gauge-num,.score-label,.hero-dim-card h3,.hero-dim-stat,.dim-head h3,.sec-head h2,.citation-metric-val,.entry-check-name,.probe-card summary,.checks-role-head h3,.chk-name,.method-card h2,.facts tbody th,.facts td.flag{color:#0B1F3B !important}
  .hero-meta,.hero-dim-label,.hero-dim-note,.score-desc,.dim-hint,.sec-head-meta,.limits-list,.foot,.citation-metric-sub{color:#475569 !important}
  .f-yes,.entry-badge--yes,.chk-pill.pass{color:#047857 !important}
  .f-part,.hero-action-item--p2 .hero-action-badge{color:#B45309 !important}
  .f-no,.entry-badge--no,.hero-action-item--p1 .hero-action-badge{color:#B91C1C !important}
  .hero-dim-card,.hero-action-item,.dim-card{break-inside:avoid}
  details>*{display:block !important}
}
</style>
</head>
<body>

<header class="gc-header">
  <div class="wrap gc-header__inner">
    <a class="gc-brand" href="https://lslabs.tw/" aria-label="LS-Labs 首頁">
      ${brandLogoSvg()}
      <span class="gc-brand__product">GeoCheck</span>
    </a>
    <div class="top-actions">
      <a class="btn btn-header-ghost" href="/report/${encodeURIComponent(report.id || "")}/markdown" data-track-action="download_report">下載 Markdown</a>
      <button type="button" class="btn btn-header-ghost" onclick="window.print()" data-track-action="download_pdf">下載 PDF</button>
      <a class="btn btn-primary" href="https://geocheck.lslabs.tw/">再檢查一次</a>
    </div>
  </div>
</header>

<main class="main">
  <div class="wrap">
    <!-- First Screen: A-E Consultant Health-Check Sheet -->
    ${heroSheetHtml(report, m, probes, checklist, passCount, checks)}

    <!-- Detailed Evidence 1: Four MCAC Dimensions -->
    <div class="sec-head" id="detail-mcac">
      <h2>四項檢測證據明細</h2>
      <span class="sec-head-meta">各構面獨立判讀，點連結直接展開對應原始回答</span>
    </div>
    <section class="dim-grid">
      ${mentionCardHtml(m, brandTerms)}
      ${citationCardHtml(m)}
      ${accuracyCardHtml(report, m)}
      ${conversionCardHtml(report, m)}
    </section>

    <!-- Detailed Evidence 2: Raw Probe Transcripts -->
    <div class="sec-head" id="detail-probes">
      <h2>每一題的原始回答與來源</h2>
      <span class="sec-head-meta">展開查看對應問題、支持結論段落與引用網址（無網址不另編造）</span>
    </div>
    <section>
      ${probes.length ? `<div class="probes-group">${probes.map((probe, index) => probeBlock(probe, index, brandTerms, m, report)).join("\n")}</div>` : `<div class="card"><p style="margin:0;color:var(--text-muted)">這次沒有可顯示的回答。</p></div>`}
    </section>

    <!-- Detailed Evidence 3: Unscored Role-Grouped Collapsible Site Checks -->
    <div class="sec-head" id="detail-checks">
      <h2>網站基礎檢查（不計入 AI 可見度分數）</h2>
      <span class="sec-head-meta">${checklist.length ? `<span class="checks-summary-badge">已通過 ${esc(passCount)} / ${esc(checklist.length)} 項</span>` : ""}<span>網站體質良好不保證一定被推薦，僅用於排除讀取障礙</span></span>
    </div>
    <section class="checks-groups">
      ${checklistTableHtml(checklist)}
    </section>

    <!-- Method Definition & Boundary Note (replaces duplicate bottom sheet) -->
    <section class="card method-card" id="method-note">
      <h2>檢測方法與評估範圍說明</h2>
      <p class="method-lead">首屏的 0–100「AI 可見度」由 MCAC 四項結果（提及、引用來源、資訊正確性、行動資訊）依固定配分合成，四項都量到才給分。分數只是總覽，要改善什麼請看四項結果與原始回答。配分與限制見 <a href="https://geocheck.lslabs.tw/whitepaper#mcac-score">方法說明</a>。</p>
      <ul class="limits-list">
        <li>每次檢測為 1 到 2 題的單次快檢快照（推薦題、事實題、行動題），隨時間、問法或地區語境不同，AI 回答結果可能變動。</li>
        <li>「被提到」不等於推薦順位第一，也可能是比較或條件性提及；引用來源出現次數不代表模型內部的排序權重。</li>
        <li>「和你的頁面不一致」僅代表 AI 回答與受測頁面文字不同，可能是外部平台尚未更新，也可能是網站本身資訊過時。</li>
        <li>「網站基礎檢查」為固定結構與內容條件掃描，不計入任何分數；規則為 v0 暫定（${esc(m.flag_rules_version || "mcac-flags-v0")}），未量測實際來客轉換。</li>
      </ul>
    </section>

    <p class="foot">GeoCheck by LS-Labs · MCAC v${esc(String(m.method_version || "0.2.0"))} · ${esc(pipelineLabel(report))} · 報告識別：${esc(report.id || "—")}<br>方法依據：<a href="https://lslabs.tw/blog/AI搜尋時代的檢索機制報告/" target="_blank" rel="noopener noreferrer">AI 搜尋時代的檢索機制報告</a></p>
  </div>
</main>
<script>
(function(){
  var opened = [];
  window.addEventListener("beforeprint", function(){
    opened = [];
    document.querySelectorAll("details").forEach(function(d){
      if (!d.open) { opened.push(d); d.open = true; }
    });
  });
  window.addEventListener("afterprint", function(){
    opened.forEach(function(d){ d.open = false; });
    opened = [];
  });
  function openTargetDetails(hash) {
    if (!hash || hash.charAt(0) !== "#") return;
    var el = document.getElementById(hash.slice(1));
    if (el && el.tagName && el.tagName.toLowerCase() === "details") el.open = true;
  }
  document.addEventListener("click", function(event){
    var anchor = event.target && event.target.closest ? event.target.closest('a[href^="#probe-"]') : null;
    if (!anchor) return;
    openTargetDetails(anchor.getAttribute("href"));
  });
  window.addEventListener("hashchange", function(){ openTargetDetails(window.location.hash); });
  openTargetDetails(window.location.hash);
})();
</script>
</body>
</html>`;
}

function mentionCardHtml(m, brandTerms) {
  const mention = m.mention || {};
  const ranks = (mention.ranks || []).filter((r) => Number.isFinite(r));
  const rankSet = new Set(ranks.filter((r) => r >= 1 && r <= 10));
  const allProbes = Array.isArray(m.probes) ? m.probes : [];
  const discoveryEntries = allProbes
    .map((probe, probeIdx) => ({ probe, probeIdx }))
    .filter(({ probe }) => probe?.type === "discovery");
  const optionGroups = resolveOptionsByProbe(m, brandTerms);
  let answeredIdx = 0;

  return `<article class="card dim-card" id="dim-mention">
    <div class="dim-head">
      <div>
        <span class="dim-code">M · AI 提及明細</span>
        <h3>AI 有沒有提到你？</h3>
        <p class="dim-hint">${mention.n ? `${esc(mention.n)} 題不帶店名的推薦題中，有 ${esc(mention.hits)} 題提到你。` : "這次沒有拿到可判讀的推薦題回答。"}</p>
      </div>
      ${flag(mention.flag)}
    </div>
    ${ranks.length ? `<div class="pos-bar-wrap" aria-label="單次回答列出位置示意">
      <div class="pos-grid">${Array.from({ length: 10 }, (_, idx) => {
        const slot = idx + 1;
        return `<span class="pos-slot${rankSet.has(slot) ? " hit" : ""}">${slot}</span>`;
      }).join("")}</div>
      <p class="pos-caption">單次回答列出位置：<strong>${esc(ranks.map((r) => `第 ${r} 項`).join("、"))}</strong>（僅代表當次列舉先後，非固定排名）</p>
    </div>` : ""}
    <div class="detail-subblock">
      ${discoveryEntries.length
        ? `<p class="sub-label">本次推薦測試題目與提及結果</p><ul class="mention-probe-list">${discoveryEntries.map(({ probe, probeIdx }, dIdx) => {
            const isAnswered = probe.answerStatus === "answered";
            let mentioned = false;
            let listedPos = null;
            let opts = [];
            if (isAnswered) {
              opts = Array.isArray(optionGroups[answeredIdx]) ? optionGroups[answeredIdx] : extractOptionList(probe.answer, brandTerms);
              const selfOpt = opts.find((opt) => opt.isSelf);
              const rankPos = Number.isFinite(ranks[answeredIdx]) ? ranks[answeredIdx] : null;
              listedPos = selfOpt?.rank || rankPos || null;
              const answerMatched = brandTerms.length
                ? highlightEscapedText(probe.answer, brandTerms).includes('class="brand-mark"')
                : false;
              mentioned = Boolean(selfOpt || listedPos || answerMatched);
              answeredIdx += 1;
            }
            const statusHtml = !isAnswered
              ? `<span class="f f-unknown">未取得有效回答</span>`
              : (mentioned ? `<span class="f f-yes">有提及</span>` : `<span class="f f-no">未提及</span>`);
            const posText = !isAnswered
              ? "未取得回答"
              : listedPos
                ? `列在第 ${esc(listedPos)} 項${opts.length ? `（共 ${esc(opts.length)} 項，屬單次回答順序而非固定排名）` : "（非固定排名）"}`
                : (mentioned ? "於內文中提及" : "回答未提及");
            return `<li class="mention-probe-row">
              <div class="mention-probe-head">
                <span class="mention-probe-title">推薦題 ${dIdx + 1}：${esc(probe.query || "")}</span>
                ${statusHtml}
              </div>
              <div class="mention-probe-meta">
                <span>${posText}</span>
                <a class="evidence-jump" href="#probe-${probeIdx + 1}">查看原始回答 ↓</a>
              </div>
            </li>`;
          }).join("")}</ul>`
        : `<p class="dim-hint" style="margin:0">本次未取得可列出的推薦題目與回答。</p>`}
    </div>
  </article>`;
}

function citationCardHtml(m) {
  const citation = m.citation || {};
  const allProbes = Array.isArray(m.probes) ? m.probes : [];
  const entries = Object.entries(citation.by_type || {}).filter(([, count]) => Number(count) > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + Number(count), 0);
  const officialCount = Number(citation.by_type?.official || 0);
  const officialUrls = Array.isArray(citation.official_urls) ? citation.official_urls : [];
  const isPlatformRoot = citation.reason === "platform_root_input";
  const showDistributionBar = total >= 2 && entries.length > 1;

  return `<article class="card dim-card" id="dim-citation">
    <div class="dim-head">
      <div>
        <span class="dim-code">C · 網站引用明細</span>
        <h3>AI 有沒有引用你的網站？</h3>
        <p class="dim-hint">${isPlatformRoot
          ? "受測網址屬共用平台網域，無法單獨判定為獨立官網引用。"
          : (citation.n ? "分別按「題目數」與「網址紀錄筆數」呈現本次引用來源。" : "這次沒有拿到可歸屬的引用來源。")}</p>
      </div>
      ${flag(citation.flag)}
    </div>
    <div class="citation-metrics-split">
      <div class="citation-metric-cell">
        <span class="citation-metric-label">出現官網引用的題目數（按題計算）</span>
        <strong class="citation-metric-val">${isPlatformRoot
          ? "不適用（共用平台）"
          : (citation.n ? `${esc(citation.official_probes)} / ${esc(citation.n)} 題` : "0 題")}</strong>
        <span class="citation-metric-sub">${isPlatformRoot
          ? "無法單獨歸屬為獨立官網"
          : `分母：有回答的 ${esc(citation.n || 0)} 道題目`}</span>
      </div>
      <div class="citation-metric-cell">
        <span class="citation-metric-label">AI 附上的來源網址紀錄（按筆數計算）</span>
        <strong class="citation-metric-val">共 ${esc(total)} 筆${officialCount > 0 ? `（含官網 ${esc(officialCount)} 筆）` : ""}</strong>
        <span class="citation-metric-sub">單題可能附多個網址，分母不同</span>
      </div>
    </div>
    ${officialUrls.length ? `<div class="detail-subblock">
      <p class="sub-label">被 AI 引用的官網頁面</p>
      <ul class="url-ref-list">${officialUrls.map((u) => {
        const matchedProbes = allProbes
          .map((p, idx) => (Array.isArray(p?.sources) && p.sources.some((s) => s.url === u) ? idx + 1 : null))
          .filter(Boolean);
        return `<li class="url-ref-item">
          ${isHttpUrl(u) ? `<a class="url-raw" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>` : `<span>${esc(u)}</span>`}
          ${matchedProbes.length ? `<span class="url-ref-links">${matchedProbes.map((n) => `<a class="evidence-jump" href="#probe-${n}">查看第 ${n} 題證據 ↓</a>`).join("")}</span>` : ""}
        </li>`;
      }).join("")}</ul>
    </div>` : (!isPlatformRoot ? `<div class="detail-subblock"><p class="dim-hint" style="margin:0">本次回答未附上你的官網網址作為引用來源。</p></div>` : "")}
    ${total ? `<div class="detail-subblock">
      <p class="sub-label">引用來源組成（共 ${esc(total)} 筆紀錄）</p>
      ${showDistributionBar ? `<div class="source-bar-track" aria-hidden="true">${entries.map(([type, count]) => `<span class="source-bar-fill" style="flex:${Number(count)};background:${SOURCE_COLORS[type] || "#64748B"}" title="${esc(SOURCE[type] || type)} ${esc(count)} 筆"></span>`).join("")}</div>` : ""}
      <ul class="legend-list" aria-label="引用來源類型分佈">
        ${entries.map(([type, count]) => `<li class="legend-item"><span class="legend-dot" style="background:${SOURCE_COLORS[type] || "#64748B"}" aria-hidden="true"></span><span>${esc(SOURCE[type] || type)}</span><strong>${esc(count)} 筆</strong></li>`).join("")}
      </ul>
    </div>` : `<p class="dim-hint" style="margin:0">這次回答中沒有可分類的外部來源網址。</p>`}
  </article>`;
}

function accuracyCardHtml(report, m) {
  const acc = m.accuracy || {};
  const allProbes = Array.isArray(m.probes) ? m.probes : [];
  const factProbeIdx = allProbes.findIndex((p) => p?.type === "fact");
  return `<article class="card dim-card" id="dim-accuracy">
    <div class="dim-head">
      <div>
        <span class="dim-code">A · 店家資訊比對</span>
        <h3>AI 提供的店家資訊正確嗎？</h3>
        <p class="dim-hint">對照受測頁面公開資料；差異處標示「待核對」，查證前不判定哪一方錯誤。</p>
      </div>
      ${flag(acc.flag)}
    </div>
    <table class="facts">
      <thead><tr><th scope="col">欄位</th><th scope="col">本站頁面</th><th scope="col">AI 回答</th><th scope="col" class="flag">比對狀態</th></tr></thead>
      <tbody>
        ${factRow("電話", report.truth?.phone, acc.claimed?.phone, acc.fields?.phone)}
        ${factRow("地址", report.truth?.address, acc.claimed?.address, acc.fields?.address)}
        ${factRow("營業時間", report.truth?.hours, null, "not_judged")}
      </tbody>
    </table>
    ${hasMismatch(m) ? `<div class="mismatch-banner">${esc(MISMATCH_ADVICE)}</div>` : ""}
    ${factProbeIdx >= 0 ? `<div class="dim-foot-link"><a class="evidence-jump" href="#probe-${factProbeIdx + 1}">查看事實查核原始回答 ↓</a></div>` : ""}
  </article>`;
}

function conversionCardHtml(report, m) {
  const conv = m.conversion || {};
  const allProbes = Array.isArray(m.probes) ? m.probes : [];
  const actionProbeIdx = allProbes.findIndex((p) => p?.type === "action");
  const found = new Set(Array.isArray(conv.entries) ? conv.entries : []);
  const actions = Array.isArray(conv.actions) ? conv.actions : [];
  const isPlatformRoot = m?.citation?.reason === "platform_root_input";
  const unknownAction = conv.flag === "unknown";

  const entryRows = [
    {
      name: "官網入口",
      ...(isPlatformRoot
        ? { state: "na", label: "不適用", note: "受測網址為共用平台網域，不單獨判定獨立官網入口" }
        : unknownAction
          ? { state: "untested", label: "未檢測", note: "本次未取得可判讀的行動題回答" }
          : conv.official_entry === true
            ? { state: "yes", label: "已提供", note: "AI 已提供可直接連回官網的入口" }
            : { state: "no", label: "未提供", note: "AI 回答未附上你的官網直連網址" })
    },
    {
      name: "電話",
      ...(unknownAction
        ? { state: "untested", label: "未檢測", note: "本次未取得可判讀的行動題回答" }
        : found.has("phone")
          ? { state: "yes", label: "已提供", note: "回答中有附上聯絡電話" }
          : { state: "no", label: "未提供", note: "行動題回答未附上聯絡電話" })
    },
    {
      name: "地圖",
      ...(unknownAction
        ? { state: "untested", label: "未檢測", note: "本次未取得可判讀的行動題回答" }
        : found.has("map")
          ? { state: "yes", label: "已提供", note: "回答中有附上地圖或導航連結" }
          : { state: "no", label: "未提供", note: "行動題回答未附地圖或導航連結" })
    }
  ];

  const OTHER_CHANNELS = ["booking", "order", "line", "address"];
  const extraChannels = [...found].filter((ch) => ch !== "website" && ch !== "phone" && ch !== "map" && !OTHER_CHANNELS.includes(ch));
  for (const ch of [...OTHER_CHANNELS, ...extraChannels]) {
    if (found.has(ch)) {
      entryRows.push({
        name: ENTRY[ch] || ch,
        state: "yes",
        label: "已提供",
        note: `回答中有提供${ENTRY[ch] || ch}入口`
      });
    }
  }
  const unfoundOthers = OTHER_CHANNELS.filter((ch) => !found.has(ch)).map((ch) => ENTRY[ch] || ch);
  if (unfoundOthers.length) {
    entryRows.push({
      name: `其他入口（${unfoundOthers.join("、")}）`,
      state: unknownAction ? "untested" : "no",
      label: unknownAction ? "未檢測" : "未提供",
      note: unknownAction ? "本次未取得可判讀的行動題回答" : "行動題回答未列出以上其他預約或即時聯絡方式"
    });
  }

  return `<article class="card dim-card" id="dim-conversion">
    <div class="dim-head">
      <div>
        <span class="dim-code">C · 顧客行動入口</span>
        <h3>顧客能找到你的聯絡方式嗎？</h3>
        <p class="dim-hint">${unknownAction
          ? "行動題未取得可判讀回答，以下皆標示為「未檢測」。"
          : (found.size
            ? `檢出 ${esc(found.size)} 類行動入口；明確區分已提供、未提供與不適用狀態。`
            : "AI 沒有給出明確的聯絡、地圖或預約方式。")}</p>
      </div>
      ${flag(conv.flag)}
    </div>
    <ul class="entry-check-list" aria-label="顧客聯絡與行動入口檢查結果">
      ${entryRows.map((row) => `<li class="entry-check-row${row.state === "yes" ? " entry-check-row--yes" : (row.state === "no" ? " entry-check-row--no" : "")}" title="${esc(row.note)}">
        <span class="entry-check-name">${esc(row.name)}</span>
        <span class="entry-badge entry-badge--${row.state}">${esc(row.label)}</span>
      </li>`).join("")}
    </ul>
    ${actions.length ? `<div class="detail-subblock">
      <p class="sub-label">AI 實際提供的行動入口明細</p>
      <ul class="conv-action-list">
        ${actions.slice(0, 6).map((act) => {
          const targetHtml = isHttpUrl(act.target)
            ? `<a href="${esc(act.target)}" target="_blank" rel="noopener noreferrer">${esc(act.target)}</a>`
            : `<span>${esc(act.target || "未附連結文字")}</span>`;
          const ownerLabel = act.owner || (act.official ? "品牌自有" : "第三方平台");
          return `<li class="conv-action-row">
            <div class="conv-action-main"><span class="conv-action-type">${esc(ENTRY[act.type] || act.type || "其他")}</span>${targetHtml}</div>
            <span class="conv-action-owner${act.official ? " official" : ""}">${esc(ownerLabel)}</span>
          </li>`;
        }).join("")}
      </ul>
    </div>` : ""}
    ${actionProbeIdx >= 0 ? `<div class="dim-foot-link"><a class="evidence-jump" href="#probe-${actionProbeIdx + 1}">查看行動題原始回答 ↓</a></div>` : ""}
  </article>`;
}

function resolveBrandTerms(report, m) {
  const raw = [
    report.entity?.name,
    ...(Array.isArray(report.entity?.terms) ? report.entity.terms : []),
    ...(Array.isArray(m.mention?.matched_terms) ? m.mention.matched_terms : [])
  ];
  return [...new Set(raw.map((t) => String(t || "").trim()).filter((t) => t.length >= 2))].sort((a, b) => b.length - a.length);
}

function resolveOptionsByProbe(m, brandTerms) {
  if (Array.isArray(m.mention?.options_by_probe) && m.mention.options_by_probe.length) {
    return m.mention.options_by_probe;
  }
  const discovery = (Array.isArray(m.probes) ? m.probes : []).filter((p) => p.type === "discovery" && p.answerStatus === "answered");
  return discovery.map((p) => extractOptionList(p.answer, brandTerms));
}

function buildSiteChecklist(checksData, limited) {
  const checks = Array.isArray(checksData?.checks) ? checksData.checks : [];
  const issues = Array.isArray(checksData?.issues) ? checksData.issues : [];
  const issueById = new Map();
  const extraIssues = [];
  for (const item of issues) {
    const mappedId = ISSUE_TO_CHECK_ID[item.check];
    if (mappedId && !issueById.has(mappedId)) issueById.set(mappedId, item);
    else extraIssues.push(item);
  }

  if (checks.length) {
    const rows = checks.map((check) => {
      const meta = CHECK_META[check.id] || { label: check.id, group: "網站條件", role: "developer" };
      const override = issueById.get(check.id);
      const status = override ? "fail" : check.status;
      const detail = override ? (override.detail_zh || override.detail || check.evidence) : (check.evidence || check.reason_zh || "");
      const impact = override?.impact_zh || (status !== "pass" ? check.reason_zh : "");
      return { id: check.id, label: meta.label, group: meta.group, role: meta.role, detail, impact, status };
    });
    for (const item of extraIssues) {
      rows.push({
        label: item.check || "網站讀取設定",
        group: "網站條件",
        role: "developer",
        detail: item.detail_zh || item.detail || "",
        impact: item.impact_zh || "",
        status: "fail"
      });
    }
    return rows;
  }

  const rows = issues.map((item) => ({
    label: item.check || "網站讀取設定",
    group: "網站條件",
    role: "developer",
    detail: item.detail_zh || item.detail || "",
    impact: item.impact_zh || "",
    status: "fail"
  }));
  for (const text of checksData?.citeability?.strengths_zh || []) {
    rows.push({ label: "內容可引用性", group: "可引用性", role: "owner", detail: text, impact: "", status: "pass" });
  }
  for (const text of checksData?.citeability?.gaps_zh || []) {
    rows.push({ label: "可以補強的內容", group: "可引用性", role: "owner", detail: text, impact: "", status: "partial" });
  }
  if (!rows.length && !limited) {
    rows.push({ label: "網站讀取權限與結構", group: "基本條件", role: "developer", detail: "沒有發現阻擋讀取的網站設定。", impact: "", status: "pass" });
  }
  return rows;
}

function renderCheckTableRows(rows) {
  return rows.map((row) => {
    const passed = row.status === "pass";
    const badgeText = passed ? "✓ 通過" : (row.status === "unknown" ? "— 未知" : row.status === "partial" ? "— 待補強" : "— 未通過");
    return `<tr>
      <th scope="row"><span class="chk-group">${esc(row.group)}</span><span class="chk-name">${esc(row.label)}</span></th>
      <td>${esc(row.detail)}${row.impact && !passed ? `<span class="chk-impact">${esc(row.impact)}</span>` : ""}</td>
      <td class="chk-status"><span class="chk-pill ${passed ? "pass" : "grey"}">${badgeText}</span></td>
    </tr>`;
  }).join("\n");
}

function checklistTableHtml(rows) {
  if (!rows.length) {
    return `<div class="card"><p style="margin:0;color:var(--ls-ink-muted)">這次讀不到網站，未取得網站條件檢核結果。</p></div>`;
  }
  const roleGroups = [
    {
      key: "owner",
      title: "店家與行銷人員可自行補齊（網站文案與基本資訊）",
      desc: "通常可直接透過網站後台修改標題、文字介紹、圖片說明與常見問答",
      items: rows.filter((r) => r.role === "owner")
    },
    {
      key: "developer",
      title: "請網站工程師或架站平台協助（技術設定與結構資料）",
      desc: "涉及主機連線、robots.txt、網站地圖、渲染方式與結構化標記",
      items: rows.filter((r) => r.role !== "owner")
    }
  ].filter((g) => g.items.length > 0);

  return roleGroups.map((group) => {
    const pending = group.items.filter((r) => r.status !== "pass");
    const passed = group.items.filter((r) => r.status === "pass");
    return `<div class="card checks-role-card">
      <div class="checks-role-head">
        <div>
          <h3>${esc(group.title)}</h3>
          <p>${esc(group.desc)}</p>
        </div>
        <span class="checks-role-count">已通過 ${esc(passed.length)} / ${esc(group.items.length)} 項</span>
      </div>
      ${pending.length
        ? `<table class="checks-table">
            <thead><tr><th scope="col" style="width:32%">檢查項目</th><th scope="col">檢查結果說明</th><th scope="col" class="chk-status">狀態</th></tr></thead>
            <tbody>${renderCheckTableRows(pending)}</tbody>
          </table>`
        : `<p class="checks-all-pass">本類共 ${esc(passed.length)} 項檢查已全數通過。</p>`}
      ${passed.length
        ? `<details class="checks-pass-group">
            <summary>查看已通過項目（${esc(passed.length)} 項 ✓ 通過）</summary>
            <table class="checks-table">
              <thead><tr><th scope="col" style="width:32%">檢查項目</th><th scope="col">檢查結果說明</th><th scope="col" class="chk-status">狀態</th></tr></thead>
              <tbody>${renderCheckTableRows(passed)}</tbody>
            </table>
          </details>`
        : ""}
    </div>`;
  }).join("\n");
}

function summaryRows(report) {
  const m = report.mcac || {};
  const mention = m.mention || {};
  const citation = m.citation || {};
  const accuracy = m.accuracy || {};
  const conversion = m.conversion || {};
  const ranks = (mention.ranks || []).filter((rank) => Number.isFinite(rank));
  const byType = Object.entries(citation.by_type || {}).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${SOURCE[type] || type} ${count}`).join("・");
  return [
    {
      label: "提及（Mention）",
      hint: "顧客沒說店名時，AI 有沒有主動講到你",
      flag: mention.flag,
      resultHtml: mention.n ? `${esc(mention.hits)} / ${esc(mention.n)} 題推薦題提到你${ranks.length ? `<br><small>回答列出位置：${esc(ranks.map((rank) => `第 ${rank} 項`).join("、"))}（單次列出順序）</small>` : ""}` : "沒有可判讀的推薦題回答"
    },
    {
      label: "引用來源（Citation）",
      hint: "回答列出的來源裡，有沒有你的官網",
      flag: citation.flag,
      resultHtml: citation.n ? `官網出現在 ${esc(citation.official_probes)} / ${esc(citation.n)} 題${byType ? `<br><small>${esc(byType)}</small>` : ""}` : "沒有可判讀的回答"
    },
    {
      label: "資訊正確性（Accuracy）",
      hint: "AI 給的地址、電話跟你的頁面一不一致",
      flag: accuracy.flag,
      resultHtml: `電話：${esc(FIELD[accuracy.fields?.phone] || "未知")}・地址：${esc(FIELD[accuracy.fields?.address] || "未知")}`
    },
    {
      label: "行動資訊（Conversion-readiness）",
      hint: "AI 有沒有給出電話、網址、地圖或訂位等下一步",
      flag: conversion.flag,
      resultHtml: conversion.entries?.length
        ? `${esc(conversion.entries.map((entry) => ENTRY[entry] || entry).join("、"))}<br><small>官網入口：${conversion.official_entry ? "有" : "沒有"}</small>`
        : (conversion.flag === "unknown" ? "沒有可判讀的行動題回答" : "沒有可執行的下一步")
    }
  ];
}

function factRow(label, truth, claimed, status) {
  const claimedText = Array.isArray(claimed) && claimed.length
    ? claimed.join("、")
    : (status === "not_judged" ? "未納入本次題目" : "AI 未提供");
  const listed = Array.isArray(truth?.values) && truth.values.length ? truth.values : (truth?.value ? [truth.value] : []);
  const truthText = listed.length ? `${listed.join("、")}（${TRUTH_SOURCE[truth.source] || "頁面"}${listed.length > 1 ? `等，共 ${listed.length} 組` : ""}）` : "頁面沒有寫";

  if (status === "mismatch") {
    return `<tr class="fact-row fact-row--mismatch"><th scope="row">${esc(label)}</th><td data-label="你的頁面">${esc(truthText)}</td><td data-label="AI 回答">${esc(claimedText)}</td><td class="flag"><span class="f f-part">資訊不一致／待核對</span><span class="fact-sub-status">和你的頁面不一致</span></td></tr>`;
  }

  const plainStatus = status === "not_judged"
    ? "未檢測（v0）"
    : status === "unverifiable"
      ? "無法核對（頁面未寫）"
      : status === "not_provided"
        ? "AI 未提供"
        : status === "correct"
          ? "一致（正確）"
          : (FIELD[status] || "未知");
  return `<tr class="fact-row"><th scope="row">${esc(label)}</th><td data-label="你的頁面">${esc(truthText)}</td><td data-label="AI 回答">${esc(claimedText)}</td><td class="flag"><span class="fact-status-plain">${esc(plainStatus)}</span></td></tr>`;
}

function probeConclusionBadge(probe, brandTerms, m) {
  if (probe.answerStatus !== "answered") {
    return `<span class="f f-unknown">未取得回答</span>`;
  }
  if (probe.type === "discovery") {
    const opts = extractOptionList(probe.answer, brandTerms);
    const matched = opts.some((o) => o.isSelf) || (brandTerms.length ? highlightEscapedText(probe.answer, brandTerms).includes('class="brand-mark"') : false);
    return matched ? `<span class="f f-yes">有提及</span>` : `<span class="f f-no">未提及</span>`;
  }
  if (probe.type === "fact") {
    const accFlag = m?.accuracy?.flag;
    if (accFlag === "mismatch") return `<span class="f f-part">資訊不一致／待核對</span>`;
    if (accFlag === "correct") return `<span class="f f-yes">資訊一致</span>`;
    return flag(accFlag);
  }
  if (probe.type === "action") {
    const convFlag = m?.conversion?.flag;
    if (convFlag === "yes") return `<span class="f f-yes">有行動入口</span>`;
    if (convFlag === "no") return `<span class="f f-no">無行動入口</span>`;
    return `<span class="f f-unknown">未判讀</span>`;
  }
  return "";
}

function buildProbeEvidenceHtml(probe, brandTerms, m, report) {
  let bodyHtml = "";
  if (probe.answerStatus !== "answered") {
    bodyHtml = `本次查詢未能取得有效回答（狀態：${probe.answerStatus === "failed" ? "查詢失敗" : "無法判讀"}），標示為未知。`;
  } else if (probe.type === "discovery") {
    const cleanTerms = (Array.isArray(brandTerms) ? brandTerms : []).map((t) => String(t || "").trim()).filter((t) => t.length >= 2);
    const pattern = cleanTerms.length ? new RegExp(`(${cleanTerms.map(escapeRegExp).join("|")})`, "i") : null;
    const lines = String(probe.answer || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const matchedLines = pattern ? lines.filter((line) => pattern.test(line)) : [];
    const listedPos = extractOptionList(probe.answer, brandTerms).find((opt) => opt.isSelf)?.rank || null;
    if (matchedLines.length) {
      const excerpt = matchedLines.slice(0, 2).join(" ／ ");
      bodyHtml = `${listedPos ? `列於回答第 ${esc(listedPos)} 項（單次列出順序）：` : "回答原文提及片段："}「${highlightEscapedText(excerpt, brandTerms)}」`;
    } else if (listedPos) {
      bodyHtml = `品牌列於回答第 ${esc(listedPos)} 項（單次列出順序）。`;
    } else {
      bodyHtml = "檢索本題完整回答，未出現受檢品牌名稱。";
    }
  } else if (probe.type === "fact") {
    const acc = m?.accuracy || {};
    const aiPhone = formatFactValueList(acc.claimed?.phone, "AI 未提供");
    const aiAddress = formatFactValueList(acc.claimed?.address, "AI 未提供");
    const diffFields = [];
    if (acc.fields?.phone === "mismatch") diffFields.push("電話");
    if (acc.fields?.address === "mismatch") diffFields.push("地址");
    const note = diffFields.length
      ? `（${diffFields.join("與")}與本站頁面不一致，需人工核對）`
      : (acc.flag === "correct" ? "（與本站頁面文字基準一致）" : "");
    bodyHtml = `AI 回答電話：${esc(aiPhone)} ｜ AI 回答地址：${esc(aiAddress)}${esc(note)}`;
  } else if (probe.type === "action") {
    const actions = Array.isArray(m?.conversion?.actions) ? m.conversion.actions : [];
    if (actions.length) {
      bodyHtml = `本題檢出 ${esc(actions.length)} 筆行動入口：${actions.slice(0, 4).map((a) => `${esc(ENTRY[a.type] || a.type || "其他")}（${esc(a.target || "已說明")}）`).join("、")}`;
    } else {
      bodyHtml = "本題回答中未檢出可點擊官網、電話、地圖或訂位等明確下一步入口。";
    }
  } else {
    bodyHtml = `已保存本題原始回答供人工檢視${report?.entity?.name ? `（${esc(report.entity.name)}）` : ""}。`;
  }
  return `<div class="probe-evidence-box"><span class="probe-evidence-label">支持結論的關鍵證據</span>${bodyHtml}</div>`;
}

function probeBlock(probe, index, brandTerms, m, report) {
  const sources = Array.isArray(probe.sources) ? probe.sources : [];
  const status = probe.answerStatus === "answered" ? "" : `（${probe.answerStatus === "failed" ? "這題沒有拿到回答，標為未知" : "這題回答無法判讀，標為未知"}）`;
  const hasOfficial = sources.some((s) => s.type === "official");
  const conclusionHtml = probeConclusionBadge(probe, brandTerms, m);
  const srcTagHtml = hasOfficial
    ? `<span class="probe-src-tag is-official">含官網來源（${esc(sources.length)} 筆）</span>`
    : `<span class="probe-src-tag">${esc(sources.length)} 筆來源</span>`;

  const accClaimed = probe.type === "fact"
    ? [...(Array.isArray(m?.accuracy?.claimed?.phone) ? m.accuracy.claimed.phone : []), ...(Array.isArray(m?.accuracy?.claimed?.address) ? m.accuracy.claimed.address : [])]
    : [];
  const answerHighlightTerms = [...(Array.isArray(brandTerms) ? brandTerms : []), ...accClaimed.filter((v) => String(v || "").trim().length >= 4)];

  return `<details class="probe-card" id="probe-${index + 1}"${index === 0 ? " open" : ""}>
<summary>
  <span class="probe-q"><span class="probe-num">第 ${index + 1} 題</span><span class="probe-type probe-type--${esc(probe.type || "discovery")}">${esc(PROBE[probe.type] || probe.type)}</span><span>${esc(probe.query || "")}${esc(status)}</span></span>
  <span class="probe-badges">${conclusionHtml}${srcTagHtml}</span>
</summary>
<div class="probe-body">
  ${buildProbeEvidenceHtml(probe, brandTerms, m, report)}
  <p class="probe-sub-head">AI 原始回答</p>
  ${probe.answer ? `<p class="answer">${highlightEscapedText(probe.answer, answerHighlightTerms)}</p>` : `<p class="dim-hint">本題沒有文字回答。</p>`}
  <div class="src-block">
    <p class="probe-sub-head">實際引用來源（${esc(sources.length)} 筆）</p>
    ${sources.length ? `<ul class="src">${sources.map((source) => {
      const label = SOURCE[source.type] || source.type;
      const link = isHttpUrl(source.url)
        ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.url)}</a>`
        : esc(source.url);
      return `<li>${esc(label)}｜${link}</li>`;
    }).join("")}</ul>` : `<p class="dim-hint" style="margin:0">本題 AI 未提供外部參考來源網址。</p>`}
  </div>
</div>
</details>`;
}

function highlightEscapedText(rawText, terms) {
  const source = String(rawText ?? "");
  const cleanTerms = [...new Set((Array.isArray(terms) ? terms : []).map((t) => String(t || "").trim()).filter((t) => t.length >= 2))]
    .sort((a, b) => b.length - a.length);
  if (!cleanTerms.length) return esc(source);
  const pattern = new RegExp(`(${cleanTerms.map(escapeRegExp).join("|")})`, "gi");
  return source.split(pattern).map((part, idx) => (idx % 2 === 1 ? `<mark class="brand-mark">${esc(part)}</mark>` : esc(part))).join("");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatFactValueList(values, emptyLabel) {
  return Array.isArray(values) && values.length ? values.join("、") : emptyLabel;
}

function mcacReportMarkdown(report) {
  const m = report.mcac || {};
  const score = resolveScore(m);
  const scoreLine = Number.isFinite(score.value)
    ? `${score.value} / 100（${score.label}）`
    : score.status === "partial"
      ? `不給分（${score.label}，四項都量到才給分；未知不等於 0）`
      : "尚無可判讀資料（未知不等於 0）";
  const checks = report.siteChecks || {};
  const checklist = buildSiteChecklist(checks, report.limited);
  const priorities = buildPriorityItems(report, m, checks);
  const conclusion = buildNaturalConclusion(report, m);
  const acc = m.accuracy || {};

  const truthPhone = formatFactValueList(report.truth?.phone?.values || (report.truth?.phone?.value ? [report.truth.phone.value] : []), "頁面沒有寫");
  const truthAddress = formatFactValueList(report.truth?.address?.values || (report.truth?.address?.value ? [report.truth.address.value] : []), "頁面沒有寫");
  const aiPhone = formatFactValueList(acc.claimed?.phone, "沒有提供");
  const aiAddress = formatFactValueList(acc.claimed?.address, "沒有提供");

  const lines = [
    `# AI 能見度檢測單（MCAC）`,
    ``,
    ...(isDemoReport(report) ? [`> **示範資料**：本份報告為系統示範範例，非實際即時檢測結果。`, ``] : []),
    ...(report.entity?.name ? [`- 受檢店家／品牌：${report.entity.name}`] : []),
    `- 受檢網站：${safeHost(report.finalUrl || report.url)}`,
    ...(entryNote(report) ? [`- ${entryNote(report)}`] : []),
    `- AI 可見度：${scoreLine}`,
    `- 方法與範圍：MCAC v${m.method_version || "0.2.0"}・${probeScopeText(m.probes)}`,
    `- 檢測時間：${taipeiTime(report.createdAt)}`,
    ``,
    `## 一句話檢測結論`,
    ``,
    conclusion,
    ``,
    `| 項目 | 結果 | 判讀 |`,
    `|---|---|---|`,
    ...summaryRows(report).map((row) => `| ${row.label} | ${row.resultHtml.replace(/<br>/g, "；").replace(/<[^>]+>/g, "")} | ${(FLAG[row.flag] || FLAG.unknown)[0]} |`),
    ``,
    ...(priorities.length ? [
      `## 建議優先處理事項`,
      ``,
      ...priorities.flatMap((item) => [`- **${item.title}**（${item.basis}）：${item.summary}`]),
      ``
    ] : []),
    `## 資訊正確性對照`,
    ``,
    `| 欄位 | 你的頁面 | AI 回答 | 判定 |`,
    `|---|---|---|---|`,
    `| 電話 | ${truthPhone} | ${aiPhone} | ${FIELD[acc.fields?.phone] || "未知"} |`,
    `| 地址 | ${truthAddress} | ${aiAddress} | ${FIELD[acc.fields?.address] || "未知"} |`,
    ``,
    `## 每一題的原始回答`,
    ...(m.probes || []).flatMap((probe) => [``, `### ${PROBE[probe.type] || probe.type}：${probe.query || ""}`, ``, probe.answer || "（沒有回答）", ``, ...(probe.sources || []).map((source) => `- ${SOURCE[source.type] || source.type}：${source.url}`)]),
    ``,
    ...(checklist.length ? [`## 網站基礎檢查（不計分）`, ``, ...checklist.map((item) => `- [${item.status === "pass" ? "✓" : " "}] ${item.label}：${item.detail}`), ``] : []),
    ...(hasMismatch(m) ? [`> ${MISMATCH_ADVICE}`, ``] : []),
    `判讀限制：每項只有 1 到 2 題；被提到不等於被推薦；來源出現次數不是 AI 的信任權重；規則為 v0 暫定。`
  ];
  return lines.join("\n");
}

function hasMismatch(m) {
  return m?.accuracy?.fields?.phone === "mismatch" || m?.accuracy?.fields?.address === "mismatch";
}

function flag(value) {
  const [label, tone] = FLAG[value] || FLAG.unknown;
  return `<span class="f f-${tone}">${label}</span>`;
}

// The pipeline version ends in the engine id. The site does not say which engine ran the
// check (2026-10-21), so the footer shows the version without it.
function pipelineLabel(report) {
  const version = String(report.pipelineVersion || "");
  const engine = report.engine?.id || report.provider;
  const trimmed = engine && version.endsWith(`-${engine}`) ? version.slice(0, -engine.length - 1) : version;
  return trimmed.replace(/-(perplexity|gemini|sonar|deepseek)$/i, "");
}

function taipeiTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
}

// When the Worker measured a different entry from what the user typed (apex https dead, www
// live), the report says which URL was read and which was typed.
function entryNote(report) {
  const requested = String(report.requestedUrl || "");
  const measured = String(report.finalUrl || report.url || "");
  if (!requested || !measured || requested === measured) return "";
  return `實際入口 ${measured}（輸入 ${requested}）`;
}

function safeHost(value) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return String(value || ""); }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

module.exports = { mcacReportHtml, mcacReportMarkdown };
