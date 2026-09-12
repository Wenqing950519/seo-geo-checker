---
type: runbook
project: GeoCheck
product: A — SaaS Dashboard
last_updated: 2026-09-10
status: deployed 2026-09-10 — admission still closed
---

# Product A Dashboard：Cloudflare 部署待辦手冊

> ✅ **第 1–6 節已於 2026-09-10 由使用者執行完成**（見 §8 實測紀錄）。
> 涉及 secret 的步驟由使用者本人執行；Agent 不得經手任何 key 或 token 明文。
>
> ⚠️ **此機器的 `npx` 已損壞**（npm 安裝缺少 `postcss-selector-parser` 相依）。
> 本文件所有 wrangler 指令一律直接呼叫全域 `wrangler`，不可加 `npx`。

## 0. 現況（2026-09-10 實測）

| 項目 | 狀態 | 依據 |
|---|---|---|
| D1 `geocheck-dashboard` | 已建立 | `wrangler.jsonc` `database_id=5f932f38-2077-4575-bfe0-c5a120167856` |
| 三個 migration | 已套用至 remote | `wrangler d1 migrations list … --remote` 回 `No migrations to apply!` |
| `/app-api/v1` Worker 路由 | **本次新增**，尚未部署 | `services/cloudflare/dashboard/src/worker.js` |
| D1 store | **本次新增**，本機測試通過 | `services/api/storage/dashboard-d1-store.js` |
| Runtime secrets | 已設定（2026-09-10） | `wrangler secret list` 回 `DASHBOARD_TOKEN_PEPPER`、`DASHBOARD_ADMIN_TOKEN` |
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

**admission 開關（`DASHBOARD_ADMISSION_ENABLED`）於本文撰寫時維持 `false`。**
改為 `true` 屬 Human Ownership。**已於 2026-09-12 由使用者拍板改為 `true`，見 §9。**

## 8. 實測紀錄（2026-09-10）

部署 version `a2a65e6b-42c8-4f02-8df1-6e0657388df7`（13:41:22Z，使用者執行）；
其後兩次 secret 變更產生新版本，最新為 `e8a34993-02da-4926-992b-9fd973f5d0ee`。

以下皆為 `https://geocheck.lisheng.cv` 的直接觀察：

| 檢查 | 觀察 |
|---|---|
| `GET /app-api/v1/healthz` | HTTP 200，`{"ok":true,"d1":true,"configuration_ready":true,"admission_enabled":false,"missing":[]}`，`Cache-Control: no-store`、HSTS、`nosniff` |
| `GET /app-api/v1/projects`（無憑證） | HTTP 401 `auth_required`，無 `Access-Control-Allow-Origin` |
| `POST /app-api/v1/admin/invitations`（錯誤 admin token） | HTTP 401 |
| `GET /app-api/v1/projects`（帶 `gck_` Developer API key） | HTTP 401 — 產品隔離成立 |
| `GET /app-api/v1/nope` | HTTP 401 — session 檢查先於路由比對，不洩漏路由是否存在 |
| `GET /app/` | HTTP 200 — Pages 前端未受影響 |
| `GET /healthz`（根路徑） | HTTP 404 — **既有狀態**，非本次變更造成；本 Worker 的 route 僅涵蓋 `/app-api/*`。待清理 |

**這證明了什麼**：遠端持久層與正式 `/app-api/v1` route 已接通，且預設失敗關閉、產品隔離成立。
**這沒有證明什麼**：沒有任何真實使用者登入、沒有任何量測資料寫入、沒有驗證排程或 provider runner，
admission 仍為 `false`。不得據此宣稱 Dashboard 可用。


## 9. 追蹤排程 admission 開啟（2026-09-12）

使用者拍板開啟 Product A 的週期追蹤排程。範圍**只有排程**：客戶端付款與 B 的對外
admission 都維持關閉。

| 閘門 | 變更前 | 變更後 | 位置 |
|---|---|---|---|
| A 排程 | `false` | **`true`** | `wrangler.jsonc` `vars.DASHBOARD_ADMISSION_ENABLED` |
| B 內部量測通道 | `false` | **`true`** | B remote D1 `developer_runtime_controls.internal_admission_enabled` |
| B 對外 admission | `false` | `false`（未動） | B remote D1 `developer_runtime_controls.admission_enabled` |
| A 藍新扣款 | 硬性關閉 | 硬性關閉（未動） | `worker.js` 的 notify handler 無條件回 503 `admission_closed` |

A Worker 部署 version `b68d261e-b97e-4ca7-a3d1-90f27e1f4af1`。

**開啟當下的花費是零。** 開啟前先讀了 remote D1：僅 1 個 Project、1 筆 `dashboard_tracking_plans`，
且該計畫的 `next_run_at` 為 `2026-09-18T05:38:05.804Z`；`dashboard_question_sets` 為 **0 筆**。
`startDueRuns()` 對沒有題目的 Project 直接 `continue`，因此在建立並核准題組之前，
即使排程到期也不會產生任何 provider 呼叫。

線上驗收（唯讀）：

| 檢查 | 觀察 |
|---|---|
| `GET https://geocheck.lisheng.cv/app-api/v1/healthz` | `ok:true`、`d1:true`、`tracking_ready:true`、`search_console_ready:true`、**`admission_enabled:true`**、`missing:[]` |
| `GET https://app.lslabs.tw/app-api/v1/healthz` | 同上 |
| `GET https://platform.lslabs.tw/healthz` | `ok:true`、`d1:true`、`queue:true`、`missing:[]` |
| B `developer_runtime_controls` | `admission_enabled='false'`、`internal_admission_enabled='true'` |
| B `developer_internal_callers` | `caller_id='dashboard'`、`status='active'` |
| `wrangler tail geocheck-dashboard`（6 分鐘） | 實際 cron 觸發並輸出 `{"event":"dashboard_tracking_tick","skipped":null,"started":0,"submitted":0,"collected":0,"assembled":0}`。`skipped:null` 證明 `scheduled()` 不再提早返回；`started:0` 是預期值（無到期計畫、無題組），且證明未送出任何 provider 呼叫 |

**這證明了什麼**：排程閘門確實打開，A 的 `scheduled()` 不再提早返回，B 會接受 `caller='dashboard'` 的內部送單。
**這沒有證明什麼**：仍沒有任何真實資料的端到端跑通——需要先建立題組。
第一次真實付費最快發生在 2026-09-18，屆時成本約為「題數 × 四引擎」，
單次觀測值 TWD 2.769745、D-036 P95 TWD 3.490287，內部帳本上限 daily 500／monthly 3000 TWD。

**回滾**：把 `wrangler.jsonc` 的 `DASHBOARD_ADMISSION_ENABLED` 改回 `"false"` 重新部署，
或直接把 B 的 `internal_admission_enabled` 改回 `'false'`（任一道關上即停止送單）。
