// 品牌名稱正規化與比對的唯一實作。
// 規則變更必須同步調整 PARSER_VERSION，讓研究資料列可辨識是哪一版解析器產生。
const PARSER_VERSION = "2.1.0";

// 只收「純簡化字」（該字形在正體中文不作為常用字使用），避免 面/几/余 這類雙義字誤轉。
const S2T_PAIRS =
  "寿壽 门門 饭飯 饮飲 楼樓 兰蘭 龙龍 凤鳳 鸡雞 鸭鴨 鹅鵝 鱼魚 虾蝦 汤湯 点點 饺餃 烧燒 锅鍋 铁鐵 与與 万萬 亿億 号號 张張 刘劉 陈陳 杨楊 黄黃 吴吳 赵趙 孙孫 马馬 冯馮 郑鄭 谢謝 韩韓 苏蘇 罗羅 许許 邓鄧 吕呂 卢盧 蒋蔣 贾賈 叶葉 谭譚 邹鄒 陆陸 顾顧 钱錢 乔喬 贺賀 赖賴 龚龔 卤滷 炖燉 焖燜 烩燴 饼餅 团團 圆圓 园園 广廣 场場 厅廳 馆館 铺鋪 记記 兴興 发發 财財 宝寶 华華 丰豐 荣榮 强強 义義 乐樂 东東 风風 云雲 电電 车車 头頭 鸟鳥 岛島 湾灣 滨濱 桥橋 阳陽 阴陰 红紅 绿綠 蓝藍 银銀 铜銅 优優 质質 亚亞 欧歐 语語 汉漢 国國 际際 边邊 达達 迈邁 联聯 众眾 创創 艺藝 术術 学學 医醫 药藥 养養 汇匯 丽麗 圣聖 诚誠 贵貴 买買 卖賣 购購 货貨 价價 满滿 时時 间間 关關 开開 长長 儿兒 网網 络絡 线線 视視 听聽 说說 读讀 书書 图圖";
const S2T = new Map([...S2T_PAIRS.matchAll(/(\S)(\S)/g)].map((match) => [match[1], match[2]]));

const CJK_KANA_RANGE = "\\u3041-\\u30ff\\u31f0-\\u31ff\\u3400-\\u9fff";
const COMPACT_STRIP = new RegExp(`[^a-z0-9${CJK_KANA_RANGE}]+`, "g");
const NON_ALNUM = /[^a-z0-9]+/g;
const CJK_TEST = new RegExp(`[${CJK_KANA_RANGE}]`);
const SENTENCE_SPLIT = /[。！？!?；;：:\n\r•·]+/;

// 比對層通用詞：出現在 title/h1 但不足以辨識品牌的詞。城市與行政區名一律視為通用詞。
const GENERIC_WORDS = [
  "首頁", "官方網站", "官網", "關於我們", "服務", "公司", "網站", "品牌", "商家", "店家",
  "餐廳", "餐館", "美食", "料理", "菜單", "訂位", "訂房", "預約", "外送", "外帶",
  "分店", "門市", "地址", "電話", "聯絡", "推薦", "介紹", "資訊", "平台", "專賣店",
  "旗艦店", "台灣", "臺灣", "股份有限公司", "有限公司", "企業社", "商行", "工作室", "集團",
  "台北", "臺北", "新北", "桃園", "新竹", "苗栗", "台中", "臺中", "彰化", "南投", "雲林",
  "嘉義", "台南", "臺南", "高雄", "屏東", "宜蘭", "花蓮", "台東", "臺東", "澎湖", "金門",
  "連江", "信義區",
  "home", "official", "website", "taiwan", "taipei", "menu", "restaurant", "food", "shop",
  "store", "online", "booking", "reservation", "contact", "about", "co", "ltd", "inc",
  "com", "www", "blog", "news", "index"
];

// 多層級公用後綴：registrable domain 需要取三段而非兩段的情況。
const MULTI_LABEL_SUFFIXES = new Set([
  "com.tw", "org.tw", "net.tw", "gov.tw", "edu.tw", "idv.tw", "game.tw", "club.tw", "ebiz.tw",
  "co.jp", "ne.jp", "or.jp", "go.jp", "ac.jp",
  "com.hk", "org.hk", "edu.hk", "com.cn", "org.cn", "net.cn", "com.sg", "com.my",
  "co.uk", "org.uk", "ac.uk", "com.au", "org.au", "co.kr", "or.kr", "com.mo"
]);

// 商家不可能擁有根網域的共用平台：這類 host 不能用 registrable domain 判定第一方。
const SHARED_PLATFORM_DOMAINS = new Set([
  "facebook.com", "instagram.com", "youtube.com", "linktr.ee", "pixnet.net", "blogspot.com",
  "wordpress.com", "wixsite.com", "weebly.com", "medium.com", "tumblr.com", "github.io",
  "notion.site", "google.com", "business.site", "shoplineapp.com", "easystore.co",
  "cyberbiz.co", "91app.com", "waca.ec", "mystrikingly.com", "webnode.tw",
  "inline.app", "eztable.com", "opentable.com", "tripadvisor.com", "tripadvisor.com.tw",
  "ubereats.com", "foodpanda.com.tw", "line.me", "lin.ee", "threads.net", "x.com",
  "twitter.com", "tiktok.com"
]);

const SOURCE_TYPE_RULES = [
  ["maps", /^(?:maps\.google\.[a-z.]+|maps\.app\.goo\.gl|maps\.apple\.com|waze\.com)$/],
  ["social", /^(?:facebook\.com|instagram\.com|youtube\.com|youtu\.be|line\.me|lin\.ee|threads\.net|x\.com|twitter\.com|tiktok\.com|linkedin\.com)$/],
  ["booking", /^(?:inline\.app|eztable\.com|opentable\.com|tablecheck\.com|klook\.com|kkday\.com|funnow\.com\.tw|accupass\.com)$/],
  ["ugc", /^(?:pixnet\.net|dcard\.tw|mobile01\.com|ptt\.cc|medium\.com|vocus\.cc|tripadvisor\.com(?:\.tw)?|ifoodie\.tw|walkerland\.com\.tw)$/],
  ["wiki", /^(?:wikipedia\.org|wikimedia\.org)$/],
  ["gov_edu", /(?:\.gov\.tw|\.edu\.tw|\.gov|\.edu)$/]
];

const BRANCH_NUMBER_PATTERN = /^\d+(?:店|館|樓|層|號|号)$/;
const REFUSAL_PATTERN = /^(?:很抱歉|抱歉|無法(?:提供|找到|確認)|沒有(?:找到|足夠)|找不到|目前沒有|未能找到|查無|unknown\b|i\s+(?:could|can)\s*not|no\s+(?:reliable|relevant|sufficient)\s+(?:information|sources|results))/i;

function convertSimplified(value) {
  let out = "";
  for (const char of String(value || "")) out += S2T.get(char) || char;
  return out;
}

// 緊湊形：比對中日文詞用。移除所有非字元符號，僅在「單一句子內」使用，避免跨句串接誤判。
function compactForm(value) {
  return convertSimplified(String(value || "").normalize("NFKC").toLowerCase()).replace(COMPACT_STRIP, "");
}

// 空格形：比對拉丁詞用。非英數一律轉單一空格，讓詞界判斷可行。
function spacedForm(value) {
  return convertSimplified(String(value || "").normalize("NFKC").toLowerCase()).replace(NON_ALNUM, " ").trim();
}

function splitSentences(text) {
  return String(text || "").split(SENTENCE_SPLIT).filter((part) => part.trim().length > 0);
}

function prepareText(text) {
  return splitSentences(text).map((sentence) => ({
    raw: sentence,
    compact: compactForm(sentence),
    spaced: spacedForm(sentence)
  }));
}

function makeTerm(rawValue, source) {
  const compact = compactForm(rawValue);
  if (!compact) return null;
  const kind = CJK_TEST.test(compact) ? "cjk" : "latin";
  return { value: compact, kind, compact, spaced: spacedForm(rawValue), source: source || "derived" };
}

const GENERIC_SET = new Set(GENERIC_WORDS.map(compactForm).filter(Boolean));

function isGenericTerm(term) {
  if (GENERIC_SET.has(term.compact)) return true;
  if (term.kind === "cjk" && term.compact.length <= 6) {
    for (let split = 1; split < term.compact.length; split += 1) {
      if (GENERIC_SET.has(term.compact.slice(0, split)) && GENERIC_SET.has(term.compact.slice(split))) return true;
    }
  }
  return false;
}

function isUsefulTerm(term) {
  if (!term) return false;
  const minLength = term.kind === "cjk" ? 2 : 3;
  if (term.compact.length < minLength || term.compact.length > 40) return false;
  if (/^\d+$/.test(term.compact)) return false;
  if (BRANCH_NUMBER_PATTERN.test(term.compact)) return false;
  return !isGenericTerm(term);
}

// 中英文邊界切詞：「饗饗INPARADISE」→「饗饗」「inparadise」，避免只有整串長詞可比。
// 拉丁段落保留空格與連字號，Top-Cap Steakhouse 維持一個候選詞。
function splitScriptRuns(value) {
  return String(value || "").match(new RegExp(`[${CJK_KANA_RANGE}]+|[a-zA-Z0-9][a-zA-Z0-9 .&'\\-]*`, "g")) || [];
}

// title/h1 分段：保留半形連字號在詞內（Top-Cap 不再被切開），只用明確分隔符。
const SEGMENT_SPLIT = /[|｜—–:：、,，/／()（）\[\]「」『』【】]+/;

const TAIWAN_AFFIXES = ["台灣", "臺灣", "taiwan"];

function buildBrandTermSet({ host = "", metadata = {}, aliases = [], masterTerms = [] } = {}) {
  const terms = new Map();
  const add = (term) => {
    if (term && isUsefulTerm(term) && !terms.has(term.compact)) terms.set(term.compact, term);
  };
  // 每個候選詞（含別名與真值表詞）一律加上去「台灣」前後綴變體：
  // 答案常寫「壽司郎」而非官方全名「台灣壽司郎」。
  const push = (rawValue, source) => {
    const term = makeTerm(rawValue, source);
    if (!term) return;
    add(term);
    for (const affix of TAIWAN_AFFIXES) {
      if (term.compact.startsWith(affix)) add(makeTerm(term.compact.slice(affix.length), source));
      if (term.compact.endsWith(affix)) add(makeTerm(term.compact.slice(0, -affix.length), source));
    }
  };

  for (const value of masterTerms) push(value, "master");
  if (!masterTerms.length) {
    push(String(host).split(".")[0], "host");
    for (const [field, source] of [[metadata.title, "title"], [metadata.h1, "h1"]]) {
      for (const segment of String(field || "").split(SEGMENT_SPLIT)) {
        push(segment, source);
        for (const run of splitScriptRuns(segment)) push(run, source);
      }
    }
  }
  for (const value of aliases) push(value, "alias");

  return [...terms.values()].sort((a, b) => b.compact.length - a.compact.length).slice(0, 16);
}

function termMatchesSentence(term, sentence) {
  if (term.kind === "latin") return latinTermInSentence(term, sentence);
  return sentence.compact.includes(term.compact);
}

// 拉丁詞比對：忽略空格差異（LouisaCoffee vs Louisa Coffee），但必須對齊句中詞界，
// 避免 "art" 誤中 "start" 這類子字串 FP。
function latinTermInSentence(term, sentence) {
  const words = sentence.spaced.split(" ").filter(Boolean);
  if (!words.length) return false;
  const joined = words.join("");
  const starts = new Set();
  const ends = new Set();
  let position = 0;
  for (const word of words) {
    starts.add(position);
    position += word.length;
    ends.add(position);
  }
  let index = joined.indexOf(term.compact);
  while (index !== -1) {
    if (starts.has(index) && ends.has(index + term.compact.length)) return true;
    index = joined.indexOf(term.compact, index + 1);
  }
  return false;
}

function matchTermsInText(text, terms) {
  const sentences = prepareText(text);
  return terms.filter((term) => sentences.some((sentence) => termMatchesSentence(term, sentence)));
}

function textMatchesAnyTerm(text, terms) {
  return matchTermsInText(text, terms).length > 0;
}

function classifyAnswerStatus(answer) {
  const trimmed = String(answer || "").trim();
  if (!trimmed || compactForm(trimmed).length < 4) return "empty";
  if (REFUSAL_PATTERN.test(trimmed) && trimmed.length < 200) return "refusal";
  return "answered";
}

// 排名抽取：編號/條列清單優先；沒有清單時退回 markdown 表格資料列（去表頭與分隔列）。
// 只編前 10 項；未提及回 null，不得回 0。
function extractMentionRank(answer, terms) {
  const lines = String(answer || "").split(/\r?\n/);
  let listItems = lines.filter((line) => /^\s*(?:[-*•]|\d{1,2}\s*[.)、]|[①②③④⑤⑥⑦⑧⑨⑩]|[一二三四五六七八九十]\s*[、.])/.test(line));
  if (!listItems.length) {
    const tableRows = lines.filter((line) => /^\s*\|.*\|\s*$/.test(line) && !/^[\s|:\-]+$/.test(line));
    if (tableRows.length >= 2) listItems = tableRows.slice(1);
  }
  if (!listItems.length) return { rank: null, status: "no_list" };
  for (let index = 0; index < Math.min(listItems.length, 10); index += 1) {
    if (textMatchesAnyTerm(listItems[index], terms)) return { rank: index + 1, status: "parsed" };
  }
  return { rank: null, status: "not_mentioned" };
}

function extractAuthorityAliases(answer) {
  // 容忍 markdown 前後綴（**ALIASES**: / - Aliases:）；別名清單本身仍逐項正規化。
  const line = String(answer || "").match(/(?:^|\n)[^a-z0-9\n]*ALIASES?[^a-z0-9\n:：]*[:：]\s*([^\n]+)/i)?.[1] || "";
  if (!line || /^\W*unknown\b/i.test(line.trim())) return [];
  return [...new Set(
    line.split(/\s*[|,，、;；]\s*/)
      .map((part) => part.replace(/[*_`]+/g, "").trim())
      .map(compactForm)
      .filter((term) => term.length >= 2 && term.length <= 40)
  )].slice(0, 8);
}

function safeHostname(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function getRegistrableDomain(host) {
  const labels = String(host || "").toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return labels.slice(MULTI_LABEL_SUFFIXES.has(lastTwo) ? -3 : -2).join(".");
}

function isSharedPlatformHost(host) {
  return SHARED_PLATFORM_DOMAINS.has(getRegistrableDomain(host));
}

// 受測站本身就是平台根網域（輸入清單放了 FB/IG/訂位頁被截根）時，測到的對象是平台不是店家。
function isPlatformRootInput(host) {
  const normalized = String(host || "").toLowerCase().replace(/^www\./, "");
  return isSharedPlatformHost(normalized) && normalized === getRegistrableDomain(normalized);
}

function isFirstParty(url, siteHost, officialDomains = []) {
  const citationHost = safeHostname(url);
  const host = String(siteHost || "").toLowerCase().replace(/^www\./, "");
  if (!citationHost || !host) return false;
  for (const official of officialDomains) {
    const officialReg = getRegistrableDomain(official);
    if (officialReg && !SHARED_PLATFORM_DOMAINS.has(officialReg) && getRegistrableDomain(citationHost) === officialReg) return true;
  }
  if (isSharedPlatformHost(host)) {
    return citationHost === host || citationHost.endsWith(`.${host}`);
  }
  return getRegistrableDomain(citationHost) === getRegistrableDomain(host);
}

function classifySourceType(url, siteHost, officialDomains = []) {
  if (isFirstParty(url, siteHost, officialDomains)) return "official";
  const host = safeHostname(url);
  const registrable = getRegistrableDomain(host);
  for (const [type, pattern] of SOURCE_TYPE_RULES) {
    if (pattern.test(registrable) || pattern.test(host)) return type;
  }
  return "other";
}

module.exports = {
  PARSER_VERSION,
  buildBrandTermSet,
  classifyAnswerStatus,
  classifySourceType,
  compactForm,
  convertSimplified,
  extractAuthorityAliases,
  extractMentionRank,
  getRegistrableDomain,
  isFirstParty,
  isPlatformRootInput,
  isSharedPlatformHost,
  matchTermsInText,
  prepareText,
  safeHostname,
  spacedForm,
  splitScriptRuns,
  textMatchesAnyTerm
};
