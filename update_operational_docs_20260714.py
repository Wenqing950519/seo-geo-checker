from pathlib import Path

ROOT = Path(__file__).resolve().parent

README = """# SEO/GEO Mock API

GeoCheck 的網站 SEO/GEO 健檢原型。核心分數來自可驗證的抓取與規則訊號；外部模型只補充脈絡與語意解讀，不能改寫核心分數。

## 當前供應商狀態（2026-07-14）

| 服務 | 角色 | 狀態 |
|---|---|---|
| Perplexity Sonar | 公開網站脈絡與來源探索 | 已完成真實連線測試。 |
| Gemini 3.1 Flash-Lite | 結構化定位與建議解讀 | 程式與設定完成；目前測試執行位置收到 `User location is not supported for the API use`，正式部署需改至支援區域或改用 Vertex AI 後重新驗證。 |
| 本地確定性降級 | Gemini 不可用時的報告 | 已實作；回傳技術／內容分數並標註 AI 解讀未驗證。 |

## 設定

請使用 `mock-api/.env`，不要把 key 寫在 `mock-api/.env.example`。

```powershell
copy mock-api/.env.example mock-api/.env
```

至少設定：

```env
GEMINI_API_KEY=
PERPLEXITY_API_KEY=
ADMIN_PATH_TOKEN=至少16字元，僅限A-Z、a-z、0-9、_、-
ADMIN_TOKEN=後台登入密碼
```

成本後台的預估單價是可選設定；未填時仍會記錄 token，不會假裝有精確成本：

```env
GEMINI_INPUT_USD_PER_1M_TOKENS=
GEMINI_OUTPUT_USD_PER_1M_TOKENS=
PERPLEXITY_INPUT_USD_PER_1M_TOKENS=
PERPLEXITY_OUTPUT_USD_PER_1M_TOKENS=
PERPLEXITY_USD_PER_REQUEST=
```

## 執行

```powershell
npm.cmd run mock-api
```

開啟首頁：`http://localhost:8787/home`

## 供應商連線測試

```powershell
Invoke-RestMethod -Uri "http://localhost:8787/api/test-provider" -Method Post -ContentType "application/json" -Body "{}"
Invoke-RestMethod -Uri "http://localhost:8787/api/test-search-provider" -Method Post -ContentType "application/json" -Body "{}"
```

只有 Gemini 測試成功回傳模型與延遲後，才能將 Gemini 標示為已啟用。若失敗，系統應維持本地降級，不應宣稱有 Gemini 引用或能見度結果。

## Real-Lite 健檢

```powershell
Invoke-RestMethod -Uri "http://localhost:8787/api/audit-real-lite" -Method Post -ContentType "application/json" -Body '{"url":"https://example.com"}'
```

流程：

```text
URL -> HTTP/瀏覽器抓取 -> 技術與內容規則評分
    -> Perplexity Sonar（可用時補充公開脈絡）
    -> Gemini（僅部署區域驗證成功時做解讀）
    -> JSON 報告；否則本地確定性降級
```

## 私有成本後台

不提供 `/admin` 或首頁入口。書籤網址：

```text
https://你的網域/<ADMIN_PATH_TOKEN>
```

正確私有路徑才會顯示登入頁；資料仍必須輸入 `ADMIN_TOKEN`。錯誤路徑與舊 `/admin` 皆為 404。台帳只保存時間、供應商、模型、用途、token、延遲、狀態與預估成本，不保存 API key、提示詞或網站內容。

## API 端點

- `GET /home`：網站首頁。
- `POST /api/audit`：Mock 健檢工作。
- `GET /api/status/:jobId`：Mock 工作狀態。
- `GET /api/report/:reportId`：報告 JSON。
- `GET /report/:reportId`：報告頁。
- `POST /api/test-provider`：Gemini 連線測試。
- `POST /api/test-search-provider`：Perplexity Sonar 連線測試。
- `POST /api/search-context`：Perplexity 搜尋脈絡。
- `POST /api/audit-real-lite`：真實網站健檢。

## 部署注意事項

- 本機 `.env` 不會隨 Git 部署；請在部署平台設定同名環境變數。
- `usage-events.jsonl` 需要持久化檔案系統；Serverless 或短暫容器應改用資料庫／持久化磁碟保存歷史。
- 目前 rate limit 是單程序記憶體實作；多實例部署時請改用 Redis 或相等的共享儲存。
- 不保證任何 AI 搜尋引擎會引用、排名或推薦受檢網站。
"""

ENV = """# Copy this file to mock-api/.env (or project root .env). Never commit real values.

PORT=8787
SITE_ORIGIN=https://geocheck.lisheng.cv
LEGACY_HOST=geocheck.tungowo.com

# Gemini: structured audit interpretation. Confirm /api/test-provider after deployment.
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta

# Perplexity: web-grounded public context.
PERPLEXITY_API_KEY=
PERPLEXITY_MODEL=sonar
PERPLEXITY_BASE_URL=https://api.perplexity.ai
PERPLEXITY_ENDPOINT=/chat/completions

# Private cost dashboard. The bookmark is https://your-domain/<ADMIN_PATH_TOKEN>.
# ADMIN_PATH_TOKEN must be 16-128 characters from A-Z, a-z, 0-9, _ and -.
ADMIN_PATH_TOKEN=
ADMIN_TOKEN=

# Optional cost estimates. Prices are USD per 1,000,000 tokens unless stated otherwise.
GEMINI_INPUT_USD_PER_1M_TOKENS=
GEMINI_OUTPUT_USD_PER_1M_TOKENS=
PERPLEXITY_INPUT_USD_PER_1M_TOKENS=
PERPLEXITY_OUTPUT_USD_PER_1M_TOKENS=
PERPLEXITY_USD_PER_REQUEST=

# Optional browser fallback for sites that block server-side fetch.
PLAYWRIGHT_NODE_MODULES=
DISABLE_BROWSER_FETCH=false

# MVP abuse controls. Replace in-memory limits with shared storage for multi-instance production.
RATE_LIMIT_IP_WINDOW_MS=600000
RATE_LIMIT_IP_MAX=10
RATE_LIMIT_URL_COOLDOWN_MS=1800000
MAX_ACTIVE_AUDITS=2
AUDIT_CACHE_TTL_MS=604800000
TRUST_PROXY=false
"""

(ROOT / "mock-api" / "README.md").write_text(README, encoding="utf-8")
(ROOT / "mock-api" / ".env.example").write_text(ENV, encoding="utf-8")
(ROOT / ".env.example").write_text(ENV, encoding="utf-8")
print("Updated README and environment templates")
