---
type: competitive-intelligence
project: GeoCheck
status: draft — 情報草稿，非決策
version: 0.1.0
collected_at: 2026-09-07
collector: Agent（依 docs/RESEARCH_STANDARD.md v1.0.0 執行）
tags:
  - geocheck
  - competitive-intel
---

# GEO / AI Visibility 競品情報與技術逆向（2026-09-07）

> [!caution] 本檔不是決策文件
> 依 `CLAUDE.md` Human Ownership 與 `RESEARCH_STANDARD §4.2`，本檔所有方向性判斷一律為**建議**。
> 未記入 `docs/DECISION_LOG.md` 前，任何一句都不得被引用為「GeoCheck 已決定」。

---

## 0. 執行狀態（RESEARCH_STANDARD §16 強制區塊）

**任務階段**：來源蒐集 → 證據帳本（已完成部分）；分析與結論為**初步**。

**可用來源**：見 §1 來源登錄表，共 15 項（S001–S015）。

**已驗證來源**（本 session 實際開啟原始頁面並取得 DOM／原始 JSON）：
S001, S002, S003, S004, S005, S006, S007, S008, S009, S011, S014

**未視覺覆核來源**（經 WebFetch 取得原文並轉為 markdown，未做瀏覽器渲染覆核）：
S010, S012, S013, S015

**未驗證／未執行**（**禁止引用**）：
- GeoGen、AEO Mantis：**完全未研究**，本檔不含其任何資料。
- Similarweb AI 產品：目標頁 404，未取得替代原始頁。
- Scrunch 定價：官網未於首頁揭露，未開啟 `/pricing` 覆核。
- Substitute 類（ChatGPT + Spreadsheet、GSC、GA4、人工監測、開源 tracker）：**未做任何實證蒐集**，本檔不下判斷。
- 所有競品的營收、客戶數、留存率、獲客成本：無任何可用來源。

**可使用主張**：定價、功能矩陣、公開技術端點、官方文件敘述、政府登記資料。

**資料缺口**（見 §7 完整清單）：付費市場規模、留存率、實際使用頻率、買家預算來源、台灣市場付費意願。

**不可形成的結論**：
- 任何「市場規模 / 成長率 / 滲透率」數字。
- 任何競品的營收、獲利、客戶留存。
- 「GEO 監測有效」或「AI 引用帶來營收」的因果主張。

**需要作者決定的項目**：見 §8。

---

## 1. 來源登錄表

| ID | 來源 | 分級 | 取得方式 | 日期 |
|---|---|---|---|---|
| S001 | `https://hogiah.com/`（首頁） | C1（廠商自述）＋P0（本次觀測） | 瀏覽器 DOM | 2026-09-07 |
| S002 | `https://hogiah.com/zh-TW/plans`（方案比較） | P2（官方產品文件） | 瀏覽器 DOM | 2026-09-07 |
| S003 | `https://hogiah.com/zh-TW/glossary`（術語表） | P2（官方產品文件） | 瀏覽器 DOM | 2026-09-07 |
| S004 | `hogiah.com/_next/static/chunks/0vdblgf_vcyu2.js`（前端 bundle） | P2（公開發布之程式） | fetch + 原始碼擷取 | 2026-09-07 |
| S005 | 經濟部商工登記公示資料 OpenAPI，統編 62063211 | **P1（台灣官方第一手）** | 原始 JSON | 2026-09-07 |
| S006 | `https://peec.ai/pricing` | P2 | 瀏覽器 DOM + 截圖 | 2026-09-07 |
| S007 | `https://ahrefs.com/brand-radar` | P2 | 瀏覽器 DOM | 2026-09-07 |
| S008 | `https://www.tryprofound.com/features/prompt-volumes` | P2 | 瀏覽器 DOM | 2026-09-07 |
| S009 | `https://www.tryprofound.com/integrations` | P2 | 瀏覽器 DOM（find 逐字覆核） | 2026-09-07 |
| S010 | `https://www.tryprofound.com/pricing` | P2 | WebFetch（未視覺覆核） | 2026-09-07 |
| S011 | `https://www.semrush.com/pricing/` | P2 | 瀏覽器 DOM | 2026-09-07 |
| S012 | `https://otterly.ai/pricing/` | P2 | WebFetch（未視覺覆核） | 2026-09-07 |
| S013 | `https://scrunch.com/` | P2 | WebFetch（未視覺覆核） | 2026-09-07 |
| S014 | `https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports` | **P2（平台官方文件）** | 瀏覽器 DOM | 2026-09-07 |
| S015 | `https://www.awoo.ai/zh-hant/blog/geo-suite-guide/` | C1（廠商自述） | WebFetch（未視覺覆核） | 2026-09-07 |

> 【來源不合規】所有「GEO 工具推薦」「2026 GEO 公司名單」類第三方彙整文（frankchiu.io、ahha.tw、geniushub.cc、seo-koumei.com、enterimc.com、知乎等）**僅作為尋找線索使用**，其數值與排名不進入本檔證據帳本（依 §5.5 / §5.6）。

---

## 2. 與 PROJECT_CHARTER 的衝突（必須先解決，不得由 Agent 選邊）

任務指令中的四項前提與現有已確認文件直接衝突。依 `CLAUDE.md`「文件衝突時停止重大變更並指出衝突」，先列出：

| # | 任務指令的前提 | 衝突對象 | 衝突內容 |
|---|---|---|---|
| C1 | ICP＝SEO/GEO Consultant、Agency、In-house SEO、Growth Team | `PROJECT_CHARTER §2.1`〔假設〕＋ **D-023（Confirmed, 2026-09-03）** | Charter 的產品使用者假設是「中小企業主本人（非行銷負責人、非代理商）」；D-023 已拍板「產品對外語言改為商家白話」。改成賣給 SEO 專業人士，等同推翻 D-023 的語言基礎。 |
| C2 | 「計劃轉型為訂閱制 SaaS」 | `PROJECT_CHARTER §0`（D-004 Confirmed）＋`§6`〔待定〕 | 目的優先序為 研究白皮書 > 能力展示 > 商業化；§6 商業模式明載「使用者尚未決定，Agent 不得代填」。 |
| C3 | 差異化＝與真實 AI referral / conversion 校準 | `PROJECT_CHARTER §3.3`（A4 斷點，D-008 Confirmed）＋`CURRENT_STATE` 對外聲明 | A4（引用→獲客）被列為本專案最重要的未解問題，處置是「探索性相關分析、**禁止宣稱因果**」；對外聲明明載「不保證任何 AI 引擎一定引用、排名或推薦」。把「校準到 conversion」寫成產品核心賣點，等於把尚未成立的因果鏈當成賣點。 |
| C4 | 「Action layer」「Project→Data→Monitor→**Action**」 | `PROJECT_CHARTER §1` 產品邊界（D-007 Confirmed） | 已確認邊界為「不做內容代寫與執行，只診斷」。 |

> 【AUTHOR DECISION REQUIRED】C1–C4 每一項都屬 Human Ownership。本檔以下分析**同時**呈現「維持 Charter」與「採納新前提」兩種情境的意涵，不代替使用者選擇。

---

## 3. 階段一：基礎情報卡（僅列已取得原始頁面者）

### 3.1 Hogiah（台灣）

- **法人主體**〔GOV-001｜S005〕：清程智能科技有限公司，統編 62063211，狀態「核准設立」，`Company_Setup_Date` = `1150611`（**民國115年6月11日 → 2026-06-11**），`Change_Of_Approval_Data` = `1150805`（2026-08-05）。資本額 **NT$300,000**，`Paid_In_Capital_Amount` = 0。負責人 **胡湘巖**。登記機關臺北市政府，地址臺北市中山區南京東路2段140號6樓。
  → **推論**〔SYN-001｜Based on GOV-001〕：截至 2026-09-07，該法人成立約 **3 個月**，登記資本額為台灣有限公司常見的極小額。**注意**：登記資本額不等於實際募資或營收，不得據此推斷其財力或客戶數。
- **定位**〔S001〕：「專為台灣市場打造的 AI 能見度優化監測平台」。
- **創辦人自述**〔C1｜S001〕：Leo Hu，自述「帶過 20 人的技術團隊做產品，後來跳進美業經營自己的品牌」；以自營美業品牌 **DearDear** 作為所有功能的先行驗證場。**此為廠商自述，未驗證。**
- **核心功能**〔S001, S002〕：能見度追蹤、競品矩陣、引文拆解、引文網路圖、情緒傾向、優化建議（Opportunities）、Ask 問答／幻覺檢查、週報、Agent 市集、tracked pages、CSV 匯出、**AI 全文生成**。
- **AI 引擎**〔S002〕：ChatGPT、Perplexity、Google AI Overviews、Gemini、Claude、Grok（依方案 1／3／6 個）。企業方案另稱支援 Copilot、DeepSeek。
- **定價**〔S002，官方頁逐字〕：

| 方案 | 月費 | 提示詞 | 引擎 | 網域 | 全文文章 |
|---|---:|---:|---:|---:|---:|
| Starter | NT$1,080 | 50 | 1 | **1** | 5 篇/月 |
| Growth | NT$3,280 | 100 | 3 | **1** | 15 篇/月 |
| Pro | NT$12,800 | 100 | 6 | **1** | 35 篇/月 |
| Enterprise | 客製 | 客製 | 全 | 客製 | 客製 |

- **Billing Unit**〔S002〕：提示詞數 × 引擎數 × **每月生成文章篇數**。**不是 seat**（未見 seat 限制）。**網域固定為 1**（三個自助方案皆同）。
- **追蹤頻率**〔S002〕：**每 2 天**（三個自助方案皆同）。
- **年繳**〔S002〕：預付享 2 個月免費。
- **試用**〔S002〕：Growth 7 天免費試用，需綁卡，以 NT$10 驗卡後取消。
- **地區**〔S002〕：自助方案為「全台灣」；城市級與海外多區域僅 Enterprise。
- **整合**〔S002〕：GSC / Slack / Notion 等第三方整合 = **「即將推出」（三個方案皆未上線）**。
- **通路**〔S001, S002〕：免費健檢（10 項）→ Email 換完整報告；LINE 官方帳號真人諮詢；**hogiah 學院**（課程＋互動教學）；9 個產業解決方案頁（含「餐飲與在地店家」）；**分潤夥伴計畫 10%–20% 經常性佣金**。
- **廣告投放**〔OBS-001｜S001〕：首頁載入 Google Ads conversion tag（`AW-18052134341`）、GTM（`GTM-NBJ6W78V`）、GA4（`G-138204EC04`）、Meta Pixel（`2799985437014035`）。→ **觀察**：有在跑 Google Ads 與 Meta 再行銷的技術配置。**不得據此推論廣告預算或成效。**
- **能見度定義**〔S003，官方術語表逐字〕：「AI 能見度」＝被引用率（citation rate）＋品牌提及率（mention rate）＋聲量出現率（share of voice）。被引用率定義為「追蹤 100 條提示詞，其中 15 條有引用你的頁面，被引用率就是 15%」。
  → **關鍵觀察**〔OBS-002｜S003〕：此定義為**未加權計數**。術語表全文**未出現** demand weighting、search volume、intent weighting、referral、conversion 任何一項。

### 3.2 Peec AI

- **定位**〔S006〕：「AI search analytics for marketing teams」，頁面標題含 "and SEO agencies"。
- **定價（年繳顯示價，官方頁逐字）**〔S006〕：Starter **$80/mo**（Save $180）、Pro **$205/mo**（Save $480）、Advanced **$420/mo**（Save $900）、Enterprise 客製。年繳折扣自述 15%。
- **額度**〔S006〕：Starter 50 prompts / 3 models / **unlimited users** / daily / 1 project；Pro 150 / 3 / unlimited / daily / 2 projects；Advanced 350 / 3 / unlimited / daily / 5 projects + Multi country + Looker Studio。Enterprise 最多 12 個 LLM、unlimited projects、API、SSO。
- **Billing Unit**〔S006 FAQ 逐字〕：「Pricing is based on the number of tracked prompts and models analyzed.」**Seat 完全免費（unlimited users 全方案）**。國家／語言不加價。
- **Add-on**〔S006〕：每多 1 個 model — Starter $30/mo、Pro $70/mo、Advanced $140/mo。
- **Agency**〔S006 FAQ 逐字〕：「Agencies can manage multiple client projects under one bundle, with centralized billing and flexible prompt allocation.」Prompt 可跨 project／brand 共用配額。
- **關鍵功能（官方功能矩陣逐字）**〔S006〕：
  - **Prompt volume**：「Relative demand for the topic behind each tracked prompt, scored 1–5.」
  - **Intent classification**：「Each prompt classified as informational, commercial, or transactional.」
  - **Brand classification**：branded / non-branded。
  - **Prompts from keywords**、Personas、Sub-brand tracking。
  - **AI referrals**：「Visits arriving on your site from AI assistants.」
  - **Visibility lift analysis** / **Visibility lift predictor**。
  - Ads library（AI 答案中的贊助置入）、AI Shopping／SKU 級追蹤、Source classification、Gap analysis、Agent actions、MCP、SOC 2。
  - Integrations：CDN & log providers（Vercel/Cloudflare/AWS/CloudFront/GCP CDN/WordPress/Akamai/webhook/CSV）、**Google Analytics**。
  - → **Google Search Console 未出現在功能矩陣任何一列。**
- **廠商自述（C1，不得作為實證）**：「Trusted by 3000+ brands and agencies」；logo 牆列出 zalando、attio、Squarespace、Brevo、HUGO BOSS、n8n、TUI GROUP、WIX；「4.9/5 on G2」。

### 3.3 Profound

- **定價**〔S010，未視覺覆核〕：Starter $99/mo（年繳，僅 ChatGPT，50 prompts，1,500 responses/mo，1 seat，100 agent credits）；Growth $399/mo（ChatGPT + Perplexity + Google AI Overviews，100 prompts，9,000 responses/mo，3 seats，400 agent credits）；Enterprise 客製（最多 9 個引擎、SSO/SAML、SOC2、API）。
- **模組**〔S008, S009〕：Prompt Volumes、Answer Engine Insights、Agents、Agent Analytics、Aim (AI Marketer)、Shopping。
- **Prompt Volumes 資料源（官方頁逐字）**〔S008〕：
  - 「Get a report with the most relevant prompts from Profound's **1.5 billion+ real AI conversations**, ready to track.」
  - 「Every insight is anchored in real data from **double opt-in consumer panels, not API outputs or synthetic estimates**.」
  - 「All prompt data is anonymized, aggregated, and scrubbed of PII. Fully compliant with GDPR and CCPA.」
  - 「Weekly data refresh with less than one week latency. Multi-region coverage spanning the US, UK, Canada, Germany, France, and more.」
  - 功能含：Automated intent classification（informational / commercial / conversational / generative）、Sub-intent breakdown、**Prioritize by intent volume**、Demographic breakdown（platform / age / income）、Co-citation mapping、Uncited prompt detection。
- **整合（官方頁逐字覆核）**〔S009〕：
  - **Google Search Console**：「Connect Google Search Console to Profound and unify traditional and AI Search insights」
  - **Google Analytics ／ Adobe Analytics**：「See exactly how AI visibility drives traffic and **conversions** on your site」
  - 另有 Google Ads、OpenAI Ads、9 個 CDN／log provider、10+ CMS、DataForSEO、G2、Looker。
- 研究輸出〔S008〕：站上列出研究文章「The AI mention effect — Measuring downstream web browsing after AI brand mentions」（2026-07-01）。**內文未讀取，禁止引用其結論。**

### 3.4 Ahrefs Brand Radar（SEO Suite）

（官方頁逐字，S007）

- **兩種追蹤方式**：
  - **Custom Prompts** — 「Free in every Ahrefs paid plan」（Lite+）；每個付費方案內含每日額度：Lite 5 / Standard 10 / Advanced 20 / Enterprise from 83 prompts；獨立購買 **starts at $50/mo**，`$699/MO FOR ALL MODELS`。
  - **AI Visibility Index** — **$199/mo**，83 prompts/day、+2,500 checks/month、overage $0.020/check、all platforms（Claude available）。
- **索引規模**：AI Overviews 308.3M、Gemini 31.5M、Perplexity 31.4M、ChatGPT 31.3M、Copilot 30.9M、AI Mode 29.4M＝**462M+ total monthly prompts**。
- **Prompt 來源（官方 FAQ 逐字）**：「Ahrefs takes **real queries from its keyword database**, expands them into natural questions via **People Also Ask and semantic fanout**, then runs the resulting 462M+ prompts through each AI platform and stores the responses.」
- **需求加權（官方 FAQ 逐字，本研究最關鍵一條）**：
  - 「**Estimated Impressions – potential visibility weighted by the real search volume behind each prompt**」
  - 「Every prompt in the Index maps back to real search demand, on two levels: **Search demand** – the branded keywords behind your mentions, so you can see the **actual query volume driving your AI visibility**. **Topics** – clustered keywords…」
  - 「Because both index types derive from **real search demand, not synthetic guesses**, the visibility metrics reflect what people really ask.」
- **AI 流量**：AI traffic（Web Analytics，**Free**）、Bot visits（Bot Analytics，**Free while in beta**）。
- **GSC**：`GSC Insights` 為 Ahrefs Core Tools 之一（非 Brand Radar 內建，但同一帳號內）。
- 廠商自述（C1）：「Used by 3,000+ companies」。

### 3.5 Semrush（SEO Suite）

（官方定價頁逐字，S011）

- **基礎 SEO 方案 $139/mo（年繳 $117.33）已內含**：Track performance in AI search、Monitor AI sentiment、AI visibility reports for any domain、Monitor custom prompts。
- **Starter SEO + AI Search $199/mo（年繳 $165.17）**：50 prompts to track daily、1 domain for AI brand performance、300 AI visibility reports per day、AI-ready Site Audit。
- **Pro+ $299/mo**：100 prompts daily。**Advanced $549/mo**：200 prompts daily。
- **Enterprise（客製）** 明列：「Custom large-scale AI prompt tracking」「Multi-brand, multi-product AI visibility」「**Forecasting & ROI attribution**」。
- **白標**：Pro Report add-on **$20/mo** 含「Branding and white-labeling」；Base Report $10/mo 含「Google Analytics and Google Search Console integrations」。
- Additional Users add-on 起價 $45/mo。

### 3.6 Otterly.AI

〔S012，未視覺覆核〕Lite $29/mo（15 prompts、4 引擎、daily、1 workspace、1,000 GEO URL audits）；Standard $189/mo（100 prompts、unlimited workspaces、API/MCP、200k Agent Analytics events）；Premium $489/mo（400 prompts）；Enterprise 自 $1,000/mo 起。年繳 15% 折。Add-on：extra 100 prompts $99/mo；Gemini／AI Mode／Claude 各自加價。Agency partner 另給 150–500 prompts + Looker Studio 報表。**未提及 GSC、需求加權、白標。**

### 3.7 Scrunch AI

〔S013，未視覺覆核〕定位「AI Customer Experience Platform (AXP)」。模組：Monitoring（LLM 成效、prompt analytics、AI traffic feed）、Insights（citation 分析、錯誤偵測）、Agent Experience Platform（對 AI agent 提供機器可讀頁面）。引擎：ChatGPT、Perplexity、Claude、Gemini、Copilot。**定價未於首頁揭露 → 【來源未驗證】，本檔不列價格。** 廠商自述（C1）：500+ companies，點名 Lenovo、Skims、Crunchbase、Penn State。

### 3.8 awoo 阿物科技（台灣）

〔S015，C1 廠商部落格，未視覺覆核〕GEO Suite 五大指標：**品牌提及率、聲量佔比、平均排名、情緒分析、網站引用率**。未揭露引擎清單、prompt 來源、定價。未提及需求加權、GSC、referral、conversion。
→ **重要**：awoo 是台灣既有 MarTech 廠商，**具備既有 SEO SaaS 客戶基礎**。其進入 GEO 監測，意味台灣市場的競爭不只來自 Hogiah 這類新創。

### 3.9 未研究（不得推測）

**GeoGen、AEO Mantis、Similarweb、Substitute 全類別**：本次未取得任何原始頁面。
→ 【資料缺口】目前沒有符合本研究來源規範的證據，因此無法形成實證陳述。

---

## 4. 階段二：17 維度對比矩陣

> 空白／`—` 代表**未取得證據**，不代表「沒有」。GeoCheck 欄依 `docs/CURRENT_STATE.md`（2026-09-06）與 `PROJECT_CHARTER.md`。

| 維度 | GeoCheck（現況） | Hogiah | Peec AI | Profound | Ahrefs Brand Radar | Semrush |
|---|---|---|---|---|---|---|
| **ICP** | 〔假設〕中小企業主本人 | 台灣品牌主／行銷團隊／多店・醫美集團〔S001,S002〕 | Marketing teams、SEO agencies〔S006〕 | Enterprise 行銷／AEO／PR／Agency 團隊〔S009 nav〕 | 既有 Ahrefs SEO 使用者〔S007〕 | 既有 Semrush SEO 使用者〔S011〕 |
| **Buyer** | 〔未定義〕 | 品牌主本人（LINE 成交路徑）〔S001〕 | SEO/Content manager → marketing team〔S006〕 | Enterprise 採購（SSO/SOC2/客製）〔S010〕 | 現有訂閱者，零新增決策〔S007〕 | 現有訂閱者，零新增決策〔S011〕 |
| **JTBD** | 「我的網站 AI 讀不讀得懂／有沒有被提到」 | 「AI 講不講我，怎麼改，順便幫我寫文章」〔S002〕 | 「AI 搜尋成效儀表板 + 該做什麼」〔S006〕 | 「AI 搜尋是黑盒，我要 enterprise 級可視化與歸因」〔S009〕 | 「我的 SEO 工具順便涵蓋 AI」〔S007〕 | 同左〔S011〕 |
| **Pricing** | 免費一次性檢測 | NT$1,080 / 3,280 / 12,800 /月〔S002〕 | $80 / 205 / 420 /月（年繳）〔S006〕 | $99 / 399 /月（年繳）+ Enterprise〔S010〕 | $50 起；Index $199/mo；付費方案內含〔S007〕 | AI 已含於 $139 SEO 方案；$199/299/549〔S011〕 |
| **Billing Unit** | 無 | prompts × engines × **文章篇數**〔S002〕 | **prompts × models**（seat 免費）〔S006〕 | prompts + responses + **seats** + agent credits〔S010〕 | **checks**（prompt×platform×日）〔S007〕 | prompts/day + websites + seats add-on〔S011〕 |
| **Monitoring** | 一次性，D1 快取重用〔CURRENT_STATE D-025〕 | **每 2 天**（全方案）〔S002〕 | **Daily**（全方案）〔S006〕 | Daily〔S010〕 | Daily（cadence 可選）〔S007〕 | Daily〔S011〕 |
| **Prompt Source** | DeepSeek 依網站內容產候選題 → 後端選 4 題〔CURRENT_STATE〕 | **自動由網站掃描產生**（「產生消費者會問 AI 的問題…」）〔S004〕 | 自建 + prompts from keywords + suggestions〔S006〕 | **1.5B+ 真實 AI 對話（雙重同意 panel）**〔S008〕 | **真實搜尋查詢庫 + PAA + semantic fanout → 462M prompts**〔S007〕 | 自訂 prompts〔S011〕 |
| **Query Weighting** | **無** | **無**（術語表為未加權計數）〔S003〕 | **Prompt volume 1–5 相對需求分 + intent 分類**〔S006〕 | **Intent volume 排序 + demographic 切分**〔S008〕 | **Estimated Impressions＝以真實搜尋量加權**〔S007〕 | — |
| **Calibration** | **無**（且 A4 被 Charter 列為未解斷點） | **無**（頁面全無 referral／conversion 字樣）〔S001-S003〕 | 有 **AI referrals** 報表 + GA 整合 + Visibility lift analysis／predictor〔S006〕 | **明示** 「how AI visibility drives traffic and **conversions**」（GA/Adobe）〔S009〕 | AI traffic（免費 Web Analytics）＋ Bot Analytics〔S007〕 | Enterprise 列 **Forecasting & ROI attribution**〔S011〕 |
| **Citation** | 已驗證第一方官方 URL 來源證據佔 AI Trust Index 35%〔D-021〕 | 引文拆解 + **引文網路圖** + tracked pages〔S002〕 | Source analytics、citation share、**source classification**、fanout〔S006〕 | Co-citation mapping、uncited prompt detection〔S008〕 | Cited pages〔S007〕 | — |
| **Recommendation** | 站內建議（不進計分）〔CURRENT_STATE〕 | Opportunities + **AI 全文生成 5/15/35 篇**〔S002〕 | Recommended actions、Agent actions、custom skills〔S006〕 | Agents、Aim（每週優先建議）〔S008〕 | — | Content optimization〔S011〕 |
| **Integration** | GA4（自家追蹤）〔ANALYTICS_TRACKING〕 | GSC/Slack/Notion **即將推出（未上線）**〔S002〕 | GA + 9 CDN/log + Looker + API + MCP。**無 GSC**〔S006〕 | **GSC + GA + Adobe + Google Ads + OpenAI Ads + 9 CDN + 10 CMS**〔S009〕 | 同帳號內 GSC Insights、Web Analytics〔S007〕 | GA + GSC（Report add-on $10）〔S011〕 |
| **Agency** | 無 | **弱：三個自助方案皆限 1 網域**；多店需 Enterprise。有 10–20% 分潤〔S002〕 | **強：bundle、集中帳單、prompt 跨 brand 共用、sub-brand 預設開**〔S006〕 | `/solutions/agencies`、`/partners`〔S009 nav〕 | 多網域屬既有 SEO 帳號能力 | **白標報表 $20/mo**〔S011〕 |
| **Enterprise** | 無 | Enterprise 客製（LINE 洽談）〔S002〕 | SSO、API、role-based、**SOC 2**〔S006〕 | SSO/SAML、**SOC2**、API、dedicated Slack〔S010〕 | Enterprise 方案〔S007〕 | SSO、audit logs、SLA〔S011〕 |
| **Moat** | 〔未建立〕 | 台灣在地化 + LINE + 學院 + 產業頁 + 自營品牌 dogfooding〔S001〕 | 產品速度 + agency bundle 經濟性 + logo 牆 | **1.5B 真實對話 panel（資料資產）**〔S008〕 | **既有關鍵字資料庫 + 既有付費用戶基數**〔S007〕 | **既有付費用戶基數**〔S011〕 |
| **Weakness** | 見 §5 | 1 網域上限；無 GSC；未加權；無 referral 校準；引擎依方案階梯化 | 無 GSC；prompt volume 僅 1–5 相對分（非絕對量） | 價格門檻高；panel 覆蓋以歐美為主（未列台灣）〔S008〕 | Index 對低搜尋量品牌覆蓋差（官方自承）〔S007〕 | AI 額度相對小（50–200 prompts/day） |
| **Distribution** | 〔無〕 | LINE、學院內容、9 產業 SEO 頁、Google Ads/Meta Pixel、分潤 10–20%〔S001,S002〕 | 內容/比較頁（vs Ahrefs/Profound/Semrush）、G2、Reddit、agency 合作〔S006〕 | 研究報告、活動（zeroclick London/Sydney/Singapore）、partners〔S009 nav〕 | **既有 3,000+ 客戶交叉銷售**〔S007〕 | **既有客戶交叉銷售**〔S011〕 |

### 4.1 GeoCheck 的優勢／劣勢／空白點

**優勢**〔SYN-002｜Based on S001–S015 + CURRENT_STATE〕

1. **方法論嚴謹度**：`unknown ≠ 0`、少於兩個有效 query-run 封頂 69、資料集 SHA-256、query set 凍結＋人工審核、量測層／分析層分離。**在所有已檢視的競品公開文件中，沒有任何一家揭露到這個程度。** 競品的分數定義多為「提及率＋引用率＋SOV」的未加權合成，方法論不可稽核。
2. **不承諾獲客的硬邊界**：在一個所有人都在暗示「AI 提到你＝生意上門」的市場裡，這是可防禦的誠實定位。
3. **可複現性設計**已有 L1，且 L2 已被列為成功條件。

**劣勢**〔SYN-003〕

1. **功能面全面落後**：無持續監測、無競品對比、無情緒、無引文網路、無多引擎、無帳號、無訂閱。
2. **架構與 Hogiah 免費層近乎同構**（見 §5）：GeoCheck 目前的完整產品 ≈ Hogiah 的漏斗入口。
3. **假設的差異化已被實作**：demand weighting（Ahrefs）、intent 分類（Peec/Profound）、GSC 整合（Profound/Semrush）、conversion 連結（Profound/Adobe/GA）皆已在市。
4. **無通路**。競品各自有：既有用戶基數（Ahrefs/Semrush/awoo）、LINE＋學院＋分潤（Hogiah）、內容＋G2（Peec）、研究＋活動（Profound）。

**市場空白點（僅列有證據支撐者）**〔SYN-004〕

| 空白 | 證據 | 強度 |
|---|---|---|
| **台灣的 agency／multi-client 產品**：Hogiah 三個自助方案皆限 1 網域〔S002〕；awoo 未揭露〔S015〕；國際廠商無中文在地化與台幣計價 | S002, S015 | 中（需求端未驗證） |
| **可稽核的量測方法**：無一家競品公開其分數的權重推導、分母定義或 unknown 處理 | S003, S006, S007 全部 | 中（研究價值明確，付費意願未驗證） |
| **繁中／台灣 query 的引擎行為差異**：Profound panel 覆蓋列 US/UK/CA/DE/FR，**未列台灣**〔S008〕；Ahrefs 索引以其關鍵字庫為底 | S007, S008 | 中 |
| **零售面「AI 是否會推薦我」的一次性可信診斷**：Hogiah 用它當漏斗入口而非產品 | S001, S004 | 弱（無付費證據） |

### 4.2 可借鑒 vs 需要避坑

| 可借鑒 | 來源 | 需要避坑 | 來源 |
|---|---|---|---|
| Seat 免費、只按 prompts×models 計價 → 降低 agency 導入摩擦 | Peec〔S006〕 | **把文章生成當成定價階梯主軸**：會直接撞上 Charter §1「不做內容代寫」邊界，且是純成本競賽 | Hogiah〔S002〕 |
| Prompt 依 intent 分類（informational/commercial/transactional）作為**呈現維度**，而非偷偷塞進總分 | Peec〔S006〕 | **在沒有 ground truth 前宣稱 conversion 校準**：Profound 有 GA/Adobe 才敢這樣寫；GeoCheck 沒有客戶站資料 | Profound〔S009〕 |
| Agency bundle：集中帳單 + prompt 額度跨 client 調撥 | Peec〔S006〕 | **多引擎軍備競賽**：6 引擎 × daily 的 API 成本，1–2 人團隊打不起 | Hogiah/Peec/Ahrefs |
| 免費入口 → Email gate → 完整報告的漏斗，並自建 funnel 事件表 | Hogiah〔S004〕 | **1 網域上限**：Hogiah 這條限制正是它的破口，不要複製 | Hogiah〔S002〕 |
| 官方自承索引限制（「brands with little or no search volume 覆蓋有限」） | Ahrefs〔S007〕 | **用「總分」掩蓋方法**：市場已有 5 家在做同一個未加權合成分，再加一個沒有辨識度 | S003, S006, S015 |

---

## 5. 階段三：Hogiah 技術逆向（僅公開頁面與公開 JS bundle）

> 方法：讀取 `hogiah.com` 公開 HTML／JS chunk，未登入、未提交任何表單、未呼叫其後端 API。所有端點皆**自 bundle 原始碼擷取**，非臆測。

### 5.1 前端技術棧〔OBS-003｜S001, S004〕

- **Next.js App Router**：`self.__next_f` RSC flight payload 存在；`__NEXT_DATA__` 不存在（Pages Router 已排除）。
- **Turbopack** 建置：chunk `turbopack-0rlh_e_48woiq.js`。
- **i18n 路由前綴**：`/zh-TW/...`（`useLocale()` 於 bundle 中；`html lang="zh-TW"`）。
- **next/image** 最佳化：`/_next/image?url=...&w=...&q=95`。
- **後端 BaaS**：`https://xhxoklphcjowloxxblia.supabase.co`（**Supabase**）。
- **錯誤監控**：Sentry。
- **行銷 tag**：GTM `GTM-NBJ6W78V`、GA4 `G-138204EC04`、Google Ads `AW-18052134341`、Meta Pixel `2799985437014035`。

### 5.2 公開 API 端點（自 bundle 擷取，未呼叫）〔OBS-004｜S004〕

```
POST /api/v2/free-report/scan       body: { url }
POST /api/v2/free-report/classify   body: { url, scanId, failedLabels[] }
POST /api/v2/free-report            body: { url, email }        → { success, reportId }
GET  /api/v2/free-report/status?id=<reportId>
POST /api/v2/free-report/funnel     body: { step, domain, outcome, reason }  (keepalive)
POST /api/broadcast
POST /api/dev/login                 ← 開發用，未探測
```

### 5.3 核心使用者流程狀態機〔OBS-005｜S004〕

```
idle ──submit(url)──► scanning ──► scanned ──submit(email)──► generating ──► ready
  ▲                      │                                        │            │
  └──── error ───────────┘                                        └── failed ◄─┘
```

實作細節（自原始碼）：

1. `scan`：`AbortController` **75 秒**逾時。回傳 `data.siteChecks[]`，每項含 `{ label, pass, weight }`。
   前端計分：`siteChecks.reduce((a,t)=> a + (t.pass ? (t.weight ?? Math.round(100/len)) : 0), 0)`
   → **推論**〔SYN-005〕：免費 10 項健檢是**加權和**，`weight` 缺省時退回等權。權重由後端決定，前端不可見。
2. `scan` 回傳可含 `existingReport: { id, status }`；若 `status === 'ready'` 直接改抓 `status` 端點顯示。
   → **快取設計與 GeoCheck D-025 的 D1 報告快取同構。**
3. `classify`：**非阻塞**（fire-and-forget），把 `failedLabels`（未通過的檢查項）一起送給後端，回傳結果 merge 進 scan state。
   → **推論**〔SYN-006〕：產業／品牌辨識與建議生成是**條件於哪些檢查沒過**，而非只看網站內容。
4. Email gate：`/api/v2/free-report` 需 `email`（前端以 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` 驗證）。**完整 AI 能見度報告以 Email 為代價。**
5. 輪詢：每 **5 秒** 打 `status`，**300 秒（5 分鐘）**總逾時；逾時文案為「完成後我們會把連結寄到你的 Email」。
6. `funnel` 端點以 `keepalive` 送出自有漏斗事件，已觀測到的 `step` 值：`email_form_viewed`（IntersectionObserver threshold 0.3 觸發）、`scan_completed`、`report_submitted`（含 `outcome: 'error'`, `reason: 'validation'|'network'|'api'`）。
   → **觀察**：除 GA4／GTM 外另建**伺服端漏斗帳本**，錯誤原因分級記錄。這是產品成熟度的訊號。

### 5.4 Prompt 執行機制〔OBS-006｜S004〕

進度文案（bundle 內硬編碼常數，含時間偏移秒數）直接洩漏管線：

```js
// 網站掃描子步驟
["連線並抓取首頁 HTML…", "探索並掃描站內子頁面…",
 "解析結構化資料、標題與內容深度…", "辨識品牌與產業…"]

// 報告生成階段（after = 秒）
[{after:0,  "掃描網站內容…"},
 {after:12, "產生消費者會問 AI 的問題…"},
 {after:30, "詢問 ChatGPT・Perplexity（約 1–2 分鐘）…"},
 {after:110,"彙整能見度與競品排名…"}]
```

**推論**〔SYN-007〕：

- 免費報告只打 **ChatGPT + Perplexity 兩個引擎**（付費才 3／6 個，與 S002 一致）。
- Prompt 來源＝**由網站內容 LLM 生成**（「產生消費者會問 AI 的問題」），**不是** GSC、不是搜尋量資料庫。
- 無任何 region／locale 參數出現在前端請求；地區設定屬後端（S002 稱自助方案為「全台灣」）。
- 端到端約 110–170 秒。

### 5.5 對 GeoCheck 最重要的一條結論

〔SYN-008｜Based on S001, S002, S004 + CURRENT_STATE 2026-09-06〕

| 環節 | GeoCheck 現況 | Hogiah **免費**層 |
|---|---|---|
| 抓站 | HTTP → Chromium → Google Translate 備援 | 首頁 HTML → 子頁探索 |
| 產業／品牌辨識 | DeepSeek | `classify` 端點 |
| 產題 | DeepSeek 產候選 → 選 4 題 | 「產生消費者會問 AI 的問題」 |
| 查詢 | Perplexity ×4 | ChatGPT + Perplexity |
| 站內檢查 | 站內準備度（不進分數） | 10 項加權健檢 |
| 快取 | D1 `audit_reports` | `existingReport` |
| Email gate | 無（lead_submitted 為選填） | **有** |

**GeoCheck 目前的完整產品，在架構上約等於 Hogiah 的免費漏斗入口。**
這不是「落後一點」，是**位階不同**：對 Hogiah 而言這是獲客成本，對 GeoCheck 而言這是全部產出。

---

## 6. 階段四：五個核心問題

### Q1：市場上是否已有 Demand-weighted AI Visibility？

**答：有，且已商品化。**〔TECH-001｜S007〕

Ahrefs Brand Radar 官方 FAQ 逐字：
> 「**Estimated Impressions – potential visibility weighted by the real search volume behind each prompt**」
> 「Because both index types derive from **real search demand, not synthetic guesses**, the visibility metrics reflect what people really ask.」

第二種形態〔TECH-002｜S008〕：Profound 以 **1.5B+ 真實 AI 對話**（double opt-in panel）建立 prompt volume，並提供 `Prioritize by intent volume`。這不是「搜尋需求代理」，而是**AI 需求本身**——比搜尋量更貼近構念。

第三種形態〔TECH-003｜S006〕：Peec 的 `Prompt volume`＝「Relative demand for the topic behind each tracked prompt, **scored 1–5**」——相對分級，非絕對量。

**未加權者**〔OBS-002｜S003〕：Hogiah 的官方術語表把能見度定義為未加權的 citation rate / mention rate / SOV。awoo 五大指標同樣未見加權〔S015〕。

> 【證據不足】現有資料只能支持「demand weighting 已被 Ahrefs、Profound、Peec 三家以不同形式實作並用於行銷」，**不能支持**「客戶因此付更多錢」或「這是購買決策因素」。

### Q2：是否已有「GSC / Search Demand → Prompt Generation → Intent Weighting → AI Visibility」這條完整路徑？

**答：分段都有人做，且有一家把 GSC 明確接上；但這條路徑存在一個 Google 端的硬限制。**

**已實作的分段**：

| 分段 | 誰做了 | 證據 |
|---|---|---|
| Search Demand → Prompt Generation | Ahrefs：keyword DB → PAA + semantic fanout → 462M prompts | S007 逐字 |
| GSC 接入 | **Profound**：「Connect Google Search Console to Profound and **unify traditional and AI Search insights**」 | S009 逐字 |
| GSC 接入 | Semrush：Base Report add-on $10/mo 含 GSC 整合 | S011 |
| Intent Weighting | Peec（informational/commercial/transactional）、Profound（+conversational/generative、sub-intent、prioritize by intent volume） | S006, S008 |
| → AI Visibility | Ahrefs Estimated Impressions | S007 |

**硬限制（本問題最關鍵的一條）**〔TECH-004｜S014，Google 官方部落格 2026-06-03 逐字〕：

Search Console「生成式 AI 成效報表」提供的維度是——
> 「**曝光次數**：網站網址顯示在 Google 搜尋和 Google 探索的生成式 AI 功能中的頻率。**頁面**：查看 AI 功能中顯示的網址。**國家/地區**。**裝置**。**日期**。」

**清單中沒有「查詢」，也沒有「點擊」。** 且該報表「正向部分網站推出」（尚未全面）。

→ **推論**〔SYN-009〕：從 GSC 拿不到「AI 表面的查詢字串」。GSC 能提供的仍是**傳統搜尋查詢**。因此「GSC → Prompt」在實務上等同「用傳統搜尋需求當 AI 提問的代理變數」——而這正是 Ahrefs 已用 462M 規模在做的事，且 Ahrefs 有 GeoCheck 沒有的關鍵字資料庫。

**GeoCheck 若走這條路，會同時面對**：
1. 上游代理變數的效度問題（傳統查詢 ≠ AI 提問，且 Charter §4.2 的構念問題會被放大）；
2. 規模劣勢（單客戶 GSC vs Ahrefs 全庫）；
3. Profound 已把「unify traditional and AI」寫成整合賣點。

**唯一 GeoCheck 相對有利的地方**：Ahrefs 的 Index 用的是**自家關鍵字庫的平均需求**，而 GSC 給的是**這個客戶自己的真實曝光與查詢**。個別網站的長尾 query 分佈是 Ahrefs 庫裡沒有的。但這是**每客戶資料**，不是可累積的資料資產。

> 【資料缺口】「客戶是否願意為 demand-weighted 付更多錢」——無任何來源可支持或否證。

### Q3：是否有競品用 AI Referral / Conversion 校準自己的 Visibility Estimate？

**必須先區分兩件事**（這是本題最容易出錯的地方）：

| | 定義 | 誰做了 |
|---|---|---|
| **A. 並列呈現** | 同時顯示 visibility 與 AI referral／conversion，讓使用者自己看 | Peec（AI referrals + GA 整合）〔S006〕、Ahrefs（AI traffic 免費 + Bot Analytics）〔S007〕、Profound（GA/Adobe：「See exactly how AI visibility drives traffic and **conversions**」）〔S009〕 |
| **B. 真正校準** | 用實際 referral／conversion 去**調整 visibility 的計算本身**（迴歸／權重擬合／模型校準） | **無任何一家公開文件描述此作法。** |

**答：A 已普遍；B 沒有任何公開證據。**

**為什麼沒有 B？**（以下為**假設**，非結論）

| ID | 假設 | 可否從本次證據獲得線索 |
|---|---|---|
| H-C1 | Ground truth 不存在 | **有線索支持**〔S014〕：GSC 的 AI 報表只有曝光、無點擊無查詢。referral 只能靠 GA 的 referrer，且多數 AI 助理回答為 zero-click。 |
| H-C2 | Attribution 太弱 | 有線索：Profound 站上另闢研究「Measuring downstream web browsing after AI brand mentions」，暗示這件事需要專門研究而非產品功能。**該文未讀，禁止引用其結論。** |
| H-C3 | Referral 樣本太小 | 無證據 |
| H-C4 | 技術不可行 | 無證據 |
| H-C5 | 市場不在乎 | **有反向線索**〔S011〕：Semrush Enterprise 明列「Forecasting & **ROI attribution**」，代表大企業端有此需求且願付 enterprise 價。 |

> 【不可推論因果】即使做出 B，仍受 `PROJECT_CHARTER §3.3` 已列的四項限制（資料取得、反向因果、混淆變數、時間方向）約束。橫斷面相關無法支撐「校準」的效度主張。
> **這意味著：B 若做成，它的價值主要是研究貢獻，而非可直接宣稱的產品效果。** 這與 Charter §0 的優先序（研究白皮書優先）**相容**，但與「拿它當 SaaS 賣點」**不相容**。

### Q4：Hogiah 真正的核心優勢是什麼？

**先修正一個可能的誤判**〔GOV-001｜S005〕：

Hogiah 的法人「清程智能科技有限公司」**2026-06-11 才設立**，資本額 NT$300,000，實收資本 0，負責人一人。**截至 2026-09-07 成立約 3 個月。**

→ 這不是一個「幾乎已實現完全體」的成熟對手，而是一個**比 GeoCheck 早跑幾個月、但資源量級相近的創辦人主導專案**。任務指令中「Hogiah ≈ GeoCheck 原始構想的完全體」這個前提，**在公司規模層面不成立**；在**產品完成度與 go-to-market 層面則成立**。

**逐項拆解**：

| 面向 | 評估 | 證據 | GeoCheck 該不該跟 |
|---|---|---|---|
| **Distribution** | **最強的一項。** LINE 官方帳號真人諮詢＋hogiah 學院（課程＋互動教學）＋9 個產業解決方案頁＋Google Ads＋Meta Pixel＋10–20% 經常性分潤 | S001, S002 | **該跟「LINE + 產業內容」，不該跟「全套同時開」。** 1 人做不了五條通路。 |
| **Founder/Team** | 創辦人自述帶過 20 人技術團隊、經營美業品牌 | C1｜S001，**未驗證** | 不可跟（無法複製） |
| **Existing business** | **真正的結構性優勢**：自營 DearDear 品牌作為 dogfooding 場，所有功能先在自家驗證 | S001 | **可跟，且應該跟。** GeoCheck 沒有自營品牌，但有**自己的網站**與白皮書研究資料集。 |
| **Dataset** | 自述近 30 天 2,860 筆 AI 回答（單一自家品牌） | C1｜S001，**未驗證** | **不需跟。** 這是單品牌量，不構成資料護城河。 |
| **Customers** | **完全無證據。** 網站零客戶 logo、零 case study、零客戶數字 | — | 【資料缺口】 |
| **Content/SEO** | 學院、術語表、部落格、更新紀錄、9 產業頁 — 標準的 programmatic SEO/GEO 佈局 | S001, S003 | **該跟，但要換賽道**：不打「GEO 是什麼」這種已飽和的詞。 |
| **Agency channel** | 只有分潤（10–20%），**沒有 agency 產品**（自助方案全部限 1 網域） | S002 | **不該跟——這是它的破口。** |
| **Taiwan localization** | 繁中、台幣、統編、消保條款、退換貨政策、LINE、「全台灣」追蹤 | S002 | **必跟。** 這是對抗 Ahrefs/Semrush/Peec 的唯一結構性屏障。 |
| **Pricing** | NT$1,080 起，等於把價格帶壓到國際競品之下（Peec Starter $80≈NT$2,500） | S002, S006 | **不該跟。** 價格戰對 1 人團隊是自殺。 |
| **Retention mechanism** | 每 2 天自動重跑＋每月文章額度（用不完會浪費）＋知識庫累積 | S002 | 【資料缺口】無實際留存資料 |

**真正難複製的三項**〔SYN-010〕：① 自營品牌作為驗證場；② LINE 真人成交路徑；③ 已鋪好的產業內容資產。
**看似強但其實不是護城河的三項**：引擎數量、文章篇數、prompt 上限——這三項全部是「花錢就有」。

### Q5：對 1–2 人、無融資、無大工程團隊的創辦人，真正有勝率的 Wedge

**先排除**（以本次證據為據，非臆測）：

| 候選 wedge | 排除理由 | 證據 |
|---|---|---|
| 多引擎監測 | 6 引擎 × daily = 純 API 成本競賽 | S002, S006, S007 |
| Demand weighting 本身 | Ahrefs 已用 462M prompts 做且**免費綁進既有付費方案** | S007 |
| GSC → prompt 路徑 | Profound 已宣稱 unify；且 GSC 的 AI 報表無 query 維度 | S009, S014 |
| Conversion 校準當賣點 | Profound/Adobe/GA 已這樣行銷；且 Charter §3.3 四項限制未解 | S009 |
| 內容生成 | 撞 Charter §1 邊界；且是成本競賽 | S002 |
| 更便宜的監測 | Hogiah NT$1,080 已在底部；Otterly $29 更低 | S002, S012 |

**通過篩選的候選**（三項，皆需使用者拍板）：

**W-1｜台灣 agency / 多客戶的 GEO 監測底層**
- 依據：Hogiah 三個自助方案全部限 **1 網域**〔S002〕；awoo 未揭露 agency 能力〔S015〕；Peec 的 agency bundle 無中文與台幣〔S006〕。
- 符合條件：1–2 人可完成（不需自建引擎，可薄層）、API 預算隨客戶數線性、不需 enterprise sales（賣給 agency 老闆，一次成交多客戶）、可累積（agency 的客戶資料形成跨產業基準線）。
- **競品用一個 feature patch 就能消除嗎**：Hogiah 只要把方案改成「可追蹤 N 個網域」就能消除。**這是本 wedge 最大的風險。**
- 但：〔SYN-011〕Hogiah 的定價階梯建在**文章篇數**上，開放多網域會直接稀釋其 Pro（NT$12,800）的價值主張。這給了一個時間窗，但**不是永久屏障**。

**W-2｜可稽核的量測標準 + 公開基準資料集（研究先行）**
- 依據：本次檢視的**所有**競品，公開文件中無一揭露權重推導、分母定義、unknown 處理〔S003, S006, S007, S015〕。GeoCheck 已有 SHA-256、凍結題庫、run ID、`unknown ≠ 0`〔CURRENT_STATE, D-021〕。
- 符合條件：完全 1 人可做、API 預算可控（自選樣本與頻率）、無需 sales、**極度可累積**（每一期基準資料都增值）、競品**無法用 feature patch 消除**（要消除必須公開自己的方法，而公開就會暴露其未加權合成分的任意性）。
- **與 Charter §0 完全對齊**（研究白皮書 > 能力展示 > 商業化），且不需要推翻 D-004/D-007/D-023。
- 弱點：**變現路徑最不明確**。

**W-3｜繁中／台灣 locale 的引擎行為差異研究**
- 依據：Profound panel 覆蓋列 US/UK/CA/DE/FR，**未列台灣**〔S008〕；Ahrefs 索引建於其關鍵字庫〔S007〕；Hogiah 自助方案只有「全台灣」單一粒度，城市級屬 Enterprise〔S002〕。
- 符合條件：小樣本可做、可累積、地理屏障真實。
- 弱點：市場規模上限低。

> 【AUTHOR DECISION REQUIRED】W-1／W-2／W-3 的取捨屬 Human Ownership（商業模式與產品優先級）。三者可組合（W-2 產出方法論 → W-3 產出台灣基準 → W-1 作為變現載體），但**同時做三個 = 一個都做不完**。

---

## 7. 階段五：市場現實判斷

### 7.1 是否存在實際付費市場？

**是。**〔SYN-012｜Based on S002, S006, S007, S010, S011, S012〕

證據等級最高的三條（皆為官方定價頁，非廠商宣傳數字）：
1. **Semrush 把 AI visibility 放進 $139/mo 的基礎 SEO 方案**，並在 Enterprise 列 ROI attribution〔S011〕。Semrush 是上市公司，不會把功能塞進基礎方案除非有需求訊號。
2. **Ahrefs 用 462M prompts 建索引並收 $199/mo**〔S007〕。這個索引的建置成本極高，代表已驗證的商業判斷。
3. **至少 6 家獨立廠商有公開自助結帳的訂閱頁**（Peec、Otterly、Profound、Hogiah、Scrunch、Semrush）。

> 【證據不足】現有資料只能支持「有廠商在收費、且大廠已投入資源」，**不能支持**任何市場規模、成長率、客戶數或營收數字。廠商自述的「3000+ brands」「500+ companies」「Used by 3,000+ companies」屬 C1，依 §5.5 **不得**作為市場規模證據。

### 7.2 市場處於哪個階段？

**建議判讀：Rapid growth 末期，已進入 Commoditization 早期。**〔SYN-013〕

支持 commoditization 的證據（這是本次最一致的訊號）：

| 訊號 | 證據 |
|---|---|
| 核心功能被綁進既有 SEO 套裝的**入門層** | Semrush $139 SEO 方案已含 AI visibility〔S011〕 |
| 主要功能**免費化** | Ahrefs Custom Prompts「Free in every Ahrefs paid plan」；AI traffic、Bot Analytics 免費〔S007〕 |
| 功能集高度趨同 | Hogiah／Peec／Profound／Scrunch 皆有：mention、citation、SOV、sentiment、competitor、recommendation、bot analytics |
| 價格帶已分層且底部下探 | Otterly $29 → Hogiah NT$1,080 → Peec $80 → Profound $99 → Semrush 內含 |
| 廠商開始比較頁互打 | Peec 站上有 vs Ahrefs / vs Profound / vs Semrush〔S006〕 |
| **差異化轉向資料資產** | Profound 1.5B panel、Ahrefs 462M index〔S007, S008〕——功能已不足以差異化 |

尚未 consolidation：無併購證據（【資料缺口】，未查）。

### 7.3 最主要 Buyer 是誰？預算從哪來？

**有證據的部分**〔SYN-014〕：Ahrefs 與 Semrush 把 AI visibility 綁進既有 SEO 訂閱，代表**這筆預算的主要來源是既有 SEO 工具預算**——不是新增預算。這對新進者是壞消息：買家不需要新增一筆採購就能拿到基本功能。

**Peec 的方案描述**〔S006〕逐字指向 buyer：Starter「For SEO and content managers」、Pro「For SEO teams」、Advanced「For marketing teams managing multiple projects」。

> 【資料缺口】台灣市場的 buyer 與預算來源：**零證據**。Hogiah 無客戶 logo、無 case study、無數字。awoo 未揭露。
> **這一項直接關係到 §2 的 C1 衝突**（賣給中小企業主 vs 賣給 SEO 專業人士），而目前**兩邊都沒有第一手證據**。

### 7.4 Monitoring 的實際使用頻率與 Retention 意涵

【資料缺口】無任何競品公開留存或使用頻率資料。

僅能觀察**廠商如何設計以對抗低使用頻率**〔OBS-007〕：

| 機制 | 誰用 |
|---|---|
| 每日／每 2 天自動重跑（不需使用者登入即有新資料） | 全部 |
| 每月會過期的文章生成額度（用進廢退） | Hogiah〔S002〕 |
| 週報／自動報表推送 | Hogiah、Peec〔S002, S006〕 |
| Bot／crawler 即時 feed（產生「隨時可看」的理由） | Peec、Profound、Scrunch、Ahrefs |
| 知識庫／context 累積（切換成本） | Hogiah、Peec、Profound |

→ **推論**〔SYN-015〕：五家獨立廠商同時投入這類機制，**間接顯示**「使用者不會主動天天登入」是這個品類的共同問題。**但這是從產品設計反推，不是留存資料，不得寫成事實。**

---

## 8. 建議與待決事項

### 8.1 【建議】Continue / Modify / Pivot / Stop

> 依 `RESEARCH_STANDARD §4.2`，「研究結果的最終詮釋」與商業模式屬作者決定。以下為**建議**，非決策。

**建議：Modify。**

不是 Continue：任務指令描述的差異化（demand weighting、GSC 路徑、conversion 校準）**三項全部已被實作或已被行銷**〔S006, S007, S008, S009〕，按原構想直行會撞牆。
不是 Pivot：GeoCheck 已建立的方法論資產（`unknown ≠ 0`、凍結題庫、SHA-256、量測／分析層分離）在此市場**確實稀缺**，丟掉可惜。
不是 Stop：Charter §0 的第一優先是研究白皮書與能力展示，這個目標**不受競爭格局影響**，且本次證據反而強化了它的價值。

**Modify 的具體內容（建議）**：把「Reality-Calibrated AI Visibility 作為 SaaS 賣點」降級為「**作為白皮書的研究問題**」，並把產品層的賭注改押在 §6 的 W-1 或 W-3（台灣 / agency 的結構性屏障），而非押在演算法差異化上。

**最關鍵的三條證據**：

1. **【TECH-001｜S007】** Ahrefs 官方頁逐字：「Estimated Impressions – potential visibility weighted by the real search volume behind each prompt」，且 Custom Prompts「Free in every Ahrefs paid plan」。→ demand weighting 不但已存在，還已免費。
2. **【TECH-004｜S014】** Google 官方（2026-06-03）：GSC 生成式 AI 成效報表維度僅有 曝光次數／頁面／國家／裝置／日期，**無查詢、無點擊**。→ 「GSC → Prompt」拿不到 AI 端的 query。
3. **【GOV-001｜S005】** 清程智能科技有限公司設立日 `1150611`（2026-06-11），資本額 NT$300,000。→ Hogiah 是 3 個月大的小公司，其領先是**執行速度與通路**，不是資源。這既是壞消息（同量級的人做得比你快）也是好消息（差距可追）。

### 8.2 【建議】接下來 3 個實驗

| # | 實驗 | 為什麼是它 | 成本 | 成功／失敗判準（需使用者定義） |
|---|---|---|---|---|
| **E-1** | **買 1 個月 Hogiah Growth（NT$3,280），完整走過付費流程**，記錄其分數定義、分母、unknown 處理、報告結構 | 目前對 Hogiah 付費層的一切都是從免費頁與 bundle 推論。這是唯一能把 SYN-005~008 從推論升級為 OBS 的方法，且直接餵養白皮書的「現有工具方法論稽核」章節 | NT$3,280 + 時間 | 【AUTHOR DECISION REQUIRED】 |
| **E-2** | **對 5–10 位台灣 SEO/GEO consultant 或 agency 做第一手訪談**，只問兩件事：(a) 現在用什麼工具、付多少錢；(b) 客戶問「AI 有沒有推薦我」時，他們現在怎麼回答 | 這是 §7.3 的資料缺口，也是 §2 的 C1 衝突（ICP 到底是誰）唯一的解法。Charter §3.4 已列「無任何第一手使用者訪談紀錄」為待補 | 時間 | 【AUTHOR DECISION REQUIRED】 |
| **E-3** | **用現有管線做 H-006 的重算實驗**（GEO 排名對權重選擇的敏感度，Charter §4.3 標為「驗證成本極低」） | 若排名對權重高度敏感，則**所有**競品的未加權合成分都不可靠——這一條同時是研究發現與產品定位的基礎，且**不需新增任何付費 API 呼叫** | 近乎為零 | 【AUTHOR DECISION REQUIRED】 |

> E-3 應**優先**：零成本、Charter 已列為待驗證假設、且其結果會決定 W-2 是否成立。

### 8.3 【建議】未來 6 個月「絕對不要做」清單

| 不要做 | 理由（附證據） |
|---|---|
| 追加 AI 引擎數（Gemini / Claude / Grok / Copilot） | 純成本競賽。Hogiah Pro 6 引擎 NT$12,800、Ahrefs 全模型 $699/mo〔S002, S007〕。1 人團隊贏不了 |
| 內容自動生成 / 全文代寫 | 撞 `PROJECT_CHARTER §1` 邊界（D-007 Confirmed）；且是 Hogiah 的定價主軸，正面對撞 |
| 自建 prompt volume 資料庫 | Profound 有 1.5B 真實對話 panel〔S008〕、Ahrefs 有 462M index〔S007〕。這是資本密集題 |
| 宣稱 conversion / ROI 校準 | Charter §3.3 四項限制未解；且 Semrush Enterprise 已佔「ROI attribution」位〔S011〕。在無 ground truth 下宣稱＝違反 `RESEARCH_STANDARD §1.1` |
| 打價格戰 | 底部已是 Otterly $29〔S012〕、Hogiah NT$1,080〔S002〕 |
| 蓋通用儀表板（sentiment / SOV / 競品矩陣全套） | 六家全都有，做出來是入場券不是差異化 |
| Enterprise 功能（SSO / SOC 2 / API / role-based） | 需要 sales 與合規投入，Peec/Profound 已有 SOC 2〔S006, S010〕 |
| 為了符合 Contract 範本重命名 `mock-api/` → `src/` | `.claude/rules/coding.md` 明文禁止 |
| 在 `DECISION_LOG.md` 補記本檔任何結論 | 本檔是情報，不是決策。未經使用者拍板不得升格 |

### 8.4 如果我是競爭對手，如何在 6 個月內殺死 GeoCheck

> 以下為**對抗性情境推演（Opinion / Scenario）**，依 `RESEARCH_STANDARD §6` 不得作為結論依據。目的是壓力測試，不是預測。

假設我是 Hogiah（或 awoo），資源相近，我會這樣做：

1. **第 0–1 月：把「免費健檢」做得比 GeoCheck 好，然後免費送。**
   GeoCheck 唯一的公開產品就是一次性檢測。我把免費層加上「AI 怎麼描述你」的一句話摘要 + 競品排名預覽（Hogiah 首頁已宣稱「註冊流程中就能看到品牌掃描結果與競品排名預覽」〔S001〕），GeoCheck 的入口就沒有存在理由。**這一步 Hogiah 已經做完了。**
2. **第 1–2 月：拆掉 1 網域上限。**
   把 Growth 改成「可追蹤 3 個網域」，Pro 改成「10 個」。成本增加有限（prompt 額度不變、只是分配），但直接消滅 W-1 的整個立論。
3. **第 2–3 月：搶占「方法論透明」這個位置。**
   發一份公開的計分方法白皮書：權重、分母、unknown 處理全部揭露。這一步成本極低（寫文件而已），但會把 GeoCheck 唯一的真實優勢（可稽核性）變成商品。**GeoCheck 的護城河是一份還沒發表的文件——這是最脆弱的一種護城河。**
4. **第 3–4 月：用學院內容吃光繁中 GEO 的長尾詞。**
   hogiah 學院 + 術語表 + 9 產業頁已在跑〔S001, S003〕。GeoCheck 若要靠內容獲客，這條路 6 個月後就滿了。
5. **第 4–6 月：綁 agency 分潤 + LINE 群。**
   10–20% 經常性分潤〔S002〕讓台灣的 SEO 顧問變成銷售通路。顧問一旦推薦了 Hogiah 給客戶，就不會再評估第二個工具。

**這個推演揭示的真正風險**〔SYN-016〕：GeoCheck 目前唯一難以複製的資產（研究方法論的嚴謹度）**尚未公開發表**。未發表的護城河不是護城河。
→ 這反過來支持一件事：**盡快把白皮書做出來並公開，本身就是競爭行為**，而不只是學術行為。這與 Charter §0 的優先序一致。

---

## 9. 證據對照（RESEARCH_STANDARD §16）

| 段落 | 主張編號 |
|---|---|
| §3.1 Hogiah 法人資料 | GOV-001｜S005 |
| §3.1 廣告 tag 觀測 | OBS-001｜S001 |
| §3.1 能見度未加權定義 | OBS-002｜S003 |
| §4 對比矩陣 | 各格已標來源 |
| §4.1 優劣勢 | SYN-002, SYN-003, SYN-004 |
| §5.1–5.2 技術棧與端點 | OBS-003, OBS-004｜S001, S004 |
| §5.3–5.4 流程與管線 | OBS-005, OBS-006, SYN-005~007｜S004 |
| §5.5 架構同構結論 | SYN-008 |
| §6 Q1 | TECH-001, TECH-002, TECH-003｜S007, S008, S006 |
| §6 Q2 | TECH-004｜S014；SYN-009 |
| §6 Q3 | H-C1~H-C5（**全部待驗證**） |
| §6 Q4 | GOV-001, SYN-010 |
| §6 Q5 | SYN-011 |
| §7 | SYN-012~SYN-015 |
| §8.4 | **Opinion / Scenario — 不得作為結論依據** |

---

## 10. 研究限制與利益關係

- **利益關係聲明**：本檔由 GeoCheck 專案內部產生，研究對象為其直接競爭者。所有對 GeoCheck 有利的判讀均已標示為推論或建議，不利證據（§5.5、§6 Q1–Q3、§8.4）已完整保留未刪減。
- **時點限制**：所有頁面觀測時間為 2026-09-07。SaaS 定價與功能頁變動頻繁，超過 30 天後須重新查證。
- **方法限制**：
  - 未登入任何競品帳號，付費層功能全部為**從公開頁面推論**，非實測。
  - 未呼叫 Hogiah 任何後端 API；端點結構為靜態原始碼分析。
  - GeoGen、AEO Mantis、Similarweb、全部 Substitute 類別**未研究**。
  - 無任何競品的營收、客戶、留存資料。
- **不得外推**：本檔結論僅適用於已列出的 8 家競品，不代表整體市場。
