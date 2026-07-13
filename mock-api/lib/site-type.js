const TYPES = Object.freeze({
  RESTAURANT: "restaurant",
  MARKETPLACE: "marketplace",
  SAAS: "saas_tool",
  ECOMMERCE: "ecommerce",
  MEDIA: "media",
  ORGANIZATION: "organization"
});

function classifySite({ url = "", metadata = {}, text = "" } = {}) {
  const haystack = [url, metadata.title, metadata.description, metadata.h1, text]
    .filter(Boolean).join(" ").toLowerCase();
  if (/菜單|訂位|外帶|外送|分店|店鋪|餐廳|壽司|美食|menu|reservation|delivery/.test(haystack)) return TYPES.RESTAURANT;
  if (/工具市場|上架工具|瀏覽工具|maker|marketplace|產品目錄|賣家/.test(haystack)) return TYPES.MARKETPLACE;
  if (/dashboard|api|訂閱|登入|註冊|軟體|saas|平台工具|線上工具/.test(haystack)) return TYPES.SAAS;
  if (/購物車|結帳|商品|配送|退貨|電商|shop|cart|checkout|product/.test(haystack)) return TYPES.ECOMMERCE;
  if (/新聞|文章|部落格|專欄|報導|news|blog|magazine/.test(haystack)) return TYPES.MEDIA;
  return TYPES.ORGANIZATION;
}

const QUESTION_TEMPLATES = Object.freeze({
  restaurant: [
    ["這家餐廳主打什麼？有哪些菜單或用餐方式？", "awareness"],
    ["如何查詢分店、營業時間與訂位方式？", "consideration"],
    ["外帶、外送或官方 App 服務要怎麼使用？", "decision"]
  ],
  marketplace: [
    ["這個平台收集什麼工具？適合哪些使用者？", "awareness"],
    ["Maker 如何上架，使用者如何找到合適的工具？", "consideration"],
    ["這個平台與一般產品目錄有什麼差異？", "decision"]
  ],
  saas_tool: [
    ["這個工具解決什麼工作？適合哪些人？", "awareness"],
    ["核心功能、導入方式與收費如何？", "consideration"],
    ["如何開始使用或聯絡團隊？", "decision"]
  ],
  ecommerce: [
    ["這個網站販售什麼商品？適合哪些需求？", "awareness"],
    ["如何挑選商品、付款與配送？", "consideration"],
    ["退換貨與售後服務規則是什麼？", "decision"]
  ],
  media: [
    ["這個網站主要報導哪些主題？適合誰閱讀？", "awareness"],
    ["如何找到特定主題或系列文章？", "consideration"],
    ["內容來源、更新頻率與聯絡方式是什麼？", "decision"]
  ],
  organization: [
    ["這個組織提供什麼服務？主要服務誰？", "awareness"],
    ["如何了解服務內容、案例或合作方式？", "consideration"],
    ["如何預約、購買或聯絡這個組織？", "decision"]
  ]
});

function questionsForSite(siteType) {
  return (QUESTION_TEMPLATES[siteType] || QUESTION_TEMPLATES.organization)
    .map(([question_zh, intent], index) => ({ question_zh, intent, business_value: index === 2 ? 4 : 3 }));
}

module.exports = { TYPES, classifySite, questionsForSite };
