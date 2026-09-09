# Developer API 雛型啟動說明

目前是可本機驗證的 B0／B1 雛型，不是公開服務：固定四家、非同步 job、成功才扣一輪、失敗回 partial results 均可由 fixture 測試；四家官方 adapter 於 2026-09-09 完成 D-036 的 20 輪受控 benchmark，20／20 四家全成。仍沒有帳戶管理、金流、真實 URL 抓取或 SDK。

## 本機憑證位置

請在專案根目錄的 `.env` 填寫下列四個值。該檔案已被 Git 忽略，伺服器啟動時會自動讀取；不要把憑證放進文件、前端、測試 fixture 或 log。

```text
OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
PERPLEXITY_API_KEY=
```

四把 key 都填完後，才將 `.env` 的 `DEVELOPER_API_MODE=fixture` 改成 `official`。固定四家契約要求四把 key 全部存在；缺少任一把時程式會以 `missing_provider_api_keys` 停止，不會退回 fixture 或偷偷跳過某家。

## 零成本 fixture 模式

```powershell
$env:DEVELOPER_API_PROTOTYPE_ENABLED = 'true'
$env:DEVELOPER_API_PROTOTYPE_KEY = '自行設定至少14字元的本機測試key'
$env:DEVELOPER_API_MODE = 'fixture'
npm.cmd start
```

以 `Authorization: Bearer <測試key>` 與至少8字元的 `Idempotency-Key` 呼叫 `POST /v1/measurements`。輸入 `{ "input": { "type": "prompt", "text": "..." } }` 直接使用問題；`type: "url"` 則用模板生成問題。輪詢 `GET /v1/jobs/:id`，再讀取 `GET /v1/measurements/:id`；`GET /v1/usage` 可查看 fixture 的3輪額度。fixture 回應含明確 `fixture_only_no_live_provider_or_web_search` 限制，不能當實際搜尋證據。

雛型預設用記憶體保存結果以完成零成本測試。要保存結果，另需建立**獨立於 A**的 D1 資料庫、手動套用 `services/api/developer-api-migrations/0001_measurement_results.sql`，並設定 `GEOCHECK_DEVELOPER_D1_ACCOUNT_ID`、`GEOCHECK_DEVELOPER_D1_DATABASE_ID`、`GEOCHECK_DEVELOPER_D1_API_TOKEN`；這些設定不是本輪要填的 provider key，也尚未建立或套用。

離線驗證指令：`npm.cmd run test:developer-api`。它不讀取真實 key、不發網路供應商請求。

單次人工 smoke 使用 `npm.cmd run smoke:official-providers -- --twd-per-usd=<匯率>`；D-036 的 20 輪驗證使用 `npm.cmd run benchmark:official-providers -- --twd-per-usd=31.535`，證據以 append-only JSONL 保存並可由 `npm.cmd run verify:official-benchmark` 獨立重算。兩者都不輸出金鑰、回答或引用內容。20 輪已完成，若沒有新計畫、預算與人工授權，不得重跑。
