# GeoCheck 全主流 AI（GEO Visibility）開發者服務化與 API 剝離技術企劃書
**Technical Brief & RFC for Next-Gen Architecture Planning**

- **版本**：v1.0 (Draft for Architecture Planning)
- **日期**：2026-09-08
- **目標讀者**：架構規劃模型（如 GPT Astra）、專案創辦人
- **對齊基準**：
  - `docs/PROJECT_CHARTER.md` (專案憲章)
  - `docs/DECISION_LOG.md` (決策紀錄，特別是 D-004、D-012、D-021、D-024)
  - `GeoCheck_Business_Investment_Proposal_2026-09.md` (2026-09 創業企劃書)

---

## 1. 專案背景與現況診斷

### 1.1 現有系統架構
* **核心定位**：AI 搜尋能見度與信任度（AI Trust Index v1）觀測工具，目前專門量測品牌在生成式答案引擎中的「答案採用率 (65%)」與「已驗證官方 URL 引用率 (35%)」（參見決策 `D-021`）。
* **現有後端實作**：位於 `mock-api/`，主要由單一龐大的 `server.js`（約 62KB）承載。它同時處理了 HTTP 路由、靜態前端交付、爬蟲調度、DeepSeek 題型規劃、Perplexity Sonar 查詢、分數合成與 Cloudflare D1 持久快取。
* **痛點**：
  1. **工程肥大**：`server.js` 嚴重耦合，亟需拆解瘦身。
  2. **單一引擎侷限**：目前實際搜尋觀測僅高度綁定 Perplexity Sonar，缺乏對主流對話模型（ChatGPT、Claude、Gemini）的全面監測能力。

### 1.2 商業策略轉折（Pivot）
* **TA 升級**：從原本的中小企業主（餐飲商家），正式轉型為 **「SEO 服務商、內容顧問與網站開發工作室」**。
* **價值主張**：協助開發者與顧問在交付或維護網站時，能以可重複運行的監控腳本或 API，持續掌握多個客戶網站在各大 AI 引擎中的曝光與引用變化。
* **本階段目標**：在不盲目做過度工程化（暫不發布 npm SDK、暫不做複雜 Developer Console 前端）的前提下，**將後端核心能力剝離為獨立的 Headless API Service**，既能供現有 Web 前端無縫改接（Dogfooding），也能對外提供定時監控 API。

---

## 2. 供應商與技術可行性驗證（Verified Facts）

經過實測與官方文檔查證，確認各主流 AI 的聯網搜尋與整合路徑如下：

### 2.1 OpenRouter：全主流模型聯網的統一入口
* **實作機制**：OpenRouter 已全面升級為 Server-side Tool 架構。只要在 API 請求中的 `tools` 陣列傳入 `{"type": "openrouter:web_search"}`，即可讓支援 Tool Calling 的任何模型自動具備聯網搜尋能力（相容 OpenAI Chat Completions 規範）。
* **計費規則**：
  * 搜尋費用：**$4.00 USD / 1,000 次網頁搜尋**（即每次搜尋 $0.004 USD）。
  * 模型費用：外加各模型標準 Input/Output Tokens 費用。
  * 平台手續費：儲值加收 5.5% 手續費。
* **最大優勢**：後端僅需實作一套 OpenAI 相容的 Adapter，即可同時驅動 **Claude 3.5 Sonnet、GPT-4o / GPT-5、Gemini** 的聯網檢測，省去維護多個官方 SDK 的巨大成本。

### 2.2 官方原生 API 現況對比
| 供應商 | 聯網搜尋支援度 | 計費方案 | 備註 |
|---|---|---|---|
| **Google Gemini** | 支援（Google Search Grounding） | **每月前 5,000 次查詢免費**；超額 $14 / 1K 次 | 成本極低，適合做為免費層備援。 |
| **OpenAI** | 支援（Web Search Tool） | $10.00 / 1K 次調用 + Token 費用 | 官方已支援原生檢索。 |
| **Perplexity** | 原生即搜尋引擎（Sonar） | 約 $5.00 / 1K 次調用 + Token 費用 | 專為 GEO 設計，自帶乾淨結構化 URL 引用。 |
| **Anthropic Claude** | **官方無原生聯網** | 需自行掛載搜尋工具（如 Brave / Tavily） | **走 OpenRouter 是目前讓 Claude 聯網的最優解**。 |

---

## 3. 單位經濟模型與收支平衡（Unit Economics）

### 3.1 單次全主流 AI 檢測成本精算
設定一次標準檢測包含 **4 個非品牌 Discovery 題目**，同時向 4 大主流引擎（Perplexity + GPT + Claude + Gemini）發問：
* **總查詢次數**：$4 \text{ 題} \times 4 \text{ 模型} = 16 \text{ 次呼叫}$。
* **搜尋成本**：$16 \times \$0.004 = \$0.064$ USD。
* **推論 Token 成本**：約 $\$0.06 - \$0.09$ USD。
* **單次全引擎檢測總硬成本**：**約 $\$0.12 - \$0.15$ USD（約 NT$ 4 ~ 5 元）**。

### 3.2 開發者定時監控成本
* 單站每月每週監測 1 次（共 4 輪）：API 硬成本約 **$\$0.50 - \$0.60$ USD（約 NT$ 16 ~ 20 元）**。
* 商業定價空間：若以每專案每月 NT$ 99 ~ 199 訂閱，毛利率可穩定維持在 **75% ~ 85%**。

---

## 4. 防刷爆與成本安全閥體系（Abuse & Cost Safeguards）

為徹底避免「外部開發者或惡意腳本不斷打 API 導致信用卡帳單被刷爆」，新服務必須內建**四道不可繞過的安全防線**：

```
[外部 API 請求 / Web 請求]
       │
       ▼
【第 1 道：D1 快取層】 ──(命中相同網址+題組)──> [直接回傳既有報告 (成本: $0)]
       │ (未命中)
       ▼
【第 2 道：全域每日成本熔斷】 ──(當日累計超過預設上限，如 $10)──> [HTTP 503 Circuit Breaker]
       │ (未達上限)
       ▼
【第 3 道：IP / API Key 限流】 ──(超過每分鐘/每小時頻率)──> [HTTP 429 Too Many Requests]
       │ (頻率正常)
       ▼
【第 4 道：預扣點數機制 (Quota)】 ──(點數不足 / 未付費)──> [HTTP 402 Payment Required]
       │ (點數扣除成功)
       ▼
[呼叫 OpenRouter / Perplexity 執行實時檢測]
```

### 具體分級規則：
1. **免費入口（Public Web Snapshot）**：
   * **嚴格限制**：**只允許單一輕量引擎**（如 Perplexity 或 Gemini 免費額度），**絕對禁止在免登入情況下觸發全主流 AI**。
   * 防護：以 IP 限流（每 IP 每日最多 2 次全新量測）配合 7 天 D1 快取，單次成本鎖定在 NT$ 0.5 元以內。
2. **開發者付費 API（Developer Monitoring API）**：
   * 需帶 `Authorization: Bearer <GEO_API_KEY>`。
   * 支援全主流 AI 檢測（Perplexity + GPT + Claude + Gemini）。
   * 採預付扣點制（Credit-based），每次全引擎檢測扣 1 Credit，餘額不足立即拒絕。

---

## 5. 目標架構推薦：Headless API Service

拒絕過度工程化，採用乾淨的分層服務架構：

```text
geocheck/
├─ apps/
│  └─ web/                      # 現有 GeoCheck 前端 (純靜態/HTML，打後端 API)
│
├─ services/
│  └─ api/                      # 獨立的後端服務 (Headless API)
│     ├─ src/
│     │  ├─ core/               # 純邏輯核心 (無 HTTP 依賴，易於單元測試)
│     │  │  ├─ crawler/         # 網站抓取 (HTTP / Playwright / Fallback)
│     │  │  ├─ analyzer/        # 網站內容、Schema、技術特徵分析
│     │  │  ├─ planner/         # 題型規劃器 (DeepSeek 候選題產生)
│     │  │  ├─ scoring/         # AI Trust Index v1 計分引擎 (D-021)
│     │  │  └─ extractor/       # ★ 統一 Citation 引用網址萃取器
│     │  │
│     │  ├─ providers/          # AI 適配器 (Adapter Pattern)
│     │  │  ├─ perplexity.js    # Perplexity Sonar 適配
│     │  │  ├─ openrouter.js    # ★ OpenRouter 統一適配器 (GPT, Claude, Gemini)
│     │  │  └─ deepseek.js      # DeepSeek 題型與結構化解析
│     │  │
│     │  ├─ guards/             # ★ 成本與安全守門員
│     │  │  ├─ rate-limiter.js  # IP / Key 限流
│     │  │  ├─ cost-circuit.js  # 每日累計成本熔斷開關
│     │  │  └─ quota-manager.js # 點數餘額扣除與記錄
│     │  │
│     │  ├─ storage/            # 持久化層 (Cloudflare D1 / SQLite)
│     │  │  ├─ db.js            # D1 連線與 Query 封裝
│     │  │  ├─ reports.js       # 報告快取表 (audit_reports)
│     │  │  ├─ projects.js      # (企劃書 0-6 週) 專案與歷史 Run
│     │  │  └─ accounts.js      # API Key、用量日誌與 Credits
│     │  │
│     │  └─ routes/             # 傳輸層 HTTP API 路由
│     │     ├─ v1-public.js     # 免費 Snapshot (單引擎、快取優先)
│     │     ├─ v1-audit.js      # 開發者全引擎檢測 (含 Key 與 Quota 驗證)
│     │     ├─ v1-projects.js   # 專案管理、定時觀測歷史
│     │     └─ v1-health.js     # 健康檢查與各 Provider 連線狀態
│     │
│     ├─ server.js              # 極簡服務入口 (~100 行，僅負責掛載中介軟體與路由)
│     ├─ package.json
│     └─ wrangler.jsonc         # Cloudflare D1 綁定與環境設定
│
└─ docs/
   ├─ MULTI_ENGINE_API_SERVICE_BRIEF.md  # 本文件
   ├─ PROJECT_CHARTER.md
   └─ DECISION_LOG.md
```

---

## 6. 核心工程挑戰（待 GPT Astra 深化設計的題目）

當你引導下一代模型（如 GPT Astra）進行詳細規劃時，應著重要求其解答以下 4 個核心技術難題：

1. **多模型 Citation 結構化萃取（Citation Normalization）**：
   * *問題*：Perplexity 回傳的是標準 `citations: string[]`，但 OpenRouter 調用 GPT 或 Claude 時，引用網址可能散落在 Markdown 文本、腳註 `[1]` 或 Tool Call 內容中。
   * *需求*：如何設計一個高容錯的 `CitationExtractor`，將不同模型的輸出統一標準化為 `[{ url, domain, isOfficialDomain, anchorText }]`，以利 `AI Trust Index v1` 計算。
2. **非同步長輪詢 vs 串流設計（Async / Job Polling）**：
   * *問題*：同時打 4 題 × 4 個模型（共 16 次聯網查詢），總耗時可能長達 15 ~ 30 秒，直接使用同步 HTTP Request 容易造成 Client Timeout 或 Cloudflare 524 逾時。
   * *需求*：設計適合開發者腳本與 Web 前端的非同步任務架構（如 `POST /v1/audit` 回傳 `job_id`，Client 輪詢 `GET /v1/jobs/:id`，或使用 SSE / Webhook）。
3. **並發計費事務安全性（Credit Transaction Concurrency）**：
   * *問題*：在無伺服器（Serverless / D1）環境下，如何確保多個並發 API 請求不會造成點數超額使用（Race Condition）？
   * *需求*：設計簡潔且可靠的預扣（Pre-authorization）與結算機制。
4. **開發者定時監控腳本（Monitoring Daemon）形式**：
   * *需求*：提供一隻輕量、乾淨的 Node.js / Python 監控範例腳本（例如可放進 GitHub Actions 或 Cloudflare Worker Cron），讓開發者能以最小代價自動每週監控指定網站。

---

## 7. 交付與驗收準則（Definition of Done）

1. **功能相容性**：現有 GeoCheck 免費檢測與信義區白皮書研究腳本，改接新 API 後所有結果與自動化測試（`npm test`）維持 100% 通過。
2. **成本不可破防**：即便模擬遭腳本連續發起 10,000 次請求，全域成本熔斷開關與限流機制能精準於指定門檻阻斷所有非快取付費呼叫。
3. **OpenRouter 多模型聯網閉環**：成功對單一測試網址發起全主流 AI 查詢，並正確萃取出 GPT、Claude、Gemini 與 Perplexity 的答案提及狀態與官方引用證據。
