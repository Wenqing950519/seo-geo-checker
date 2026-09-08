# GeoCheck 服務操作

GeoCheck 的產品核心是 `AI Trust Index v1.0.0`：可見答案中的品牌採用率占 65%，已驗證第一方官方 URL 的來源證據占 35%。它不是 AI 模型的內部信任分數。`GEO Core` 保留答案層、來源層、原始 query-run 與 unknown；站內準備度與改善建議獨立呈現，不參與指數。

## 供應商角色

| 服務 | 用途 |
|---|---|
| Perplexity Sonar | 只執行已通過 DeepSeek＋規則驗證或人工凍結的查詢；量測答案採用與已驗證官方 URL 證據 |
| DeepSeek V4 Flash | 單站先辨識產業並產 5–8 題候選；白皮書逐站只做基本資訊與結構分類 |
| 本地確定性規則 | 抓取、站內準備度、內容可引用性、query-run 覆蓋與分數封頂 |

網站正式報告與白皮書 Skill 共用 `services/api/application/geo-measurement.js`。單站流程若 DeepSeek 產題失敗，系統不呼叫 Perplexity 且 AI Trust Index 顯示 unknown；不再用固定產業模板補題。有效回答未採用品牌或未引用官方 URL 才是 0；拒答、失敗與無法解析輸出不進分母。

## 設定

```powershell
Copy-Item .env.example .env
npm.cmd run mock-api
```

必要環境變數：

```env
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_MODEL_RELEASE=0731
PERPLEXITY_API_KEY=
PERPLEXITY_MODEL=sonar
PERPLEXITY_MIN_INTERVAL_MS=1500
ADMIN_PATH_TOKEN=
ADMIN_TOKEN=
DEEPSEEK_THINKING=disabled
```

研究代理 token 未另外設定時會使用 `ADMIN_TOKEN`。不要提交真實金鑰或密碼。

Perplexity 請求會在單一服務程序中排隊執行，預設於每次請求完成後至少間隔 1.5 秒再送下一筆，避免完整 GEO audit 的 authority 與 discovery 查詢形成瞬間突發流量。若供應商方案的速率限制不同，可用 `PERPLEXITY_MIN_INTERVAL_MS` 調整；設為 `0` 只適合測試環境。

## D1 報告保存

單站產品會以四個 discovery queries 觀測；每個自訂題都可選填，系統會保留已填題目並補足其餘名額。相同網站、相同自訂題組（或自動題組）與相同 pipeline 版本才會重用尚未過期的報告。成功報告會保留原始 query-run 與版本資料，服務重啟後仍可透過不可預測的報告 ID 讀取；抓取受限／失敗報告不保存。

專用資料庫是 `geocheck-reports`，migration 位於 `services/api/migrations/`，專案內的 `services/api/wrangler.jsonc` 僅用來管理它，**不代表 Render Node 服務已遷移到 Cloudflare Worker**。要啟用 Render 的持久保存，建立只含此資料庫 **D1 Read + D1 Write** 權限的 API token，並設定：

```env
CLOUDFLARE_ACCOUNT_ID=d94ae08a9389415ba3fcf231db7fc909
CLOUDFLARE_D1_DATABASE_ID=dc0c172d-3042-42a2-a77b-cc57a6d8a0e9
CLOUDFLARE_D1_API_TOKEN=<scoped-token>
```

不要使用 Cloudflare Global API Key、Wrangler OAuth token 或 THE MAP 的 `bgo-career` 資料庫。三個變數任一缺漏時，服務會安全地退回 process-local cache。

## Render 部署

Render 的 Build Command 維持 `npm install` 即可。根目錄 `postinstall` 會安裝兩個可重現 runtime：Node Playwright Chromium 與 `.scrapling-runtime/` 的 Python Scrapling。Scrapling 不另下載瀏覽器，而是重用 Playwright Chromium；Node 主服務仍由 `npm run mock-api` 啟動，不得改成 Python HTTP server。實際抓取時才啟動瀏覽器；若任一 runtime 無法安裝，建置會失敗，避免在沒有備援能力時靜默部署。

首頁擷取鏈為：原生 HTTP → Playwright → Scrapling dynamic → Scrapling stealth → Google Translate。每一級都以同一份 crawl-quality 規則比較，報告會保留各級診斷與最終 `fetchMethod`；因此 Scrapling 改善抓取能力，不會改變 GEO 計分或把缺失證據視為零。Scrapling 0.4.14 的靜態 fetcher 在目前 Python 3.13 / curl_cffi 組合會將有效 session 誤判為不存在，故不放進正式鏈。Scrapling 不使用 proxy、帳密、CDP、付費牆／登入繞過或 CAPTCHA solver，且僅應處理公開、授權且 robots.txt／服務條款允許的頁面。

只有明確不需要瀏覽器備援的部署，才設定 `DISABLE_BROWSER_FETCH=true`；此時安裝步驟會略過 Chromium。

## 主要 API

- `GET /healthz`：健康檢查。
- `GET /home`：網站首頁。
- `POST /api/audit-real-lite`：正式 AI Trust Index 健檢。
- `POST /api/test-provider`：DeepSeek 連線測試。
- `POST /api/test-search-provider`：Perplexity 連線測試。
- `POST /api/search-context`：單次 Perplexity 搜尋脈絡。
- `GET /<ADMIN_PATH_TOKEN>/usage`：成本與 Token 摘要；必須帶 `X-Admin-Token`。

## 白皮書批次

```powershell
node .agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs `
  --input research/inputs/<approved-sites>.csv `
  --master research/inputs/<approved-entity-master>.csv `
  --query-set research/inputs/<approved-query-set>.json `
  --output-dir research/outputs/taiwan-sme-2026 `
  --max-perplexity-calls 1200 `
  --max-deepseek-calls 400 `
  --concurrency 2
```

使用兩題人工凍結題庫時，每個新網站最多 3 次 Perplexity 與 1 次 DeepSeek；題庫必須先經 DeepSeek 草擬、人工審核並標記 approved。逐站 DeepSeek 只輸出研究描述 schema，不產生優化建議。若只想先排除抓取失敗，可使用 `run-rules-batch.mjs` 做零 API 預檢，但其 `ai_trust_index` 必須為 `null`。

## 測試

```powershell
npm.cmd test
```

測試包含演算法邊界、表面成熟偏差、Skill 同步、DeepSeek provider、robots 未知狀態、爬蟲、供應商設定、成本紀錄與健康檢查。
