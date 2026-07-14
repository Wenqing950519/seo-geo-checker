# GeoCheck 當前營運與技術狀態

更新日期：2026-07-14

## 可確認的現況

| 項目 | 狀態 | 證據／限制 |
|---|---|---|
| 規則評分與多層爬取 | 已實作、測試通過 | 核心分數由公開網站證據與規則決定，不由模型決定。 |
| Perplexity Sonar | 已實際連線成功 | `POST /api/test-search-provider` 成功回傳 `sonar`。 |
| Gemini 3.1 Flash-Lite | 整合完成，部署待驗證 | 現有執行環境回傳 HTTP 400：`User location is not supported for the API use.`；不是演算法分數或 JSON 解析錯誤。 |
| Gemini 降級機制 | 已實作 | Gemini 不可用時，報告回退為本地確定性結果，並標註 AI 解讀未驗證。 |
| 成本台帳 | 已實作、測試通過 | 記錄供應商、模型、用途、token、延遲、狀態與預估成本；不記錄 key、提示詞或網站內容。 |
| 私有成本後台 | 已實作、路由驗證通過 | 需同時具備私有路徑 `ADMIN_PATH_TOKEN` 與登入密碼 `ADMIN_TOKEN`。 |

## 正確的產品敘述

GeoCheck 目前是「AI 搜尋可讀性與技術整備度健檢工具」。它能以可重現的公開網站訊號產生分數、證據與修正建議；它不保證 ChatGPT、Gemini 或任何搜尋引擎會引用、排名或推薦特定網站。

## 上線前必要條件

1. 在部署平台設定 `GEMINI_API_KEY`、`PERPLEXITY_API_KEY`、`ADMIN_PATH_TOKEN` 與 `ADMIN_TOKEN`；本機 `.env` 不會隨 Git 部署。
2. 將 Gemini 請求部署到 Gemini Developer API 支援的執行區域，或改用 Vertex AI 後重新執行 `POST /api/test-provider`。
3. 只有 `test-provider` 回傳成功後，才可把 Gemini 狀態標記為「已啟用」。
4. 若主機檔案系統非持久化，將 `usage-events.jsonl` 改存入資料庫或持久化磁碟，否則重啟後成本歷史會遺失。
5. 成本欄位僅為預估；請依實際方案在環境變數填入單價，並以供應商帳單為準。

## 私有後台設定

```env
ADMIN_PATH_TOKEN=至少16字元，僅限A-Z、a-z、0-9、_、-
ADMIN_TOKEN=登入密碼
```

書籤格式：`https://geocheck.lisheng.cv/<ADMIN_PATH_TOKEN>`。
不提供首頁入口；錯誤路徑與舊 `/admin` 路徑均回傳 404。
