# GeoCheck Mock API

GeoCheck 是偏向 GEO 搜尋實證的網站健檢服務。Algorithm V3 以 Perplexity 搜尋觀測作為主分數核心，搭配可引用內容與必要技術存取；Gemini 不參與計分。

## 供應商角色

| 服務 | 用途 |
|---|---|
| Perplexity Sonar | 實體權威驗證、兩題非品牌探索、品牌提及與官網引用量測 |
| Gemini 3.1 Flash-Lite | 正式報告的證據解讀；白皮書模式只做基本資訊與結構分類 |
| 本地確定性規則 | 抓取、站內準備度、內容可引用性、分數上限與降級 |

網站正式報告與白皮書 Skill 共用 `lib/geo-measurement.js`。Gemini 不可用不會改變已完成的 Perplexity GEO 分數。

## 設定

```powershell
copy mock-api/.env.example mock-api/.env
npm.cmd run mock-api
```

必要環境變數：

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
PERPLEXITY_API_KEY=
PERPLEXITY_MODEL=sonar
ADMIN_PATH_TOKEN=
ADMIN_TOKEN=
GEMINI_EXECUTION_MODE=auto
GEOCHECK_RESEARCH_API_URL=https://geocheck.lisheng.cv
GEOCHECK_RESEARCH_API_TOKEN=
```

研究代理 token 未另外設定時會使用 `ADMIN_TOKEN`。不要提交真實金鑰或密碼。

## 主要 API

- `GET /healthz`：健康檢查。
- `GET /home`：網站首頁。
- `POST /api/audit-real-lite`：正式 GEO V3 健檢。
- `POST /api/test-provider`：Gemini 連線測試。
- `POST /api/test-search-provider`：Perplexity 連線測試。
- `POST /api/search-context`：單次 Perplexity 搜尋脈絡。
- `POST /api/internal/research-profile`：白皮書 Gemini 描述代理；必須帶 `X-Admin-Token`。
- `GET /<ADMIN_PATH_TOKEN>/usage`：成本與 Token 摘要；必須帶 `X-Admin-Token`。

## 白皮書批次

```powershell
node .agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs `
  --input research-input/sites.csv `
  --output-dir research-output/taiwan-sme-2026 `
  --max-perplexity-calls 1200 `
  --max-gemini-calls 400 `
  --concurrency 2
```

每個新網站最多 3 次 Perplexity 與 1 次 Gemini。Gemini 只輸出研究描述 schema，不產生優化建議。若只想先排除抓取失敗，可使用 `run-rules-batch.mjs` 做零 API 預檢，但其 `geo_score` 必須為 `null`。

## 測試

```powershell
npm.cmd test
```

測試包含演算法邊界、表面成熟偏差、Skill 同步、Gemini 代理、robots 未知狀態、爬蟲、供應商設定、成本紀錄與健康檢查。
