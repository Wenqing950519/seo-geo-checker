---
type: runbook
project: GeoCheck
product: A — SaaS Dashboard
last_updated: 2026-09-10
status: prepared — not executed
---

# Product A Dashboard：Cloudflare 部署待辦手冊

> ⚠️ **本文件中的所有指令皆尚未執行。** 每一段都需要使用者明確授權後才可執行。
> 涉及 secret 的步驟由使用者本人執行；Agent 不得經手任何 key 或 token 明文。

## 0. 現況（2026-09-10 實測）

| 項目 | 狀態 | 依據 |
|---|---|---|
| D1 `geocheck-dashboard` | 已建立 | `wrangler.jsonc` `database_id=5f932f38-2077-4575-bfe0-c5a120167856` |
| 三個 migration | 已套用至 remote | `wrangler d1 migrations list … --remote` 回 `No migrations to apply!` |
| `/app-api/v1` Worker 路由 | **本次新增**，尚未部署 | `services/cloudflare/dashboard/src/worker.js` |
| D1 store | **本次新增**，本機測試通過 | `services/api/storage/dashboard-d1-store.js` |
| Runtime secrets | **未設定** | 未設定時所有 `/app-api/v1` 回 503 `configuration_incomplete` |
| Admission | `false`（關閉） | `wrangler.jsonc` `vars.DASHBOARD_ADMISSION_ENABLED` |
| Provider runner／排程 | 未實作 | `scheduled()` 仍是空的 admission-gated stub |

## 1. 前置：確認要部署的分支與測試

```bash
git rev-parse --abbrev-ref HEAD
```

```bash
npm.cmd test
```

全綠才可繼續。測試失敗時不得部署。

## 2. 產生並設定 runtime secrets（**由使用者執行**）

Worker 需要兩個 secret，缺任一個都會讓 `/app-api/v1` 失敗關閉：

| Secret | 用途 | 最小長度 |
|---|---|---|
| `DASHBOARD_TOKEN_PEPPER` | session／invitation token 的 hash pepper | 32 bytes |
| `DASHBOARD_ADMIN_TOKEN` | `/app-api/v1/admin/invitations` 的管理驗證 | 20 bytes |

選用（只有要啟用 GSC 連接時才需要）：

| Secret | 用途 |
|---|---|
| `GSC_TOKEN_ENCRYPTION_KEY` | 加密保存 Google refresh token |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | A 的 Google 登入與 GSC 授權 |

產生隨機值（在你自己的終端執行，不要把輸出貼給任何人）：

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

逐一寫入（指令會互動式要求貼上值，值不會進入 git）：

```bash
wrangler secret put DASHBOARD_TOKEN_PEPPER --config services/cloudflare/dashboard/wrangler.jsonc
```

```bash
wrangler secret put DASHBOARD_ADMIN_TOKEN --config services/cloudflare/dashboard/wrangler.jsonc
```

> **Google OAuth secret 旋轉是前置條件。** 依 `docs/CURRENT_STATE.md`，現有 OAuth client secret 曾出現在自動化觀察中。
> 必須先在 Google Cloud Console 由人工旋轉，才可寫入任何 Worker secret store。
> 在旋轉完成前，不要設定 `GOOGLE_OAUTH_CLIENT_SECRET`。

## 3. 確認 migration 狀態（唯讀）

```bash
wrangler d1 migrations list geocheck-dashboard --remote --config services/cloudflare/dashboard/wrangler.jsonc
```

預期：`No migrations to apply!`。若有待套用項目：

```bash
wrangler d1 migrations apply geocheck-dashboard --remote --config services/cloudflare/dashboard/wrangler.jsonc
```

## 4. 部署前 dry-run（不上線）

```bash
wrangler deploy --dry-run --config services/cloudflare/dashboard/wrangler.jsonc
```

預期：bundle 成功、綁定顯示 `env.DASHBOARD_DB (geocheck-dashboard)`、
`DASHBOARD_ADMISSION_ENABLED ("false")`、`DASHBOARD_PAYMENT_MODE ("sandbox")`。

## 5. 部署（**需要使用者明確同意；這是對外發布**）

`wrangler.jsonc` 已宣告 route `geocheck.lisheng.cv/app-api/*`。部署會讓該路徑由本 Worker 接管。

- Pages 仍服務 `/app/*`（前端）
- audit Worker 仍服務 `/api/*` 與 `/report/*`
- 本 Worker 只擁有 `/app-api/*`

```bash
wrangler deploy --config services/cloudflare/dashboard/wrangler.jsonc
```

## 6. 部署後人工驗收

### 6.1 健康檢查（應為 200，且 `admission_enabled: false`）

```bash
curl -sS -i https://geocheck.lisheng.cv/app-api/v1/healthz
```

預期 JSON：`ok: true`、`d1: true`、`configuration_ready: true`、`admission_enabled: false`、`missing: []`。
若 secrets 未設定則回 503 且 `missing` 會列出缺少的名稱——這是預期的失敗關閉行為。

### 6.2 未帶憑證時必須 401（不得 200）

```bash
curl -sS -i https://geocheck.lisheng.cv/app-api/v1/projects
```

預期：`401`、`auth_required`、`Cache-Control: no-store`、無 `Access-Control-Allow-Origin`。

### 6.3 錯誤的 admin token 必須 401

```bash
curl -sS -i -X POST https://geocheck.lisheng.cv/app-api/v1/admin/invitations -H "X-Dashboard-Admin-Token: wrong" -H "Content-Type: application/json" -d "{\"email\":\"probe@example.com\"}"
```

### 6.4 受控登入 smoke（使用內部帳號，**由使用者執行**）

用正確的 `X-Dashboard-Admin-Token` 建立一組邀請 → `/app-api/v1/auth/verify` 換 session →
`GET /app-api/v1/projects` → `POST /app-api/v1/projects`。
確認資料真的寫進遠端 D1：

```bash
wrangler d1 execute geocheck-dashboard --remote --command "SELECT COUNT(*) AS accounts FROM dashboard_accounts;" --config services/cloudflare/dashboard/wrangler.jsonc
```

### 6.5 產品隔離抽查

確認回應中不含 `tenant`、`api_key`、`quota`、`cost` 等 Developer API 概念。

## 7. 尚未涵蓋、不得宣稱完成的項目

| 缺口 | 影響 |
|---|---|
| `scheduled()` 仍是空 stub | 沒有真實週期追蹤；`/app` 的資料只會來自可信 orchestration 寫入 |
| provider runner 未接 | 「Run → evidence → dashboard」閉環未打通 |
| A 的 Google OAuth 未設定 | A 端登入與 GSC 連接不可用 |
| NewebPay callback 仍 admission-gated | 無正式扣款 |
| 無 WAF／rate limit／告警／備份還原演練 | 不具備公開營運保護 |

**admission 開關（`DASHBOARD_ADMISSION_ENABLED`）維持 `false`。**
改為 `true` 屬 Human Ownership，且需先記入 `docs/DECISION_LOG.md`。
