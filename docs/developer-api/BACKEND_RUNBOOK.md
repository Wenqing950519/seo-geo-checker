# Developer API 後臺操作手冊

版本 0.2｜2026-09-09｜本文件描述已實作但尚未部署的 private beta 後臺。

## 現在已有什麼

後臺已有邀請與信箱驗證、一次性登入、管理 session、API key 建立／列出／撤銷、tenant 隔離、持久 job、idempotency、原子配額預留、四家 attempt、成功才扣一輪、成本 ledger、結果期限與刪除 tombstone、管理 overview／安全事件及全域 admission 開關。B D1 與單庫 Worker gateway 已建立；視覺前端、付款、正式寄信服務與公開 customer API 不在本次範圍。

API 契約見 [openapi.yaml](openapi.yaml)。客戶 API key 只能用 customer routes；console session 只能用 `/v1/console/*`；管理 token 只能用 `/v1/admin/*`。

## 本機驗證

設定 `.env`：

```text
DEVELOPER_API_PLATFORM_ENABLED=true
DEVELOPER_API_MODE=fixture
DEVELOPER_API_LOCAL_DB_PATH=.local/developer-platform.db
DEVELOPER_API_TOKEN_PEPPER=<至少 32 bytes 的隨機值>
DEVELOPER_API_QUOTA_WINDOW_STRATEGY=rolling_24h
DEVELOPER_API_RESULT_RETENTION_DAYS=<人工核准天數>
DEVELOPER_API_DAILY_BUDGET_TWD=<人工核准日上限>
DEVELOPER_API_MONTHLY_BUDGET_TWD=<人工核准月上限>
DEVELOPER_API_MAX_JOB_COST_TWD=<每工作保守預留>
DEVELOPER_API_TWD_PER_USD=<本期固定換算率>
ADMIN_TOKEN=<至少 20 字元的隨機值>
```

執行 `npm.cmd run test:developer-api`。啟動服務用 `npm.cmd start`。fixture 不會呼叫或計費四家供應商；official 模式仍要求四把 provider key 同時存在。

## 獨立 D1

Developer API 不得使用產品 A 的 `CLOUDFLARE_D1_DATABASE_ID`。共享環境清空 `DEVELOPER_API_LOCAL_DB_PATH`，設定：

```text
GEOCHECK_DEVELOPER_D1_GATEWAY_URL=https://geocheck-developer-d1-gateway.bgo-career.workers.dev
GEOCHECK_DEVELOPER_D1_GATEWAY_TOKEN=<與 Worker GATEWAY_TOKEN 相同的 secret>
```

schema 變更由人工登入 Wrangler 後執行：

```text
npm.cmd run migrate:developer-platform
npm.cmd run verify:developer-platform
```

程式在 gateway 值缺一、同時設定本機 DB 與 gateway、或同時設定 gateway 與舊 REST credentials 時會拒絕啟動。Worker 用 D1 binding 限定資料庫；Render 不需要 Cloudflare 帳戶級 D1 token。兩端 secret 不得進入 repo、log 或前端。

## Private beta 操作順序

1. 管理員 `POST /v1/admin/invitations`，以已核准的寄信流程把單次 token 交給受邀者。
2. 使用者驗證後進入 key 管理；`POST /v1/console/activation` 選 `free` 才開始七日試用，Basic／Premium 目前固定回 `payment_required`。
3. 建立 API key；完整 secret 只回一次。用該 key 提交 measurement，輪詢 job／result。
4. 若四家或帳務異常，管理員立即把 `/v1/admin/admission` 設為 false；先對帳再恢復。

## 尚不能宣稱上線完成

quota window、結果保存天數與 production budget 已採使用者核准值；正式寄信供應商、事故負責人及付款規則仍待人工決定。official platform mode 若缺成本預算或匯率會拒絕啟動；每個工作會同時在日／月窗預留成本，unknown 成本保守吃掉完整預留。HTTP rate limit 目前是單一 process 記憶體控制，不是跨 replica 的 edge rate limiter；正式公開前仍需邊緣層 WAF／rate limit、備份還原演練與真實寄信驗收。
