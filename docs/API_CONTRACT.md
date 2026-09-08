# API Contract

本文件區分目前可用的 A API 與尚未實作的 B 草案。目錄搬到 services/api 沒有改變 HTTP 契約，也沒有新增公開開發者服務。

## 現行 A（2026-09-08 程式基準）

| 路徑 | 輸入／輸出與限制 |
|---|---|
| `POST /api/audit-real-lite` | JSON `{url, customQueries?, source?}`；customQueries 最多四題且不能重複，未填由現有 planner 補足。同步等待，回 200 完整 report；不是 202 job |
| `GET /api/report/:id` | 讀取記憶體／D1 的報告；沒有 report 回 404；payload 保留 A normalization |
| `GET /report/:id`、`GET /report/:id/markdown` | A 的 HTML／Markdown 呈現；不是 SDK schema |
| `GET /healthz` | 無付費呼叫的 process health；不證明 provider 量測成功 |
| `POST /api/audit` | 已退役，410 與 replacement；`/api/status/:id` 也不是 durable job 契約 |

URL 不合法／不安全或自訂題不合法會拒絕；現有限流回 429 與 Retry-After。有效回答缺品牌／官網引用才可計零，unknown 與 fetch-limited 報告仍可能是 HTTP 200。完整報告形狀仍由 A 擁有，不能當作穩定 B SDK 介面。測試與搜尋代理路由未列入此公開整合契約。

## Developer B（Draft，未實作）

建議 create measurement → durable job → immutable measurement，候選路徑為 `POST /v1/measurements`、`GET /v1/jobs/:id`、`GET /v1/measurements/:id`、list 與 engines。request／response 欄位、錯誤、tenant scope、idempotency、cache freshness、query-run 與引用語義的唯一草案位於 [PRODUCT_BOUNDARY.md §3–5](PRODUCT_BOUNDARY.md#3-建議-public-api-surface)，此處不複製第二份 schema。

SDK 發布前必須凍結的五項契約：

1. URL／entity／query-set／engine profile 的識別與版本，client assertion 不等於已驗證 entity。
2. job 與 analysis 狀態分離；所有失敗 query-run 保留，attempt 不重複進分母。
3. tenant authorization、idempotency、Retry-After、錯誤 envelope 與有限重試。
4. observed_at、fresh／reuse、retention、raw evidence 權限與來源型別。
5. OpenAPI／JSON Schema 與 HTTP fixture 驗收；首發語言與服務範圍正式確認。

Project／Run persistence 可以先供 apps/web 使用，不必等待 `/v1`、SDK 或 Developer Console。D-026 僅確認目錄整理，不批准實作上述 API。
