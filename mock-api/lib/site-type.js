const TYPES = Object.freeze({
  RESTAURANT: "restaurant",
  HOSPITALITY: "hospitality",
  LOCAL_SERVICE: "local_service",
  PROFESSIONAL_SERVICE: "professional_service",
  RETAIL: "retail",
  MARKETPLACE: "marketplace",
  SAAS: "saas_tool",
  ECOMMERCE: "ecommerce",
  MEDIA: "media",
  ORGANIZATION: "organization"
});

function classifySite({ url = "", metadata = {}, text = "" } = {}) {
  const haystack = [url, metadata.title, metadata.description, metadata.h1, text]
    .filter(Boolean).join(" ").toLowerCase();
  if (/餐廳|餐館|咖啡|火鍋|燒肉|壽司|菜單|訂位|外送|restaurant|cafe|menu|reservation|delivery|takeout/.test(haystack)) return TYPES.RESTAURANT;
  if (/民宿|飯店|旅館|住宿|客房|房型|訂房|hotel|hostel|guesthouse|bnb|booking|accommodation/.test(haystack)) return TYPES.HOSPITALITY;
  if (/購物車|結帳|加入購物車|線上商城|網路商店|e-?commerce|cart|checkout|add to cart|product catalog/.test(haystack)) return TYPES.ECOMMERCE;
  if (/律師|法律事務所|會計|記帳|稅務|顧問|建築師|專利|consulting|law firm|accounting|professional service/.test(haystack)) return TYPES.PROFESSIONAL_SERVICE;
  if (/裝修|室內設計|水電|清潔|搬家|維修|攝影|婚禮|美容|美髮|健身|寵物|工程|到府|服務區域|估價|報價|repair|renovation|cleaning|local service/.test(haystack)) return TYPES.LOCAL_SERVICE;
  if (/門市|實體店|零售|專賣店|營業時間|store locator|retail|physical store/.test(haystack)) return TYPES.RETAIL;
  if (/創作者市集|線上市集|接案平台|maker|marketplace|媒合平台|人才平台/.test(haystack)) return TYPES.MARKETPLACE;
  if (/dashboard|api|訂閱|登入|軟體|saas|開發者工具|線上工具|管理平台/.test(haystack)) return TYPES.SAAS;
  if (/新聞|文章|媒體|專欄|雜誌|news|blog|magazine/.test(haystack)) return TYPES.MEDIA;
  return TYPES.ORGANIZATION;
}

const QUESTION_TEMPLATES = Object.freeze({
  restaurant: [
    ["這家店主打什麼料理，在哪個地區？", "awareness"],
    ["這家店的菜單、價格與評價如何？", "consideration"],
    ["如何訂位、外送或找到最近門市？", "decision"]
  ],
  hospitality: [
    ["這間住宿位在哪裡，適合哪些旅客？", "awareness"],
    ["房型、設備、交通與入住評價如何？", "consideration"],
    ["如何訂房，入住與取消規則是什麼？", "decision"]
  ],
  local_service: [
    ["這家公司在什麼地區提供哪些服務？", "awareness"],
    ["過往案例、價格區間與客戶評價如何？", "consideration"],
    ["如何預約現場評估或取得報價？", "decision"]
  ],
  professional_service: [
    ["這個專業團隊擅長處理哪些問題？", "awareness"],
    ["團隊資格、經驗與可驗證案例有哪些？", "consideration"],
    ["如何預約諮詢，流程與費用如何說明？", "decision"]
  ],
  retail: [
    ["這家店販售什麼商品，門市在哪裡？", "awareness"],
    ["商品特色、價格、評價與退換貨規則如何？", "consideration"],
    ["如何確認庫存、營業時間或聯絡門市？", "decision"]
  ],
  marketplace: [
    ["這個平台提供哪些供需媒合服務？", "awareness"],
    ["平台如何收費、審核與保障交易？", "consideration"],
    ["如何註冊並完成第一筆交易？", "decision"]
  ],
  saas_tool: [
    ["這個工具解決什麼問題，適合誰？", "awareness"],
    ["功能、價格與其他方案有何差異？", "consideration"],
    ["如何試用、導入或聯絡銷售？", "decision"]
  ],
  ecommerce: [
    ["這個網站主要販售哪些商品？", "awareness"],
    ["商品規格、評價、配送與退貨規則如何？", "consideration"],
    ["如何下單、付款與查詢訂單？", "decision"]
  ],
  media: [
    ["這個網站主要提供哪些主題內容？", "awareness"],
    ["作者、編輯政策與資料來源是否可信？", "consideration"],
    ["如何訂閱、引用或聯絡作者？", "decision"]
  ],
  organization: [
    ["這個組織提供什麼服務，服務哪些對象？", "awareness"],
    ["有哪些案例、資格與可信證據？", "consideration"],
    ["如何聯絡、預約或取得報價？", "decision"]
  ]
});

function questionsForSite(siteType) {
  return (QUESTION_TEMPLATES[siteType] || QUESTION_TEMPLATES.organization)
    .map(([question_zh, intent], index) => ({ question_zh, intent, business_value: index === 2 ? 4 : 3 }));
}

module.exports = { TYPES, classifySite, questionsForSite };
