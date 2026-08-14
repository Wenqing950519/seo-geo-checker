# GeoCheck Mock API

GeoCheck 是偏向 GEO 搜尋實證的網站健檢服務。Algorithm V3 以 Perplexity 搜尋觀測作為主分數核心，搭配可引用內容與必要技術存取；DeepSeek 不參與計分。

## 供應商角色

| 服務 | 用途 |
|---|---|
| Perplexity Sonar | 只執行已通過 DeepSeek＋規則驗證或人工凍結的查詢；量測實體、品牌提及與官網引用 |
| DeepSeek V4 Flash | 單站先辨識產業並產 5–8 題候選；白皮書逐站只做基本資訊與結構分類 |
| 本地確定性規則 | 抓取、站內準備度、內容可引用性、分數上限與降級 |

網站正式報告與白皮書 Skill 共用 `lib/geo-measurement.js`。單站流程若 DeepSeek 產題失敗，系統不呼叫 Perplexity 且 GEO 顯示未知；不再用固定產業模板補題。

## 設定

```powershell
copy mock-api/.env.example mock-api/.env
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

## Render 部署

Render 的 Build Command 維持 `npm install` 即可。根目錄 `postinstall` 會把與套件版本相符的 Chromium headless shell 安裝到 `node_modules` 內，但不在 build container 啟動瀏覽器驗證：Render 的 build 與執行容器資源條件不同，build-time launch 可能造成無法部署的誤判。實際抓取時才啟動瀏覽器；若無法啟動，報告會記錄抓取診斷並退回 HTTP 或其他既有備援。若 Chromium 無法下載或安裝，建置仍會失敗，避免在沒有瀏覽器檔案時靜默部署。

只有明確不需要瀏覽器備援的部署，才設定 `DISABLE_BROWSER_FETCH=true`；此時安裝步驟會略過 Chromium。

## 主要 API

- `GET /healthz`：健康檢查。
- `GET /home`：網站首頁。
- `POST /api/audit-real-lite`：正式 GEO V3 健檢。
- `POST /api/test-provider`：DeepSeek 連線測試。
- `POST /api/test-search-provider`：Perplexity 連線測試。
- `POST /api/search-context`：單次 Perplexity 搜尋脈絡。
- `GET /<ADMIN_PATH_TOKEN>/usage`：成本與 Token 摘要；必須帶 `X-Admin-Token`。

## 白皮書批次

```powershell
node .agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs `
  --input research-input/sites.csv `
  --query-set research-input/restaurant-query-set.approved.json `
  --output-dir research-output/taiwan-sme-2026 `
  --max-perplexity-calls 1200 `
  --max-deepseek-calls 400 `
  --concurrency 2
```

使用兩題人工凍結題庫時，每個新網站最多 3 次 Perplexity 與 1 次 DeepSeek；題庫必須先經 DeepSeek 草擬、人工審核並標記 approved。逐站 DeepSeek 只輸出研究描述 schema，不產生優化建議。若只想先排除抓取失敗，可使用 `run-rules-batch.mjs` 做零 API 預檢，但其 `geo_score` 必須為 `null`。

## 測試

```powershell
npm.cmd test
```

測試包含演算法邊界、表面成熟偏差、Skill 同步、DeepSeek provider、robots 未知狀態、爬蟲、供應商設定、成本紀錄與健康檢查。
