const LOCATION_PATTERN = /(台北|臺北|新北|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江)/;

const CATEGORY_RULES = [
  [/壽司|sushi/i, "壽司或迴轉壽司"],
  [/咖啡|coffee|cafe/i, "咖啡廳"],
  [/火鍋|hot\s*pot/i, "火鍋餐廳"],
  [/燒肉|烤肉|bbq/i, "燒肉餐廳"],
  [/室內設計|裝修|裝潢|renovation|interior design/i, "室內設計與裝修服務"],
  [/網站設計|網頁設計|web design|website design/i, "網站設計服務"],
  [/清潔|cleaning/i, "清潔服務"],
  [/搬家|moving/i, "搬家服務"],
  [/律師|law firm|legal/i, "法律服務"],
  [/會計|記帳|稅務|accounting/i, "會計與稅務服務"],
  [/民宿|旅館|飯店|hotel|guesthouse/i, "住宿"],
  [/美容|美髮|salon/i, "美容美髮服務"],
  [/健身|fitness|gym/i, "健身服務"],
  [/寵物|pet/i, "寵物服務"],
  [/軟體|saas|software|dashboard/i, "商用軟體工具"],
  [/電商|購物|e-?commerce|online store/i, "網路商店"]
];

const TYPE_LABELS = Object.freeze({
  restaurant: "餐飲品牌",
  hospitality: "住宿品牌",
  local_service: "在地服務商",
  professional_service: "專業服務團隊",
  retail: "零售品牌",
  marketplace: "媒合平台",
  saas_tool: "商用軟體工具",
  ecommerce: "網路商店",
  media: "產業媒體",
  organization: "服務品牌"
});

function buildDiscoveryQueries({ siteType = "organization", text = "" } = {}) {
  const source = String(text || "");
  const location = source.match(LOCATION_PATTERN)?.[1]?.replace("臺", "台") || "台灣";
  const category = CATEGORY_RULES.find(([pattern]) => pattern.test(source))?.[1] || TYPE_LABELS[siteType] || TYPE_LABELS.organization;
  return {
    location,
    category,
    queries: [
      `${location}有哪些值得考慮的${category}？請列出具體品牌或商家名稱，並附上可核對的來源。`,
      `${location}${category}推薦與比較：哪些品牌較常被提及？請說明理由並附來源。`
    ]
  };
}

module.exports = { buildDiscoveryQueries };
