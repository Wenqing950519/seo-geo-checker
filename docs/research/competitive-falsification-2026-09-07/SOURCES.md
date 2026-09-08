# 來源登錄與證據規則

研究日期：2026-09-07，Asia/Taipei。這是公開資料研究，不是付費產品驗收。所有未特別註明日期的價格均為本次讀取時的展示價；未走結帳，不含匯率換算，也不保證稅額或合約條件。來源 ID 可在其他文件交叉查找。

## 標籤與方法

- **O 觀察**：本次瀏覽器 DOM 或本地文件可直接看到的內容；看到文案只證明供應商這樣說。
- **F 官方資料**：官方文件／公告中的規格或自述，未經登入實測或獨立審計。
- **I 推論**：根據列明證據推導，可被新證據推翻。**H 假設**：待驗證提案。**U 未知**：本次未確認，不代表功能不存在。
- **T 第三方**：論壇／第三方陳述，不用來推估市場比例。買家、moat、弱點、分銷效果通常只能做 I；公開 feature、價格不是 retention 或 WTP 證據。
- 瀏覽器優先；輔以官方頁面文字讀取與查找。未登入、未送出檢測／註冊表單、未消耗競品額度。沒有可用的網路請求攔截介面，因此沒有 HAR、實際 API payload 或回應證據。DOM 觀察摘要見 TECHNICAL.md；沒有聲稱保存完整網站快照。

## 來源登錄

| ID | 頁面與來源 | 方法／可支持的主張／限制 |
|---|---|---|
| G01 | 本 repo `docs/CURRENT_STATE.md`、`docs/AI_TRUST_INDEX_V1.md` | 本地文件：四個 discovery prompts、65/35、unknown、版本化快取；沒有本次重新跑產品或驗收部署 |
| G02 | 本 repo `docs/PROJECT_CHARTER.md`、`docs/RESEARCH_STANDARD.md`、`docs/DECISION_LOG.md` | 本地文件：研究／產品邊界、D-024／025、重大方向需另行確認；本報告不修改決策 |
| H01 | [Hogiah 首頁](https://www.hogiah.com/zh-TW) | DOM：定位、免費入口、創辦人自述、DearDear 展示、LINE／學院／推薦通路；不是客戶營收證據 |
| H02 | [Hogiah 方案](https://www.hogiah.com/zh-TW/plans) | DOM：TWD 方案、prompt／engine／domain、隔日、coming soon 整合、試用條件 |
| H03 | [Hogiah 註冊](https://www.hogiah.com/zh-TW/auth/signup) | DOM：email／Google／同意條款、初始 disabled；沒有提交 |
| P01 | [Peec 方案](https://peec.ai/pricing) | DOM：實際切換月／年；每日監控、prompt volume、intent、projects、團隊、API／SSO、agency；部分功能 tier 勾選未逐格解碼 |
| P02 | [Peec 融資／ARR 公告](https://peec.ai/blog/we-raised-21m-series-a-to-help-brands-win-in-ai-search) | 官方公告，2025-11：自報 $4M+ ARR、1,300+ 品牌／agency；不是 2026-09 現況或審計數據 |
| P03 | [Peec app](https://app.peec.ai/) | DOM：載入→註冊、email／Google／Microsoft／SSO、magic link；後台未訪問 |
| R01 | [Profound 方案](https://www.tryprofound.com/pricing) | DOM：99／399 展示價及 Billed yearly、50／100 prompts、seat／credits、enterprise；不推定月繳同價 |
| R02 | [Profound Prompt Volumes](https://www.tryprofound.com/features/prompt-volumes) | 官方產品頁：授權、自願加入的對話 panel 與需求建模；資料量各頁快照不同，不合併當成現況 |
| R03 | [Prompt Volumes 說明](https://help.tryprofound.com/articles/4288109168-prompt-volumes) | 官方文件：區域覆蓋與限制，已列國家未含台灣；不能据此證明絕無台灣資料 |
| R04 | [AI Mention Effect](https://www.tryprofound.com/blog/the-ai-mention-effect) | 官方研究，2026-07-01：連接對話與後續瀏覽的觀察研究、有 placebo 檢查；不是隨機實驗或 conversion 校準產品證據 |
| R05 | [Profound welcome](https://app.tryprofound.com/welcome) | DOM：email、disabled continue、Next 靜態資源；未驗證登入後工作流 |
| S01 | [Scrunch 方案](https://scrunch.com/pricing) | DOM 優先：Core $250、125 prompts、4 LLM、5 seats；文字擷取另見舊 Starter／Growth，已排除舊值 |
| S02 | [Scrunch panel data 說明](https://scrunch.com/blog/2026-01-panel-data-explained/) | 官方方法說明：panel 是方向性資料；不能把 Google demand 當成 AI prompt 的精確人口普查 |
| O01 | [Otterly 方案](https://otterly.ai/pricing) | DOM：月繳29／189／489、15／100／400 prompts、4基本 engines、加購、API／MCP／agency／SSO |
| O02 | [Otterly API／Claude Skill](https://otterly.ai/blog/otterlyai-public-api-claude-skill-launch/) | 官方，2026-05-27：GSC 檔案→意圖分類→自然語言 prompt→交叉查已有 tracking；不等於原生 OAuth 或 weighted aggregate |
| O03 | [Otterly prompt sourcing](https://help.otterly.ai/relevant-prompts) | 官方，2026-07-17：keyword／URL／brand→prompt、intent-volume estimates；改 prompt 不沿用歷史 |
| O04 | [Otterly GSC 教學](https://otterly.ai/blog/analyze-real-prompts-google-search-console/) | 官方，2025-07-29：CSV 工作流可證；「長 query 就是 AI prompt」是未被證明的推論，不能照單全收 |
| O05 | [Otterly monitoring](https://help.otterly.ai/search-prompt-monitoring) | 官方，2026-07-17：每日執行；不是使用者每日登入證據 |
| O06 | [Otterly intent volume](https://help.otterly.ai/onboarding3) | 官方：用 Google demand 估 intent volume；不代表取得完整 AI prompt census |
| E01 | [GeoGen 方案](https://www.geogen.io/pricing) | DOM：年繳 EUR20／60／199／399，credits／entities／models／prompts、daily；未做月繳價格驗證 |
| E02 | [GeoGen 文件](https://docs.geogen.io/) | 官方 docs 入口與 quickstart／API；有 API 文件不代表 endpoint 無需認證 |
| M01 | [AEO Mantis 方案](https://www.aeomantis.com/zh-Hant/pricing) | DOM：free 一次性、USD20／50／100／200、共用 quota／品牌／seat／頻率；about 的舊文案不取代方案頁 |
| M02 | [AEO Mantis about](https://www.aeomantis.com/about) | 官方定位小團隊產品；引擎總數和 self-service 最大額度不是同一件事 |
| A01 | [Ahrefs Brand Radar](https://ahrefs.com/brand-radar) | DOM：199／平台、699全平台、custom checks、SEO 付費方案內含小量追蹤；大型 index 不等於客戶自訂每日 universe |
| A02 | [AI-adjusted volume](https://help.ahrefs.com/en/articles/16755865-what-is-ai-adjusted-volume-and-how-is-it-calculated) | 官方方法，更新標示 2026-08-31：Google parent volume×平台 usage ratio；ratio 參考 AI referral／Google organic traffic |
| A03 | [AI visibility metrics](https://help.ahrefs.com/en/articles/15501968-ai-visibility-metrics) | 官方公式：impressions／AI SoV 的加權依據；不是被觀察到的全部真實曝光 |
| A04 | [Brand Radar 使用說明](https://help.ahrefs.com/en/articles/11064852-what-is-brand-radar-and-how-to-use-it) | 官方：query sourcing、index 與 custom tracking、頻率、API／Looker 等；配額依方案 |
| Q01 | [Semrush AI Visibility Toolkit](https://www.semrush.com/kb/1493-ai-visibility-toolkit) | DOM＋官方文字：99／domain、25 prompts、daily、topic demand／intent、audit、加購50 prompts60；台灣列入 coverage |
| V01 | [Similarweb AEO](https://aisearch.similarweb.com/aeo/) | DOM＋官方文字：AI traffic／brand visibility、mentions／citations／sentiment、99起；quota／頻率未確認 |
| V02 | [Similarweb 發布公告](https://www.similarweb.com/blog/updates/announcements/introducing-ai-brand-visibility/) | 官方：在既有競爭流量分析上加 AI brand visibility；並置指標不等於模型校準 |
| T01 | [awoo GEO solution](https://www.awoo.ai/zh-hant/geo-solution/) | DOM：GEO 工具＋顧問、keyword→prompt、四個 Google／AI surfaces、citation／內容建議；舊 SEO testimonial 不能當 GEO 成效 |
| T02 | [集客行銷顧問](https://inboundmarketing.com.tw/行銷顧問服務/) | DOM：SEO／GEO／廣告／策略執行服務；不是已驗證固定價格的 SaaS |
| N01 | [Google Gen AI performance reports](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports?hl=en) | 官方＋DOM，2026-06-03；8/31 更新註明全球推出：Search／Discover 生成式 AI impressions；列出的維度不包含 query 或 conversion |
| N02 | [GA4 default channel group](https://support.google.com/analytics/answer/9756891?hl=en) | 官方：AI Assistant channel 與 referrer 規則；不能用舊的「全部都在 referral」描述 |
| N03 | [GA4 session 與 event scope](https://support.google.com/analytics/answer/11080067?hl=en) | 官方：歸因 scope 不同，不能把 session source 與事件 credit 混成同一分母 |
| N04 | [GA4 direct traffic](https://support.google.com/analytics/answer/15258820?hl=en) | 官方：direct／unknown source；未識別不等於沒有 AI 影響 |
| X01 | [Optifeed Radar](https://github.com/optifeed/optifeed-radar) | 公開 README：CLI／MCP、本地 audit／BYOK engine checks；未安裝或執行 |
| X02 | [OneGlanse](https://github.com/aryamantodkar/oneglanse) | 公開 README：MIT、自架、consumer UI tracking；免費程式不等於零帳號／主機／維護成本，未驗收可靠性 |
| C01 | [Practitioner prompt skepticism](https://www.reddit.com/r/b2bmarketing/comments/1pov3fy/anyone_else_skeptical_about_the_exact_prompt/) | 第三方公開討論：固定 prompt 代表性疑慮的例子；非抽樣調查、非市場意見比例 |

## 使用者列出的 skill 資料庫

| Repo | 本次核查與使用範圍 |
|---|---|
| [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | 讀公開目錄；不能把 competitive-ads-extractor 說成已執行指定 competitive-intelligence／SEO audit skill |
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | 精選目錄，不是一個可直接執行的統一 web audit |
| MUZI-LYY/analyze-product-competitors | 本次公開讀取與搜尋未取得可用 skill；以使用者指定 17 維度完成，不聲稱執行原 skill |
| [reverse-skill/js-reverse](https://github.com/zhaoxuya520/reverse-skill/blob/main/skills/js-reverse/SKILL.md) | 使用者拼字 reverse-skil 對應 repo 未讀到；找到 reverse-skill 並讀指引。所需 js-reverse／jshook MCP 不可用，只採用「先觀察、證據分級、不猜 endpoint」原則 |
| [clone-website SKILL](https://github.com/JCodesMore/ai-website-cloner-template/blob/master/.codex/skills/clone-website/SKILL.md) | 讀流程；只參考 DOM／路由／狀態梳理，不執行 clone、程式碼複製或部署 |

## 衝突與未完成範圍

Scrunch 文字索引價格與現場 DOM 明顯不同，本報告採現場 Core 方案。Hogiah 首頁月度重跑與方案隔日不同，採方案標示並保留衝突。Mantis 免費版及引擎數以方案配額為準。價格比較不是等量的能力／品質比較，不能單憑除以 prompt 數決定性價比。

技術逆向缺少網路攔截：無公開 API 方法、參數、回應、後端儲存設計的直接證據。登入後 UX、正式付費客戶訪談、續訂率、獲客成本、台灣真實付費意願都未取得。未將這些缺口填成 0 或「不存在」。本 repo 同日既有三份未追蹤草稿保留原樣；本研究沒有採信其未附請求證據的 API 清單。
