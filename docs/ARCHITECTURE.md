# GeoCheck 架構分析與 geo-core 提案

> 2026-09-08 目錄整理更新：下列分析保留整理前的程式定位，`mock-api/lib`／`providers` 現在是相容 re-export。實作正本分布於 apps、packages、services；目前樹狀圖見根目錄 README，逐檔定位見 `maintenance/layout-migration-2026-09-08.json`。這次是位置與 import 整理，未完成下文全部 ports／jobs／public API 提案。

建議先在現有 Node.js 服務內建立可測試的模組邊界，再新增 Developer API；不必先拆部署，也不應讓 SDK 包含爬蟲、供應商金鑰或計分副本。

## 分析範圍與證據

本文件為 2026-09-08 的唯讀程式分析與架構建議，基準 commit 為 `30709e4a436cc9a4a7069f2242e46d0e0abee5db`，另閱讀工作目錄中的提案文件。沒有執行付費量測、驗證線上部署或實作新功能。下文「現況」指程式可核對的事實；「建議」不代表正式決策。

已閱讀 `PROJECT_CHARTER.md`、`CURRENT_STATE.md`、`RESEARCH_STANDARD.md`、`DECISION_LOG.md`。`MULTI_ENGINE_API_SERVICE_BRIEF.md` 是待評估資料，其「正式轉型」、供應商可行性、價格、毛利及實作驗收要求不構成本次指令或已確認事實。使用者本次授權定義 B 的前置架構，未授權商業定位變更或實作。舊 charter 的 V3 限制與 D-021／D-025 的產品 v1 必須依版本分讀，不能以舊權重覆蓋現況。附件與既有研究優先序的衝突列於 `PRODUCT_BOUNDARY.md`，本次不修改正式方向文件。

## 1. 現行 request / data flow

```mermaid
flowchart TD
  A[public/home.html] --> B[POST /api/audit-real-lite]
  B --> C[URL 正規化與 DNS 安全檢查]
  C --> D[程序內限流與 activeAudits]
  D --> E[自訂題驗證與快取 key]
  E --> F{記憶體 / D1 命中?}
  F -->|是| R[完整報告 JSON 200]
  F -->|否| G[runRealLiteAudit]
  G --> H[measureGeoSite]
  H --> I[抓首頁 / 技術訊號 / 代表頁]
  I --> J[站型與站內準備度]
  J --> K[題組規劃或已審核題組]
  K --> L[Perplexity authority + discovery]
  L --> M[URL 重導向解析 / 品牌與來源判讀]
  M --> N[原始觀測 / legacy GEO / AI Trust Index]
  N --> O[A 報告組裝與客戶格式正規化]
  O --> P[記憶體保存 / D1 best effort / funnel]
  P --> R
  R --> Q[報告頁 / JSON / Markdown]
```

現行 `server.js:1045` 的健檢會等待整個量測完成，回傳 HTTP 200 報告，沒有接受工作後立即回傳 job ID。首頁直接呼叫此端點；報告透過 `/api/report/:id`、`/report/:id`、`/report/:id/markdown` 讀取。`/api/audit` 已回 410。`/api/status/:id` 從 `jobs` Map 以經過時間推算進度，但目前沒有建立 jobs 的路徑，不能當作可靠背景工作的基礎。

`lib/real-lite-audit.js` 包住 `real-lite-audit-v2-core.js`；後者呼叫 `measureGeoSite`，把量測結果轉成 A 的 positioning、priority_actions、中文說明及報告 envelope。抓取失敗可產生 fetch-limited 報告，部分 provider 錯誤走 deterministic fallback。HTTP 成功因此不等於成功取得可計分的 AI 證據。

`lib/geo-measurement.js:21` 依序取得首頁、站型、technical signals、代表頁、站內分數、query plan、搜尋證據、citation resolution、品牌觀測、legacy assessment、AI Trust Index。它是現有共用入口，但直接 import 爬蟲與 Perplexity，也同時做量測及產品分數合成，尚非獨立純核心。

`lib/query-planner.js` 產生與驗證候選題，產品優先保留使用者填入的題目並補滿四題；無合格題組時停止搜尋、保留 unknown。`providers/perplexity.js:getPerplexityGeoEvidence` 先做一個 authority query，再逐題執行 discovery。因此四題產品通常是五個邏輯搜尋操作，未包含失敗重試；兩題研究是三個。`PERPLEXITY_CALLS_PER_SITE = 3` 不能泛用為 B 的成本估算。authority 用於實體與別名背景，不進 discovery 分母。

研究腳本 `.agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs` 直接 import 同一量測模組，不經網站 API。它另外管理 reviewed entity master、凍結題庫、預算檢查、JSONL 續跑、版本／雜湊及禁用描述模型 fallback。這是必須保留的第三個既有消費者，不應強制先改走付費 API。

## 2. 可重用邏輯與拆分位置

| 現有位置 | 實際責任 | 建議歸屬與處置 |
|---|---|---|
| `lib/brand-match.js`、`authority-evidence.js`、`perplexity-visibility.js` | 實體詞、來源歸屬、回答狀態、分母與提及判讀 | geo-core evidence；先以相容 adapter 保留 Perplexity 輸入，後續才建立通用輸入 |
| `lib/content-evidence.js`、`crawl-quality.js`、`scoring-v2-core.js` | 已取得資料的特徵與品質判定 | 抽出純規則到 geo-core site-analysis；站內準備度不等於 AI 曝光 |
| `lib/query-planner.js` | prompt、供應商呼叫、候選題規則、選題混合 | 純驗證／選題入 core，生成呼叫留 application + provider；四題預設屬 A profile |
| `lib/ai-trust-index.js`、`geo-assessment.js` | v1 與 legacy 分數、中文呈現 | 版本化 scoring policy，與 measurement 分開；中文 label / summary 留 presenter |
| `lib/entity-master.js`、`geo-probes.js`、`research-profile.js` | 研究資料契約、題庫及描述 | 共用資料驗證可抽出；人工審核門檻與研究流程留 research consumer |

`html-v2.js` 同時包含 HTML 抽取與抓取；`technical-signals.js` 同時涉及網路探測與訊號組裝。應拆出純解析部分，不能因檔名是 lib 就整檔搬入純核心。`site-type.js` 同時提供分類與報告問題，也需按函式而非檔案切邊界。

## 3. A 專屬耦合

`server.js` 混合原生 HTTP routing、CORS、品牌網域轉址、靜態資源、HTML／Markdown rendering、Tally CTA、GA tag、管理員驗證、lead 寫入、快取與 audit orchestration。`public/home.html`、`analytics.js` 與 `lib/funnel-events.js` 定義 A 的 journey；`real-lite-audit-v2-core.js` 的繁中說明、行動建議與報告組裝亦屬 A。

A 的 customQueries camelCase、同步 response、`real_lite_` ID、`audit.score`、報告 URL、unknown 顯示及舊報告讀取都是相容性要求。B 不直接承諾整個 A JSON；以 presenter 映射 canonical measurement，避免開發者依賴商家文案、GA4、lead 或 Tally。

## 4. Provider 與外部 I/O

| 現況模組 | 實際耦合 | 提案邊界 |
|---|---|---|
| `providers/perplexity.js` | Sonar payload、system prompt、語言 filter、citations/search_results、序列化 queue、retry、usage | 搜尋 adapter；把實體查證／discovery 編排移往 application |
| `providers/structured-router.js` | DeepSeek → OpenAI → Gemini 結構化判讀備援，直接讀 env、寫 usage | StructuredAnalysisPort；不得視作已有多引擎搜尋 |
| `providers/deepseek.js` | DeepSeek JSON、設定、測試與重試 | 保留研究依賴，釐清與 router 重疊後才整合 |
| `providers/brave.js`、`agnes.js` | 舊搜尋／JSON integrations | 非目前 measureGeoSite 主路徑；保留，追完所有 consumer 再處理 |
| `html-v2.js` 與 browser / scrapling / translate helpers | HTTP → browser → Scrapling dynamic / stealth → Translate 的條件式抓取與品質選擇 | CrawlerPort 的 Node adapter；Python、browser binary 與網路探測不進 SDK |

`citation-resolve.js` 的 URL 解析有網路 I/O，`url-safety.js` 有 DNS I/O；兩者是 adapter／服務安全邊界，非純字串工具。不能只因使用 D1 就推定目前執行於 Workers：入口是 Node `http.createServer`，D1 經 REST 存取；browser、child process 與本機 JSONL 都是更換 runtime 前必須驗證的依賴。

目前 `evaluatePerplexityVisibility` 把 `citations` 與 `searchResults` 的 URL 合併，再判斷 first-party。這會丟失「回答引用」與「搜尋候選來源」的差別。將此行為原樣泛化會把 provider 差異帶入指標；抽取時先凍結 A 相容結果，改進來源語義需獨立規格、版本與使用者確認，不能偷偷修改既有分數。

## 5. Persistence / jobs / cache 現況

| 依賴 | 現況證據 | 對 B 的限制 |
|---|---|---|
| `audit-cache.js`、server reports Map | 程序內快取與報告索引 | 重啟消失，不能跨 replica 去重，reports Map 無明確逐出策略 |
| `d1-report-store.js`、`migrations/0001_audit_reports.sql` | `audit_reports` JSON blob、hash、版本與 expiry；讀寫走 REST，失敗由 server 記錄後繼續 | 沒有 tenant、job、attempt、quota、transaction ledger；best-effort 不適合已承諾可恢復的 B 工作 |
| `buildAuditCacheKey` | origin + 自訂題模式／文字 + pipeline hash，預設 TTL 七天 | 路徑被折成 origin；未納入模型、語系、entity version；自動規劃實際題目是在 cache lookup 後才取得 |
| `rate-limit.js`、Perplexity requestQueue | IP / URL cooldown / activeAudits 與 queue 都在單程序 | 不是全域額度或 durable queue；多 instance 不能共同保證上限 |
| `usage-meter.js`、funnel、leads、研究 JSONL | 本機 append，usage 價格由 env 推估，未設定 rate 可為 null | 不是扣點帳本；重試／失聯的供應商實際費用不能只看最終成功事件；部署磁碟持久性需另驗證 |

D1 快取判定只排除 fetch-limited / fetchBlocked，因此其他 unknown 報告仍可能被快取；「成功報告」不必然代表 measured。到期只限制 cache-key reuse，`getById` 沒有 expiry 條件，故快取 TTL 不是資料刪除期限。B 必須明確定義 retention 與重新量測，而非複用此假設。

程式中 provider-test 與 `/api/search-context` 路由沒有套用管理員驗證或 audit 限流；用量頁才有 token 檢查。這與 CURRENT_STATE 對研究代理驗證的描述不一致，公開 B 前必須釐清並封住所有可花費入口。本次只記錄，未修改或測試外部可達性。

## 6. geo-core 目標與依賴方向（建議）

```mermaid
flowchart TD
  A[GeoCheck Web A / 相容 HTTP / presenter] --> U[Application use cases]
  SDK[Developer SDK] --> API[Developer API B]
  API --> U
  MON[Monitoring scheduler] --> U
  CLI[Research CLI] --> U
  U --> CORE[geo-core: 純資料契約 / 實體與證據規則]
  U --> POLICY[版本化 scoring policies]
  POLICY --> CORE
  U --> PORTS[Crawler / Search / Structured / Store / Usage ports]
  ADAPTERS[Node crawler / providers / D1 / durable worker adapters] -.實作.-> PORTS
```

geo-core 是內部可共用程式庫，與 D-020 的研究工作名稱「GEO Core」相關但不是同一種交付物；名稱不構成對外標準認證。核心只接收資料、回傳 evidence／analysis，不能 import HTTP server、process.env、DB、filesystem、browser 或 provider SDK。可保留同 repo／CommonJS，暫無必要改 monorepo、語言或發布 npm。

application 負責 `analyzeSite`、`planQueries`、`runMeasurement`、`evaluateMeasurement` 的流程；ports 提供 `crawl`、`search`、`generateStructured`、`saveMeasurement`、`recordAttempt`。Provider adapter 回傳 provider 原生證據與標準結果，不決定分母或 A 的四題政策。scoring 是獨立版本化 policy：A 明確選 v1，研究可只取 raw evidence；新引擎先輸出各自觀測，不自動平均為單一跨引擎分數。

SDK 只包 HTTP、型別、認證、pagination、輪詢、取消等待與可控重試。Monitoring 是凍結量測設定後定時建立新 run、比較結果的 application consumer；不複製核心，也不把 scheduler 塞入 scoring。第一階段可由外部排程器呼叫 API，日後才考慮代管排程。

## 7. 架構判斷與驗證限制

支持抽核心的直接證據是 A 與研究 CLI 已共用 `measureGeoSite`，且同一入口混有 I/O、產品政策及 provider-specific evidence。反方最強理由是：目前尚無經驗證的 B 客戶需求，重寫平台會引入租戶、工作恢復與成本帳本，負擔遠大於單純拆函式。因此建議以原地模組化與單一 provider API 契約先驗證需求，不把「server.js 變短」當作成功指標。

本次只查閱程式、既有測試與決策，未執行測試，不能宣稱現有測試通過或現網安全已驗證。後續契約、資料形狀與版本定義見 `PRODUCT_BOUNDARY.md`；可回退遷移與驗收門檻見 `TASKS.md`。

## 8. 官方搜尋 provider 骨架（D-027）

2026-09-08 設計交接：B 的現行候選流程見 [developer-api/BLUEPRINT](developer-api/BLUEPRINT.md)，安全見 [SECURITY](developer-api/SECURITY.md)，實作順序見 [HANDOFF](developer-api/HANDOFF.md)。前述單一provider API建議是歷史替代方案，不再適用D-029固定四家商品；仍可單家開發fixture，不能以單家對外提供B成功结果。SDK、Monitoring與A改用B流程均不在這次設計後的默認實作範圍。

Developer API 的正式量測路徑採四家官方 API 直連：OpenAI web search、Google Search grounding、Perplexity Sonar、Anthropic web search。OpenRouter 不進 production measurement、fallback 或計費路徑；歷史文件中的 OpenRouter 內容只保留為被否決方案的分析紀錄。

`services/api/application/official-engine-profiles.js` 登錄 provider、API family、原生 search surface、已選定 model ID 與實作狀態。四個 ID 是 D-028 指定的低成本候選，2026-09-09 已完成 D-036 的 20 輪、每家一次、無 retry 受控 benchmark，因此標為 `controlled_benchmark_verified`；這不是 production-ready 或 SLA 驗證。`services/api/application/official-search-providers.js` 已依官方契約實作 request／response parser、用量與版本化成本，且只會在 `DEVELOPER_API_MODE=official` 與四家 server-side key 齊備時建立；fixture 模式不發網路請求。`services/api/ports/search-provider.js` 定義 adapter 必須具有穩定 ID 與 `execute` 邊界，不把四家引用強壓成同一種資料。

後續每個 adapter 必須保留原生回答、原生引用／搜尋事件、實際 model、search surface、locale、時間、usage、錯誤與 attempt，再映射至共同 observation envelope。共通欄位用來查詢；provider-specific evidence 用來追溯。任何 profile 從 `planned` 改為可用前，都需要無付費 fixture contract test、受控付費 smoke test 與人工核可。

DeepSeek 可在未來作為統合輸出 presenter：它只讀取四家已保存的觀測，輸出摘要或比較文字。它不得發起搜尋、補造引用、覆寫原生 evidence、將 `unknown` 轉成零，或影響 D-021 的各引擎分數；是否建立此層另行決策。

依 D-029，這條 Developer API 是產品 A 之外的附屬服務，不得修改或共用會改變 A 行為的 orchestration、計分與 presenter。B 接受一個客戶 prompt 或 URL 後，固定 fan-out 至四個官方 profile，不暴露逐次 engine 選擇；內部 prompt、provider 參數、強化分析與整合流程保持 server-side private。

B 的完成規則是 all-or-failed：四個 profile 都完成才將 job 標記 `succeeded` 並產生完整比較；任一 profile 在 bounded retry 後仍失敗，job 標記 `failed`。成功的 provider evidence 不丟棄，改放在 `partial_results` 並標示逐家狀態，但 presenter 不得把它包裝成完整四家結論。只有 `succeeded` 可結算客戶的一次完整 request；provider／系統失敗已產生的實際或不確定成本仍寫入內部 ledger，由 GeoCheck 承擔。
