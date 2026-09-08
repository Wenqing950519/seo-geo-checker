# GeoCheck A / Developer Platform B 邊界提案

> 2026-09-08 更新：使用者已授權並進行目錄整理；B 契約仍是草案。現行 A API 見 `API_CONTRACT.md`，商業企劃的 Project／Monitoring 路線見 `strategy/ROADMAP_ALIGNMENT.md`。資料夾存在不代表功能完成。

A 與 B 應共用量測能力，但分別擁有使用者契約；B 對外提供可追溯的工作與證據，SDK 是 API client，Monitoring 是重複執行同一量測設定的使用方式。

狀態：2026-09-08 架構建議，尚未成為 DECISION_LOG 正式決策。現況證據與程式定位見 `ARCHITECTURE.md`。本文件僅定義前置資訊，未建立 endpoint、schema、SDK、帳號或付費方案。

## 1. 產品責任

| 面向 | A：GeoCheck web | B：Developer platform | 共用層 |
|---|---|---|---|
| 使用情境 | 使用者輸入 URL，理解診斷與下一步 | 開發者在交付／維護流程中取得結構化觀測；需求仍待驗證 | 同一網站與查詢集的 evidence |
| 輸入政策 | 四題 discovery，可部分自填，維持既有 fallback 決策 | 明確的 versioned query set、engine profile、entity 與 cache policy | 資料驗證與已審核題組規格 |
| 輸出 | 中文報告、AI 信任值、Markdown、CTA | job、measurement、query-run、來源、用量及版本 | 品牌判讀、原始訊號與分母 |
| 營運責任 | GA4、leads、商家文案、免費入口政策 | tenant/key、授權、持久工作、配額、服務契約 | application 與 I/O adapters 可共用 |
| 不應共享 | A 不存取 B 私有資料 | B 不依賴 A 的頁面／文案／lead | core 不依賴任一產品 UI 或商業方案 |

研究 CLI 保留獨立 consumer：人工審核、凍結 cohort、禁用 fallback、證據輸出與研究預算不能因 B 上線而消失。A 的匿名入口應由 server 使用受限 A profile，不把平台 master key 放入瀏覽器，也不允許匿名指定任意引擎／重跑。

## 2. 提案與正式決策的差距

| 項目 | 判定 | 對前置設計的影響 |
|---|---|---|
| 附件宣稱 TA 已正式轉型 | 未見 D-025 以前決策正式確認；與 charter 既有定位／研究優先序有差距 | B 是本次授權的探索方向；不撤掉 A，不改章程，不推定優先於白皮書 |
| OpenRouter 為全部模型統一搜尋入口 | 本次未驗證附件的外部 API、支援模型與價格主張 | adapter port 保留彈性；不鎖供應商，不據此採購或估毛利 |
| 官方原生 API / 路由商 API = 消費者 ChatGPT、Claude、Gemini 體驗 | 附件沒有提供可比性證據 | engine identity 必須記錄 access surface、路由商、model、搜尋工具與設定；不以模型名冒充消費者產品量測 |
| 每次 16 calls / 固定 Credit / 毛利 | 現有 A 還有 authority、planner、重試與爬取；附件估算非完整服務成本 | 先量實際 attempt 與成本，再決定商業單位；未定價不自動回 402 |
| citation normalization / 多引擎總分 | 現有來源合併可能抹平語義；跨引擎有效性未證明 | 保留來源類型，先分引擎報告；新指標待使用者核准、版本化 |

在上述差距解決前，可以進行使用者已授權的文件分析；正式轉型、計分改變及平台實作仍是後續獨立決策。本次不為附件補作外部技術事實認證。

## 3. 建議 public API surface

採 `/v1` JSON API。以下路徑與欄位均為候選契約，第一個版本只承諾有能力矩陣與驗收 fixture 的引擎。

| 邊界 | 候選 endpoint | 說明 |
|---|---|---|
| 發起量測 | `POST /v1/measurements` | 認證、驗證、idempotency、預算 reservation 後建立 durable job；202 + job_id + measurement_id + Location |
| 查工作／結果 | `GET /v1/jobs/:id`；`GET /v1/measurements/:id` | 工作狀態與 immutable 結果分離；未完成結果回明確 not_ready，非空的成功報告 |
| 查歷史 | `GET /v1/measurements?project_id=...&cursor=...&limit=...` | tenant scope、穩定排序與 cursor；project_id 初期可選，不必先建管理後台 |
| 取得可用能力 | `GET /v1/engines` | 穩定 engine profile ID、provider/model/search surface、限制與支援狀態；不暴露 secrets 或即時付費探測 |
| 後續擴充 | projects / query-sets / monitors / webhooks | 等核心契約穩定與實際需求後獨立設計；不在第一版塞入所有 CRUD |

站內分析、規劃、搜尋與計分先作為內部 use case，不預設每個函式都需要 public endpoint。B 提供量測服務，非任意 prompt 的 AI proxy；現有 `/api/search-context` 與 provider-test 不列入 public B。

### Request 草案

```json
{
  "site_url": "https://example.com/",
  "entity": { "name": "Example", "official_urls": ["https://example.com/"] },
  "query_set": {
    "version": "client-discovery-1",
    "queries": [{ "id": "q1", "text": "使用者明確指定的需求問題", "scope": "discovery" }]
  },
  "engine_profiles": ["perplexity-sonar-profile-v1"],
  "analysis_profile": "ai-trust-index-1.0.0",
  "cache_policy": { "mode": "reuse", "max_age_seconds": 86400 },
  "project_id": "optional-project-id"
}
```

此例展示形狀，不表示一題足以完整量測；v1 分母不足仍套用原政策。API 應限制題數、文字長度、站點範圍、引擎數與 payload size。第一版建議要求 explicit query set；A 的自動規劃維持 A profile。client 提供 entity 只代表 assertion，不能自標 verified；須保存 `provenance`、版本與 validation status。共享網域需 owned URL path 歸屬證據，不能把整個平台當品牌官網。

### Response 與資料模型

| 物件 | 最小需要保留的欄位 | 語義 |
|---|---|---|
| Job | id、tenant_id（內部）、measurement_id、status、stage、created/started/finished_at、error、completed_units/total_units | 工作執行，不用經過秒數假裝進度 |
| Measurement | id、requested/final_url、query_set_hash、entity_version、engine_profiles、schema/pipeline/parser/scoring versions、observed_at、cache provenance、limitations | 一次可追溯 observation snapshot；不得在重跑時覆寫 |
| QueryRun | id、query_id、scope、engine identity、prompt/config hash、answer、answer_status、attempt references、started/finished_at | 邏輯觀測單位；重試 attempt 不自動增加統計分母 |
| Evidence | raw source reference/hash、original/resolved URL、source_kind、answer span、entity attribution、verification status/reason | 引用、搜尋來源、正文 URL、工具結果分開；claim support 未驗證保持 unknown |
| Analysis | per_engine 的 valid/excluded/total、mention/source components、score status/value、policy version、caps；usage actual/estimated/unknown | 分析與原始值分開；未量到不能回零；沒有跨引擎總平均 |

Canonical schema 必須保留所有 requested query-runs，包括 provider failure、refusal、parse error、skipped。現有 evaluator 先 filter enabled，不能直接沿用其 excluded count 作為完整失敗統計。成功回答未提及才是 measured zero；沒有有效回答為 unknown/null。job 可 succeeded 而 analysis unknown；一個引擎失敗但其他完成為 partial，回傳逐引擎狀態；pipeline 無法繼續才 failed。

raw provider response 應有受控保存位置與 hash，公開 API 預設只回必要證據；不能把內部 env、錯誤原文或跨租戶引用資料直接送出。保存期限、下載權限與刪除規則需先定義，API 不承諾未實作的永久 raw download。

### 引用 adapter 契約

SearchPort 接收 query、scope、engine profile、deadline、attempt context，回傳 answer、native citations、search results、tool metadata、usage 與 provider error。供應商解析保留原始定位，核心再評估 evidence；`isOfficialDomain` 不是 provider 自報值。

`source_kind` 至少區分 `answer_citation`、`search_result`、`inline_url`、`tool_result`；無法定位來源是 `unresolved`，不可用 Markdown URL 正規式補成已驗證引用。canonical URL 可用於去重，但保留每個原始來源與 span。相同網域不證明答案主張被支持；URL 歸屬、來源內容、答案採用各自存狀態。

目前 A 合併來源的舊判讀可由相容 profile 重現；B 新語義若改變分數，需升 parser／scoring version，禁止仍稱完全相同 v1 行為。跨引擎比較需固定 query set、語言、地區設定、模型／工具與觀測窗口，未知的設定顯式記錄 unknown。

## 4. 服務契約與 SDK 前置條件

認證先於資料讀取與 cache lookup：Bearer key 映射 tenant + scope，key hash 保存、可撤銷、可輪替。所有 job／measurement 查詢都做 owner check，未知與非己有 ID 使用一致 404。A 舊公開報告另走 A presenter，B 私有 report ID 不得因共用報告 store 而被 A URL 讀出。

`Idempotency-Key` 在 tenant + operation 內唯一，儲存正規化 request hash；相同 key/body 回同一 job，相同 key 不同 body 回 409。保留時間至少覆蓋可重試工作生命週期，實際期限在發布契約前確認。重跑觀測必須用新 key、新 run；單純 GET／SDK poll 不觸發供應商。

建議錯誤 envelope 為 `error.code/message/retryable/request_id/details`，details 去除 secrets；400 為 malformed，422 為不支援 profile／語義無效，401/403 為認證／權限，404 為不可見資源，409 為 idempotency 衝突，429 為限流，503 為暫時無法接受工作。429/503 附 Retry-After；無餘額的 code 與 HTTP status 待商業方案決定。已接受工作的 provider 錯誤記在 job/result，不事後假裝 POST 沒建立工作。

快取建議分成「request reuse 索引」與「immutable measurement」。key 至少含 tenant/privacy scope、完整 URL 與 crawl scope、entity version、query 文字／順序／scope、model/search config、語系／地區、pipeline/parser/scoring version。reuse 回新鮮度與 original measurement ID，不改 observed_at；fresh 必須走限額。未知／暫時失敗是否重用、TTL 與 purge policy 明文設定。監控每一期預設 fresh，不能七天內一直把同一 snapshot 當新樣本。

SDK 首發語言仍待確認；先完成 OpenAPI / JSON Schema 與錯誤 fixtures，再產型別或寫 thin client。需有 create/get/list/wait、timeout／AbortSignal、poll backoff/jitter、pagination 與版本資訊。POST 只有帶同一 idempotency key 才允許安全重試；取消本機等待不代表取消遠端工作或免計費。不將 vendor secrets、Playwright 或核心計分打包到 SDK。

## 5. Jobs、預算與 Monitoring（建議）

工作狀態為 `queued → running → succeeded | partial | failed`。API 在 job 與 reservation 可持久化後才回 202；worker 用 lease／heartbeat 與 attempt 記錄恢復。可由同一 Node 部署先運行 worker，不強制新增服務；儲存失敗時不能降級成只存 Map 卻仍承諾 durable job。

成本控制必須覆蓋 planner、authority、discovery、fallback、retry 與人工 provider probe。流程為認證／驗證／入站限流 → 已授權 reuse → 原子預留 tenant 與全域預算 → durable job／outbox → worker claim → 每個外部 attempt 記錄與執行 → 結算／釋放剩餘預留。不能用先讀餘額再扣款的兩個獨立請求。儲存 adapter 必須以經驗證的原子操作維持「可用額不為負、同一 reservation 只結算一次、全域與租戶上限共同成立」；若資料庫能力不足，採單一 reservation writer，而非假設 D1 REST 多次呼叫天然是交易。

外部 provider 不一定支援 idempotency；網路 timeout 後可能已計費，因此不承諾 exactly-once provider call。保存 ambiguous attempt，保留預算直到對帳，限制重試次數；worker 重啟不可無條件重做所有成功步驟。usage meter 的估價不足以當財務帳本，成本未知不等於免費。

Monitoring 初期是客戶排程腳本呼叫同一 API：固定 project/entity/query-set/engine profile，每次產生新 measurement，僅比較設定相容的 runs；query/model/parser 更換時標示 series break，unknown 不計為下降到零。代管 scheduler、alert threshold、時區與通知管道均後置。若日後做 webhook，需 owner-scoped subscription、簽章、timestamp、防重放、delivery ID、重試與目的 URL 安全驗證。

URL 安全不能只在入口驗證 hostname；爬蟲重導向、browser 子資源、代表頁與 citation resolution 都需相同 egress 政策與大小／時間限制。這是 B 對任意輸入開放前的驗收項，不代表目前已完整防護或本次已完成安全稽核。
