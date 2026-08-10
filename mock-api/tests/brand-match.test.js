const assert = require("node:assert/strict");
const {
  PARSER_VERSION,
  buildBrandTermSet,
  classifyAnswerStatus,
  classifySourceType,
  extractAuthorityAliases,
  extractMentionRank,
  getRegistrableDomain,
  isFirstParty,
  isPlatformRootInput,
  matchTermsInText,
  textMatchesAnyTerm
} = require("../lib/brand-match");
const { evaluatePerplexityVisibility } = require("../lib/perplexity-visibility");

assert.ok(/^\d+\.\d+\.\d+$/.test(PARSER_VERSION), "PARSER_VERSION must be semver");

const termValues = (terms) => terms.map((term) => term.value);

// --- 詞彙推導 ---

// #3 兩字中文品牌不得被長度門檻丟棄
const shinYeh = buildBrandTermSet({ host: "shinyeh.com.tw", metadata: { title: "欣葉" } });
assert.ok(termValues(shinYeh).includes("欣葉"), "2-char CJK brand must survive");

// #4 半形連字號品牌不得切碎；"top" 不得成為獨立詞
const topCap = buildBrandTermSet({ host: "topcap.tw", metadata: { title: "Top-Cap Steakhouse" } });
assert.ok(!termValues(topCap).includes("top"), "hyphen fragment must not become a term");
assert.ok(textMatchesAnyTerm("We recommend Top-Cap Steakhouse for dinner.", topCap), "full hyphen brand must match");
assert.ok(!textMatchesAnyTerm("the top restaurants in Taipei are listed", topCap), "generic 'top' must not match");

// #7 中英混寫 title 需切出中文與英文候選詞
const inparadise = buildBrandTermSet({ host: "feastogether.com.tw", metadata: { title: "饗饗INPARADISE" } });
assert.ok(termValues(inparadise).includes("饗饗"), "script-boundary split must keep CJK run");
assert.ok(textMatchesAnyTerm("信義區的饗饗吃到飽很熱門", inparadise));

// #8 網域與品牌完全不同時，真值表詞彙必須可用
const masterTerms = buildBrandTermSet({ host: "feastogether.com.tw", masterTerms: ["饗饗", "INPARADISE"] });
assert.ok(textMatchesAnyTerm("推薦饗饗的自助餐", masterTerms), "master terms must drive matching");
assert.equal(masterTerms[0].source, "master");

// #9 「101店」這類分店編號不得成為比對詞
const dtf = buildBrandTermSet({ host: "dintaifung.com.tw", metadata: { title: "鼎泰豐｜101店" } });
assert.ok(termValues(dtf).includes("鼎泰豐"));
assert.ok(!termValues(dtf).includes("101店"), "branch-number token must be dropped");

// #10 台灣前綴品牌保留去前綴變體
const sushiroTerms = buildBrandTermSet({ host: "sushiro.com.tw", metadata: { title: "首頁｜台灣壽司郎" } });
assert.ok(termValues(sushiroTerms).includes("壽司郎"));

// #12 純通用詞 title 不得產生比對詞（美食＋餐廳為通用複合詞）
const generic = buildBrandTermSet({ host: "example.com.tw", metadata: { title: "美食餐廳" } });
assert.ok(!termValues(generic).includes("美食餐廳"), "generic compound must be dropped");

// --- 比對 ---

// #2 假名別名必須保留且可比對
const kana = buildBrandTermSet({ host: "sushiro.com.tw", aliases: ["スシロー"] });
assert.ok(termValues(kana).includes("スシロー"), "kana alias must survive normalization");
assert.ok(textMatchesAnyTerm("台灣的スシロー分店一覽", kana));

// #5 全形英數經 NFKC 正規化後可比對
assert.ok(textMatchesAnyTerm("ＳＵＳＨＩＲＯ 分店資訊", sushiroTerms));

// #6 簡體答案可對上繁體詞
assert.ok(textMatchesAnyTerm("寿司郎是台湾人气回转寿司品牌", sushiroTerms));

// #11 跨句串接不得造成誤判（舊版刪標點後「大三」+「元旦」會拼出「大三元」）
const daSanYuan = buildBrandTermSet({ host: "dasanyuan.tw", metadata: { title: "大三元酒樓" } });
assert.ok(!textMatchesAnyTerm("考完大三。元旦去吃飯", buildBrandTermSet({ masterTerms: ["大三元"] })), "cross-sentence concatenation must not match");
assert.ok(textMatchesAnyTerm("大三元酒樓的烤鴨很有名", daSanYuan));

// #13 同名異店仍會命中：已知限制，需靠真值表與地區欄位消歧
assert.ok(textMatchesAnyTerm("高雄的欣葉分店", shinYeh), "same-name collision remains a documented limitation");

// #14 詞內空白不影響比對
assert.ok(textMatchesAnyTerm("壽司 郎 的菜單", sushiroTerms));

// #15 錯字不做模糊比對
assert.ok(!textMatchesAnyTerm("壽斯郎的評價", sushiroTerms));

// #18 拉丁多詞品牌以詞界比對
const louisa = buildBrandTermSet({ host: "louisacoffee.co", metadata: { title: "Louisa Coffee 路易莎" } });
assert.ok(textMatchesAnyTerm("I recommend Louisa Coffee in Taipei", louisa));
assert.ok(textMatchesAnyTerm("路易莎的咖啡", louisa));

// #19 負面提及仍算提及（提及率不等於推薦率，白皮書須另行編碼 recommended_flag）
assert.ok(textMatchesAnyTerm("壽司郎最近的食安新聞", sushiroTerms));

// #20 大小寫不敏感
assert.ok(textMatchesAnyTerm("SUSHIRO Taiwan branch", sushiroTerms));

// --- ALIASES 行解析 ---

// #17 markdown 粗體與破折前綴不得讓別名遺失
assert.deepEqual(extractAuthorityAliases("**ALIASES**: 壽司郎 | Sushiro"), ["壽司郎", "sushiro"]);
assert.deepEqual(extractAuthorityAliases("- Aliases： 欣葉 | Shin Yeh"), ["欣葉", "shinyeh"]);
assert.deepEqual(extractAuthorityAliases("ALIASES: UNKNOWN"), []);

// 別名「台灣壽司郎」必須自動產生「壽司郎」變體（2026-07-19 生產 raw 證據回歸：
// 答案寫「壽司郎（スシロー）」，別名只有官方全名時仍須命中）
const affixTerms = buildBrandTermSet({ host: "sushiro.com.tw", aliases: ["台灣壽司郎", "台灣スシロー"] });
assert.ok(termValues(affixTerms).includes("壽司郎"), "Taiwan prefix must be stripped from aliases too");
assert.ok(termValues(affixTerms).includes("スシロー"));
assert.ok(textMatchesAnyTerm("| **壽司郎（スシロー）** | 中壢中正店（中壢區中正路170號2樓） |", affixTerms));

// markdown 表格列也要能解析排名（生產答案常以表格列出品牌）
const tableAnswer = "| 品牌名稱 | 桃園分店位置 |\n|---|---|\n| **壽司郎（スシロー）** | 中壢中正店 |\n| **藏壽司（くら寿司）** | JC Park中壢店 |";
assert.deepEqual(extractMentionRank(tableAnswer, affixTerms), { rank: 1, status: "parsed" });

// --- 拒答與空答分類 ---

assert.equal(classifyAnswerStatus(""), "empty");
assert.equal(classifyAnswerStatus("很抱歉，無法提供相關資訊。"), "refusal");
assert.equal(classifyAnswerStatus("unknown"), "refusal");
assert.equal(classifyAnswerStatus("信義區有多家知名餐廳，例如鼎泰豐。"), "answered");

// --- 排名抽取 ---

const rankAnswer = "以下是推薦：\n1. 鼎泰豐（101店）\n2. 欣葉台菜\n3. 饗饗INPARADISE";
assert.deepEqual(extractMentionRank(rankAnswer, shinYeh), { rank: 2, status: "parsed" });
assert.deepEqual(extractMentionRank("欣葉是不錯的選擇。", shinYeh), { rank: null, status: "no_list" });
assert.deepEqual(extractMentionRank("1. 鼎泰豐\n2. 春水堂", shinYeh), { rank: null, status: "not_mentioned" });

// --- 官網判定與網域正規化 ---

assert.equal(getRegistrableDomain("www.sushiro.com.tw"), "sushiro.com.tw");
assert.equal(getRegistrableDomain("job.taiwanjobs.gov.tw"), "taiwanjobs.gov.tw");
assert.ok(isFirstParty("https://store.sushiro.com.tw/menu", "sushiro.com.tw"), "subdomain is first party");
assert.ok(isFirstParty("https://sushiro.com.tw/", "www.sushiro.com.tw"), "www stripping");
assert.ok(!isFirstParty("https://foo.com.tw/", "bar.com.tw"), "shared public suffix must not match");
// 平台頁：品牌掛在 pixnet 子網域時，引用 pixnet 根網域不得算官網（舊版雙向 endsWith 的 FP）
assert.ok(!isFirstParty("https://pixnet.net/", "brand.pixnet.net"), "platform root citation is not first party");
assert.ok(isFirstParty("https://brand.pixnet.net/blog/post/1", "brand.pixnet.net"));
// 真值表官方網域：與受測 host 不同的註冊網域也可判定為官網
assert.ok(isFirstParty("https://www.wowprime.com/brand", "wangsteak.com.tw", ["wowprime.com"]));

// #(單位) 平台根網域輸入必須被偵測
assert.ok(isPlatformRootInput("facebook.com"));
assert.ok(isPlatformRootInput("www.instagram.com"));
assert.ok(!isPlatformRootInput("sushiro.com.tw"));
assert.ok(!isPlatformRootInput("brand.pixnet.net"));

// 來源分類
assert.equal(classifySourceType("https://www.sushiro.com.tw/Menu", "sushiro.com.tw"), "official");
assert.equal(classifySourceType("https://www.facebook.com/sushirotaiwan", "sushiro.com.tw"), "social");
assert.equal(classifySourceType("https://inline.app/booking/x", "sushiro.com.tw"), "booking");
assert.equal(classifySourceType("https://foodie.pixnet.net/blog/post/9", "sushiro.com.tw"), "ugc");
assert.equal(classifySourceType("https://zh.wikipedia.org/wiki/Sushiro", "sushiro.com.tw"), "wiki");

// --- 整合回歸：生產資料的壽司郎 FN（#1、#16） ---
// authority 沒有第一方引用，但外部來源可實體對齊 → 別名必須被採納，中文提及必須命中。
const regression = evaluatePerplexityVisibility({
  siteUrl: "https://www.sushiro.com.tw/",
  metadata: { title: "" },
  searchEvidence: {
    authority: {
      enabled: true,
      answer: "ALIASES: 壽司郎 | Sushiro | スシロー\n此網站屬於台灣壽司郎。",
      citations: ["https://en.wikipedia.org/wiki/Sushiro"],
      searchResults: [
        { title: "Sushiro Taiwan 展店資訊", url: "https://en.wikipedia.org/wiki/Sushiro" },
        { title: "迴轉壽司市場報導", url: "https://news.example.tw/sushiro-expansion" }
      ]
    },
    discovery: [
      {
        enabled: true,
        query: "台北市信義區迴轉壽司推薦",
        answer: "以下是常見選項：\n1. 壽司郎（Sushiro）\n2. 藏壽司\n3. 爭鮮",
        citations: ["https://www.sushiro.com.tw/Menu"],
        searchResults: []
      },
      {
        enabled: true,
        query: "台北市信義區日式餐廳推薦",
        answer: "很抱歉，無法提供相關資訊。",
        citations: [],
        searchResults: []
      }
    ]
  }
});
assert.equal(regression.status, "measured");
assert.ok(regression.authorityAliases.includes("壽司郎"), "aliases must be accepted when entity is grounded without first-party source");
assert.equal(regression.measuredQueryCount, 1, "refusal query must leave the denominator");
assert.equal(regression.excludedQueryCount, 1);
assert.equal(regression.mentionRate, 100, "Chinese brand mention must be detected (production FN regression)");
assert.equal(regression.citationRate, 100);
assert.equal(regression.observations[0].mentionRank, 1);
assert.equal(regression.observations[1].answerStatus, "refusal");
assert.equal(regression.termOrigin, "derived");

// 平台根網域輸入：官網引用一律不可歸屬
const platformRun = evaluatePerplexityVisibility({
  siteUrl: "https://www.facebook.com/",
  metadata: { title: "Facebook - 登入或註冊" },
  searchEvidence: {
    authority: { enabled: true, answer: "", citations: [], searchResults: [] },
    discovery: [
      { enabled: true, query: "信義區餐廳推薦", answer: "推薦鼎泰豐。", citations: ["https://www.facebook.com/dintaifung.tw"], searchResults: [] }
    ]
  }
});
assert.equal(platformRun.platformRootInput, true);
assert.equal(platformRun.citationRate, 0, "platform root input must not earn first-party citations");

console.log("brand-match.test.js passed");
