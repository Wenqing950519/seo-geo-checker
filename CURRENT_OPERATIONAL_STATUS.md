# GeoCheck 當前運作狀態

更新日期：2026-07-16

## 已完成

- Algorithm V3.0.0 已切換為 GEO-first：Perplexity 搜尋觀測 50%、內容可引用性 30%、必要技術存取 20%。
- Perplexity 無法量測時，整體 GEO 分數為未知；站內準備度不得冒充 GEO 分數。
- Gemini 不參與計分。正式報告可用 Gemini 解釋；白皮書 Skill 只用 Gemini Flash-Lite 做基本資訊與結構分類，不產生優化建議。
- 網站與 Skill 共用 `mock-api/lib/geo-measurement.js`，並由同步測試阻止權重漂移。
- 白皮書批次腳本每站固定 Perplexity 3 次、Gemini 1 次，要求兩個獨立硬上限，支援 JSONL 續跑與資料集雜湊。
- 本機 Gemini 若回傳地區不支援，可透過管理員密碼保護的 Render 代理端點執行研究描述。
- 後台維持無公開入口的 `/<ADMIN_PATH_TOKEN>`，並以 `ADMIN_TOKEN` 驗證用量與研究代理請求。

## 供應商實測

| 服務 | 狀態 | 證據 |
|---|---|---|
| Perplexity Sonar | 已啟用 | 2026-07-16 最終審計 6/6 呼叫成功。 |
| Gemini 3.1 Flash-Lite（Render） | 已啟用 | `POST https://geocheck.lisheng.cv/api/test-provider` 回傳成功，模型為 `gemini-3.1-flash-lite`。 |
| Gemini（目前本機出口） | 地區限制 | Google 回傳 HTTP 400 `User location is not supported for the API use.`，改走受保護 Render 代理。 |

## 最終演算法審計

| 網站 | GEO | 站內準備度 | Perplexity | 提及率 | 官網引用率 | 實體對齊 |
|---|---:|---:|---:|---:|---:|---|
| 壽司郎 | 65 | 63 | 41 | 0% | 50% | 是 |
| Hunterest | 41 | 87 | 0 | 0% | 0% | 否 |

結果符合產品目的：Hunterest 的站內結構雖較完整，但未因結構拿到高 GEO 分；壽司郎有實體與官網引用證據，因此 GEO 分較高。資料集 SHA-256：`83d50e17a6962342d5e1baf7c44ea3e97fb40bda0c4ff2ba7703b8304010cd6c`。

## 上線前檢查

1. Render 保留 `GEMINI_API_KEY`、`PERPLEXITY_API_KEY`、`ADMIN_PATH_TOKEN` 與 `ADMIN_TOKEN`。
2. 部署後測試 `POST /api/test-provider` 與 `POST /api/test-search-provider`。
3. 以正確 `X-Admin-Token` 測試 `POST /api/internal/research-profile`；未帶密碼必須回傳 401。
4. 執行 `npm.cmd test`；任一同步、計分或安全測試失敗都不得部署。
5. 白皮書批次執行前，先公告預計網站數與兩家供應商的硬上限。

## 對外聲明

GeoCheck 量測的是公開網站與指定 Perplexity 查詢集下的可觀測 GEO 證據，不保證任何 AI 引擎一定引用、排名或推薦。失敗或未知證據不補零，也不由 Gemini 猜測。
