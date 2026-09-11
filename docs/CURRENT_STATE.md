---
type: current-state
project: GeoCheck
last_updated: 2026-09-10
tags:
  - geocheck
  - current-state
---

> [!note] 本檔原名 `CURRENT_OPERATIONAL_STATUS.md`，2026-07-25 移入 `docs/` 成為 Contract 指定的 `CURRENT_STATE.md`。
> 內容未經改動。此檔為營運現況的共同事實來源；狀態變更時必須更新此處，不得只寫在對話或記憶中。

# GeoCheck 當前運作狀態

## 最新產品方向（決策不等於實作）

依 D-040／D-041／D-046，產品方向已確認為「短測引流 → SaaS Dashboard → 診斷型 Agent」，Developer API 作共用四引擎量測基礎並可作外部技術產品；未來台灣付款優先採藍新金流。Dashboard Paid Beta 契約為 TWD 330／訂閱週年月、6 個 active Projects、每期共享 24 次手動更新與固定 Asia/Taipei 每日最多 6 次；Free 為 2 個 active Projects、每週自動追蹤、無手動更新。這是待驗證的 Beta 商業契約，不是實收、毛利或留存證據。付款、排程與 provider runner 均必須預設 admission closed；目前沒有可據此新增的遠端 D1、Worker、藍新商店、正式扣款或公開流量證據。

`[本機後端 foundation 2026-09-10]` Product A Dashboard 已新增 feature-gated 的 `/app-api/v1` 契約、Project membership、週追蹤 Run／evidence schema、SQLite 測試 store 與隔離測試；它使用獨立 `gds_` session、Dashboard admin credential 與 `dashboard_*` tables，不能存取 Developer API key、tenant、quota、cost 或 `/v1/console`。Tracking Run 寫入仍只允許可信的 Product A orchestration，而非 browser client。

`[Google Cloud 設定進度 2026-09-10]` 已建立獨立 GeoCheck Google Cloud project（Themap project 未變更）、啟用 Search Console API、建立 external consent screen 與單一 Web OAuth client，並登錄 A normal／A GSC／B 三個固定 callback URI 及 `webmasters.readonly` scope。Google branding 已保存正式首頁、隱私政策與服務條款 URL；授權網域為 parent domain `lisheng.cv`，可涵蓋 `geocheck.lisheng.cv`。GSC callback 只呈現可匹配 Project 網域的 property，待使用者明確選擇才建立 connection。B 的跨 Worker PKCE state migration 已套用到獨立 B D1，並已部署同源 `https://api.geocheck.lisheng.cv/developers-console`（HTTP 200）；未設 OAuth secret 時 B login start 確認回 503／`no-store`。A 的 runtime persistence、OAuth runtime secrets、網域驗證／scope verification 與受控 live smoke 尚未完成。現有 OAuth client secret 曾出現在自動化觀察中，必須先人工旋轉後才可存入 secret store；故 A GSC 仍 feature-gated，沒有 Google 核准或公開可用的證據。

`[公開頁驗證 2026-09-10]` 正式 `https://geocheck.lisheng.cv/privacy`、`/terms` 與 `/refund` 曾回 HTTP 404；根因是既有 Cloudflare Pages artifact 沒有包含新靜態檔，而非 Render 發佈問題。已將可重現的 Pages artifact（`apps/web/public` 加上 `apps/web/app`）部署至既有 `geocheck-web` Pages project；三個法務 URL 均直接回 HTTP 200，`/app/` 回 Dashboard HTML，`/app/app.js` 回 JavaScript。`/api/*` 與 `/report/*` 仍保留給 audit Worker。這使 Google branding URL 可被驗證，但不代表 OAuth scope 已獲核准。

`[B Console 同步 2026-09-10]` `https://api.geocheck.lisheng.cv/developers-console` 已部署 version `02480ab7-4500-467a-b33b-abf625aeb592` 並回 HTTP 200、HSTS 與 `nosniff`。Console 不再接受手動任意 session、建立瀏覽器本機 API key 或顯示假任務；Google callback 寫入的 B session 會再經 `/v1/console/usage`、`api-keys`、`jobs` 驗證，所有試用、額度、金鑰建立／撤銷與任務清單改走 B API。B Google OAuth 的 readiness 現只依賴 B platform 與 OAuth secrets，不再錯誤依賴四家 provider key；未設定這些 OAuth secrets 時，live `/v1/auth/google/start` 已確認回 503／`no-store`／`Google sign-in is not ready`，不能宣稱可登入或可量測。

`[A Dashboard 同步 2026-09-10]` A browser app 的 fixture mode 已改為預設關閉；網路或 API 失敗會顯示失敗，不再靜默改以 fixture 偽裝為真實 Dashboard。已登入時，Project、entitlement、overview、performance、questions、citations 與 data-quality 皆從 `/app-api/v1` 讀取；新增 Project 走 server API，單題本機模擬與 evidence fixture fallback 已移除。此介面已隨 Cloudflare Pages 主站發佈；A dashboard Worker 也已部署為 version `e69b38d0-71d7-48f8-9e88-ffcc68665254` 至 workers.dev，health endpoint 回 200、`admission_enabled:false` 與 `no-store`。但它仍是 feature-gated skeleton，尚未有等價 D1 store、正式 `/app-api/v1` route、runtime persistence 或 OAuth secrets。因此公開 `/app/` 是真實前端而非可用 Dashboard，不得宣稱 A login、Project API 或 GSC 已可公開使用。

`[A 追蹤排程接通內部通道 2026-09-11]` D-047 階段 2 已實作並部署。A Worker 的 `scheduled()` 不再是空 stub：每次 tick 認領到期的 `dashboard_tracking_plans`、依題組拆成每題一筆 dispatch、送入 B `/internal/v1/measurements`、輪詢取回結果，待該 job 的所有 dispatch 皆終局後組成一次 Tracking Run。採輪詢而非 B 回呼 A，以免多開一個需要保護與維運的反向通道。新增 `dashboard_tracking_dispatches` 表與 `dashboard_tracking_jobs.run_id／question_set_id／scheduled_at`。

線上狀態：A Worker version `62b9d865-be2f-4e4b-a20d-ccd712d1f6a5`、B Worker version `db7785d9-4381-4704-80f0-aaf88217da43`；A remote D1 已套用 `0005_dashboard_dispatches.sql`。線上唯讀驗收：A `/app-api/v1/healthz` 回 `ok:true`、`d1:true`、`tracking_ready:false`；B `/healthz` 回 `ok:true`、`queue:true`；`/internal/v1/*` 無憑證與錯誤憑證皆回 401；兩個 admission 開關皆為 `false`；`/app/` 200、A 無憑證 401、A Google 登入 302 均未受影響；dispatch 表存在且為 0 筆。

`tracking_ready:false` 是預期狀態且為刻意設計：`DASHBOARD_INTERNAL_CALLER_SECRET` 尚未設定，`scheduled()` 因此直接返回，不可能意外送出付費呼叫。設定該 secret 需要 B 的 `ADMIN_TOKEN` 輪替一把 caller secret，屬使用者操作。

測試以模擬 D1 與 stub 過的 B client 覆蓋：開關關閉時零呼叫、認領到期計畫與 dispatch 皆為原子且不重送、idempotency key 依 job 與 question 固定、送出重試有上限且放棄不計為一次嘗試、失敗或未送達的題目仍補滿四筆 `failed` 觀測以免分母縮小、失敗觀測維持 `null` 不寫 0、mention 與 first-party citation 直接採用 B 的 analysis 不另行重算。**尚未驗證**的是真實資料的端到端跑通：需要使用者設定 caller secret、建立 Project 與題組，並開啟兩個 admission 開關；這會產生真實付費呼叫。

`[內部量測通道付費驗證通過 2026-09-11]` 依 D-047 實作的 B 內部通道已部署並完成一次真實付費驗證。remote D1 已套用 `0005_internal_channel.sql`。單次內部量測 `job_1784de66-d5ff-43e0-8894-a928302843c5`／`msr_6cdf92d2-7b67-40fc-bd6c-2fcfc46a9169` 結果：

| 觀察 | 值 |
|---|---|
| 工作狀態 | `succeeded` |
| provider attempt | 4 次、4 個 engine、4 成功（符合 D-029 全成才成功） |
| 來源歸屬 | `caller='dashboard'`、`tenant_id='tnt_internal_dashboard'` |
| 成本預留 | `scope='internal'`、`status='charged'` |
| 預扣 → 實際 | TWD 12 → **TWD 2.769745**，差額已釋放（`reserved` 歸零） |
| 內部帳本 | daily 2.769745／500、monthly 2.769745／3000 |
| **客戶預算列** | **0 筆** |
| **客戶配額視窗／預留** | **0 筆／0 筆** |
| 結果保存 | 1 筆，可供 A 讀取 |

實際成本 TWD 2.77 低於 D-036 的 P95 TWD 3.490287，屬合理範圍；這是單次觀測，不足以取代新的 P95 統計。**這證明**內部通道的身分、歸屬、獨立預算與客戶隔離在正式環境成立。**這不證明**排程、A 的送單與寫回可用——A 仍未呼叫此通道。驗證後通道已改回 `internal_admission_enabled='false'`。

`[憑證盤點與輪替 2026-09-11]` 使用者盤點密碼管理器後補齊三把先前以管線寫入、從未留存的 secret：`DASHBOARD_TOKEN_PEPPER`、`DASHBOARD_GOOGLE_OAUTH_STATE_KEY`、`DEVELOPER_GOOGLE_OAUTH_STATE_KEY`，全部重新產生並存檔。選在此時輪替是因為系統僅有 1 個 Dashboard 帳號，pepper 變更的代價最低。輪替後線上驗收：A `google_sign_in_ready:true`、A 與 B 的 `/auth/google/start` 均回 302、Dashboard 帳號仍為 1 筆未受影響。`DEVELOPER_API_PROTOTYPE_KEY` 經確認只用於本機雛型模式，兩個 Worker 皆未設定，屬已淘汰憑證。內部通道 caller secret 前綴已由 `gci_int_`（與 B 邀請碼 `gci_` 混淆）改為獨立的 `gcint_`。

`[A Dashboard Google 登入上線 2026-09-11]` A Dashboard Worker 已掛載 Google 登入並部署。remote D1 已套用 `0004_dashboard_oauth_state.sql`（`dashboard_google_oauth_states` 已存在），A Worker secrets 為 `DASHBOARD_TOKEN_PEPPER`、`DASHBOARD_ADMIN_TOKEN`、`DASHBOARD_GOOGLE_OAUTH_STATE_KEY`、`GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`。線上唯讀驗收：`GET /app-api/v1/healthz` 回 `ok:true`、`d1:true`、`configuration_ready:true`、`google_sign_in_ready:true`、`admission_enabled:false`、`missing:[]`；`GET /app-api/v1/auth/google/start` 回 302 導向 Google，帶正確 client ID、`redirect_uri=https://geocheck.lisheng.cv/app-api/v1/auth/google/callback`、`scope=openid email profile`（未要求 GSC scope）、PKCE `S256` challenge 與 `HttpOnly; SameSite=Lax; Secure` nonce cookie；該次 start 在 remote D1 留下一列 `audience='dashboard'`、`session_token` 與 `project_id` 皆為 NULL、具未來 expiry 的 PKCE state，證明跨 isolate 的狀態保存在雲端實際運作。產品隔離仍成立：以 `gck_`、`gcs_` 或無憑證存取 `/app-api/v1/projects` 皆回 401；B `/healthz` 不受影響回 200。

**限制**：Google 登入不會自動建立帳號，`loginGoogleAccount` 僅接受既有 verified 帳號，未受邀 email 回 403（已由 `tests/dashboard-google-login.test.js` 覆蓋）。GSC 連接路由未掛載於 A Worker，仍不可用。**尚無任何真人完成登入**，且 `scheduled()` 仍為空 stub、量測閉環未接、admission 維持 `false`，不得宣稱 Dashboard 已可交付使用者。

`[開發者入口路由修正 2026-09-11]` `/developers/console` 與 `/developers/docs` 之前在 Cloudflare 上都不存在（Node server 有、雲端沒有），使用者完成 Google 登入後會落在 404。已修正並部署：Console 由 B API 同源提供（`api.geocheck.lisheng.cv/developers/console`，連字號版同頁 200），文件頁改為實體檔案 `apps/web/public/developers/docs.html`，公開站 `/developers/docs` 直接回 200、`/developers-docs` 一跳轉入。修正過程中曾兩度造成正式站轉址迴圈，根因有二：(1) `apps/web/public/_redirects` 同時是 Pages 設定與 B Worker 的 assets 設定，指向絕對 origin 的規則會在該 origin 上轉向自己；(2) Pages 會把 extensionless 路徑對應到 `.html`，因此以 `.html` 為目標的規則會退化成轉址並與反向規則互踢。兩者都已加測試阻擋。最終線上驗收：公開站 `/`、`/developers`、`/developers/docs`、`/developers-docs`、`/app/`、`/privacy`、`/terms`、`/refund` 全部最終 200 且最多一跳；B `/developers/console`、`/developers-console`、`/healthz` 皆 200 零跳。

`[B Google 登入就緒 2026-09-11]` 使用者已人工旋轉曾外露的 Google OAuth client secret，並設定 `GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET` 與 `DEVELOPER_GOOGLE_OAUTH_STATE_KEY`。`GET /v1/auth/google/start` 已從 503 `Google sign-in is not ready` 變為 302 導向 Google，帶正確 client ID、callback 與 PKCE challenge。另確認 B 的四家 provider secret（OpenAI、Gemini、Perplexity、Anthropic）與 `ADMIN_TOKEN`、`DEVELOPER_API_TOKEN_PEPPER` 皆已設定，`/healthz` 回 `ok:true`、`d1:true`、`queue:true`、`missing:[]`。這代表 B 的登入路徑技術上可用，**但尚無任何真人登入 smoke**，admission 仍為 `private beta not released`。A Dashboard 的 Google 登入仍未接入 Cloudflare Worker，A 端無法登入。

`[A Dashboard 遠端 runtime 2026-09-10]` Product A Dashboard Worker 已由 30 行 skeleton 改為實際掛載 `/app-api/v1`：新增 `services/api/storage/dashboard-d1-store.js`（綁定 `DASHBOARD_DB` D1，與 `dashboard-store.js` 同一組 38 個方法），Worker 改用共用的 `dashboard-api-http.js` handler 而非第二份路由表。`dashboard-api-http.js` 的本機 SQLite store 改為注入（`createSqliteDashboardStore`），使 Workers bundle 不再含 `node:sqlite` 或 `__dirname` migration 讀檔；wrangler dry-run bundle 98.81 KiB 已驗證。D1 沒有互動式交易，原本 `BEGIN IMMEDIATE` 保護的邀請碼消耗與手動更新配額改以單一 `batch()` 內的條件式寫入表達，並以真實 SQLite 模擬 D1 binding 的契約測試覆蓋：邀請碼只能消耗一次、過期邀請不可用、期間配額與 Asia/Taipei 每日 6 次上限由寫入本身把關、job 結算冪等且 reservation 只計費一次、NewebPay 事件重放被忽略、撤銷 GSC 連接會刪除已匯入指標；另以四個讀模型比對 D1 與 SQLite store 輸出一致。`wrangler.jsonc` 新增 route `geocheck.lisheng.cv/app-api/*`（Pages 仍持有 `/app/*`，audit Worker 仍持有 `/api/*` 與 `/report/*`），並新增 `/app-api/v1/healthz`。`npm.cmd test` 全綠（含新增的 `dashboard-d1-store` 與 `cloudflare-dashboard-worker-bundle`）。

`[A Dashboard 上線驗收 2026-09-10]` 使用者已部署 version `a2a65e6b-42c8-4f02-8df1-6e0657388df7` 並設定 `DASHBOARD_TOKEN_PEPPER` 與 `DASHBOARD_ADMIN_TOKEN`。線上唯讀驗收：`GET /app-api/v1/healthz` 回 200 且 `d1:true`、`configuration_ready:true`、`admission_enabled:false`、`missing:[]`；無憑證存取 `/app-api/v1/projects` 回 401；錯誤 admin token 回 401；以 `gck_` Developer API key 存取 A 路由回 401（產品隔離成立）；`/app/` 仍回 200。`geocheck.lisheng.cv/healthz` 回 404 屬既有狀態，非本次變更造成。完整證據見 `docs/product/dashboard/CLOUDFLARE_RELEASE.md` §8。

**這仍不是可用的 Dashboard。** `scheduled()` 仍是空的 admission-gated stub、provider runner 未接、A 的 Google OAuth 未設定、admission 維持 `false`。部署與人工驗收步驟見 `docs/product/dashboard/CLOUDFLARE_RELEASE.md`（所有指令皆尚未執行）。

`[本機前端 client 2026-09-10]` Product A Marketing Dashboard 前端已於 `apps/web/app/` 完成建置（參照 Themap 專案之分頁獨立子資料夾架構：`overview/`、`performance/`、`questions/`、`citations/`、`quality/`、`evidence/`、`auth/`，共用模組於 `shared/`）；透過原生零構建 ES Module 提供高效能 SPA，對標 Ahrefs / GA4 / Brandlight / Weimob GEO，完全符合 `DASHBOARD_UI_SPEC` 與 `FRONTEND_ACCEPTANCE`（4 項明確分子分母率值、跨期題組版本斷點隔離、不可變題組版本升級、五大驗收情境沙盒、事證抽屜 30 秒查閱、全無 Developer 概念洩漏）。這不是遠端部署、排程 worker 或金流完成的證據。

`[主分支合併與接口串聯 2026-09-10]` `codex/cloudflare-full-migration` 已全數快進合併（ff-only）至 `main`（commit `cf613e9`）。已完成產品 A（行銷儀表板 `/app`）與產品 B（開發者平台 `/developers`、`/developers/docs`、`/developers/console`）的前後端接口路由掛載、跨產品導航串聯、`/developers-console` 路由別名掛載，以及 Google OAuth redirect 統一指向 `/developers/console`；全域 46 項測試套件全數通過（100%）。

## 本機目錄整理（2026-09-08，尚未部署）

依 D-026，主程式改為 `services/api/server.js`，A 資源／報告組裝在 `apps/web`，核心與 adapters 在 `packages`，測試在 `tests/regression`，研究資料集中 `research/inputs`、`outputs`、`sources`、`work`。`mock-api` 保留啟動與 import 相容 wrapper，以及既有 env／ledger 路徑。根目錄 README 與搬移表是新位置索引。

搬移前後完整測試通過；另驗證新舊 HTTP 入口、首頁／資源位元一致及 mock 報告 JSON／HTML／Markdown，未連外量測。本次沒有新增 SDK、Developer Console、Account／Project 或 Monitoring，沒有改 scoring／query policy，也沒有部署。以下歷史線上驗證紀錄仍按其原日期解讀。

依 D-027／D-028，Developer API 的搜尋供應商為 OpenAI、Google Gemini、Perplexity、Anthropic 官方 API 直連，不採 OpenRouter 作為正式量測路由。GPT-5.6 Luna、Gemini 3.5 Flash-Lite、Perplexity Sonar、Claude Haiku 4.5 已於 2026-09-09 以同一固定 prompt 各完成一次本機帳號 smoke，四家都回成功、搜尋執行證據與至少一筆引用；這只證明當次帳號、model ID、request／parser 可用。將 `DEVELOPER_API_MODE=official` 時，程式要求四家 server-side API key；缺任一把即以 `missing_provider_api_keys` 停止。DeepSeek 只保留為未決的統合輸出選項，不是量測 engine，也不參與分數。

依 D-029／D-037／D-038，Developer API 是不影響產品 A 的附屬產品：每個已接受的分析固定執行四家，不提供客戶逐次選擇。四家全數完成才是 `succeeded` 並向客戶計一次完整 request；任一家最終失敗則整體 `failed` 且不向客戶計費，但回傳其他已完成供應商的 `partial_results`。B0～B2 後臺已有帳戶邀請／登入、API key、tenant 隔離、SQLite／獨立 D1 store、持久 job、lease/fencing、原子配額、provider attempt、成本／安全 ledger、結果 expiry／刪除，以及 customer／console／admin API；本機與 HTTP 測試已通過。沒有視覺前端、金流、正式寄信服務、任意 URL 抓取或公開 customer API。

依 D-030，Developer API 的 Beta 商業方向為無綁卡 7 天試用，每天最多 3 輪，期滿不自動訂閱；暫定 Basic TWD 660／80 輪、Premium TWD 1,390／170 輪。只有四家全成才扣輪數。D-036 的 20 輪受控 benchmark 於 2026-09-09 完成：20／20 四家全成、P95 單輪成本 TWD 3.490287、最高 TWD 3.69144、最慢回合 12.948 秒，保守總成本 TWD 53.304851，四項門檻全數通過。使用者同日回報自接入後四家供應商後台累計 USD 1.093／TWD 34.467755；此值可能包含 benchmark 前 smoke 且未附帳單匯出，只能核對總預算，不能取代每輪 P95。這仍未包含 retry、失敗輪、基礎設施、金流、支援或真實客戶價值，不能直接確認毛利或 SLA。目前沒有串金流、建立訂閱或啟用免費流量。Platform mode 必須明確選本機 SQLite 或獨立 B D1。`geocheck-developer-api` D1 已以 APAC hint 建立並套用三個 migration；`geocheck-developer-d1-gateway` Worker 只綁定該資料庫，使用獨立 secret 驗證，Render 已保存 gateway URL／secret，未建立帳戶級 D1 token。線上唯讀 schema probe 經 gateway 成功看到 17 個 `developer_*` tables；未驗證正式 customer API，因目前 Render 線上版仍是舊 commit。客戶結果序列化大小上限為 512 KiB。

線上 gateway 授權 batch write／read 亦已驗證；全域 admission 已設為 `false`／`private beta not released`，避免後臺正式發布前接單。

2026-09-09 另完成 API／IT／資安審計：付費 probe 與營運狀態端點改為強制 admin token；`/v1` 禁快取與 wildcard CORS、遮蔽 tenant／上游成本／原生 metadata；token 固定時間比較；Gemini 關閉預設保存；provider response 限 2 MiB；URL 輸入拒絕 localhost、IP literal 與非預設埠；服務回應加入基礎安全標頭。完整證據、限制與人工門檻見 `developer-api/AUDIT_2026-09-09.md`。`packages/sdk` 仍只有邊界文件，沒有可安裝 client。

D-036 benchmark 的固定題組、append-only 事件、獨立 summary 與重算工具均已保存；只記錄問題 hash、公開 reference URL、模型、usage、成本、延遲與數量，不保存回答或引用正文。完整報告見 `developer-api/BENCHMARK_2026-09-09.md`。技術前置門檻已通過，可進入前端／技術文件／API 管理 dashboard 的規劃，但尚未授權部署或公開營運。

更新日期：2026-09-10

附屬 API 的設計交接已整理至 `developer-api/HANDOFF.md`、`BLUEPRINT.md`、`SECURITY.md`，含候選客群、使用者流程、輸入／輸出、成功與扣量、配額／成本帳本、防濫用、資安與驗收案例。D-036 已授權並完成 20 輪付費前置驗證；除此之外，客群、配額窗、保存期限與付費週期仍依交接表待人工確認，沒有新增帳戶、金流、前端、部署或公開流量。舊單引擎 B／客戶選引擎草案由 D-029 固定四家決策取代。

## 已完成

- `[白皮書研究 Wave 0 基準波已完成 2026-09-09]` 信義區餐廳追蹤研究（xinyi-dining-h2-2026-wave0）正式收數與基準報告完成。以 Reviewed Entity Master（63 家門市實體）映射至 49 個去重官方根網域，100% 通過 `assertReviewedEntityCoverage` 契約驗證。採用經核定凍結之三大真實情境題組（v2.0，SHA-256 `8b30d91a3a74b46d29338fd4034fe68feb44a338d2c98530b51109b7be3c5954`）。37 站完整量測成功，12 站技術受限（WAF/SPA）標記 `unknown` 不補 0。全域 111 次獨立查詢驗證了官方網域引用率 0% 的重大發現，以及三大情境破零代表（WILDWOOD、饗食天堂、合‧shabu）與霸榜心智。資料集 SHA-256：`03a0f5eb0053e45e40bbd86ce695e04e35fb0c4d087a132cdc1b689143d84907`。完整基準報告位於 `research/outputs/xinyi-dining-h2-2026-wave0/wave0-baseline-report.md`。
- `[正式站已驗證 2026-09-02]` AI Trust Index v1.0.0 已取代產品／報告的主分數：可見答案採用率 65%、已驗證第一方官方 URL 來源證據 35%。GEO Core 保留兩層、query-run 分母與原始證據；站內準備度與建議不進入此分數。
- `[正式站已驗證 2026-09-02]` 無有效可見回答時，AI Trust Index 為 `unknown`／`null`，不補成 0；少於兩個有效 query-run 時封頂 69。API、HTML 報告與 Markdown 已共同呈現此狀態、provider/model 與限制；舊 GEO V3 僅存 `legacy_geo_score` 供歷史追溯。

- `[歷史 V3]` Algorithm V3.0.0 曾採 GEO-first：Perplexity 搜尋觀測 50%、內容可引用性 30%、必要技術存取 20%。既有 V3 資料保留追溯，不併入 AI Trust Index v1 或新白皮書統計。
- `[歷史 V3]` Perplexity 無法量測時，整體 GEO 分數為未知；站內準備度不得冒充 GEO 分數。
- `[已確認 2026-09-06]` DeepSeek 不參與計分。單站報告由 DeepSeek 先辨識產業並產候選題，再由後端選四題交給 Perplexity；若首輪候選不合格會重產一次，仍無法選出四題時停止 Perplexity 並正確標示 `unknown`。這個保守路徑已驗證，但「自動題型備援是否可進入產品量測」尚待使用者決策。
- `[已啟用 2026-09-06]` 專用 `geocheck-reports` D1（APAC；`audit_reports` migration 已遠端驗證）保存單站成功報告，並以網站、題組模式／內容與 pipeline 版本作為快取身分；同題組且未過期才重用，避免不同自訂題或版本誤用舊結果。Render 已使用帳戶範圍的最小 D1 編輯權限 token 啟用持久保存；公開唯讀狀態端點已確認 `reportStore.enabled: true`，未以付費稽核作為驗證。
- 網站與 Skill 共用 `mock-api/lib/geo-measurement.js`，並由同步測試阻止權重漂移。
- 白皮書先由 DeepSeek 草擬候選題並強制人工審核凍結；使用兩題題庫時每站 Perplexity 3 次、DeepSeek 描述 1 次，並保留獨立硬上限、JSONL 續跑與資料集雜湊。正式 batch 會在任何 provider 設定或付費呼叫前，拒絕未覆蓋、pending、缺品牌／官方網域，或共用網域未明確對應 owned URL 的 entity-master 樣本。
- DeepSeek 改採官方 API 直接呼叫；單站結構化判讀的備援順序為 DeepSeek → GPT-5.6 Luna → Gemini，並記錄實際 provider。白皮書批次明確禁用備援，避免同一 cohort 靜默混用模型；部署後仍須以健康檢查驗證金鑰與連線。
- 後台維持無公開入口的 `/<ADMIN_PATH_TOKEN>`，並以 `ADMIN_TOKEN` 驗證用量與研究代理請求。
- GA4 使用者旅程 tracking schema v1.0 已在 repo 完成：涵蓋 landing、CTA、URL submit、分析開始／完成／失敗、報告查看、下一步、第二次分析與 lead submit；UTM 於同一 browser session 跨首頁／報告頁保留，受測網址與聯絡個資不送入自訂事件。已完成本機流程與去重測試；正式站部署後仍須以 GA4 DebugView／Realtime 驗收實際收件。
- `[已確認 2026-08-14]` Product Activation 定義為 `result_viewed`，Business Conversion 定義為 `lead_submitted`，兩者為目前僅有的 GA4 Key Events。`second_analysis` 只代表 Repeat Intent；成功重複使用由 BigQuery／SQL 依同一匿名使用者後續新的 `analysis_completed → result_viewed` 流程判定。詳見 D-018。
- `[已確認 2026-08-22]` 產品層核心指數命名為 `AI Trust Index`／AI 信任度；其可觀測定義是 AI 對品牌答案的採用率與引用來源證據的真實度。詳細方法以來源可驗證、品牌實體對齊、內容相關與主張支持度操作化，不代表模型內部信任。研究層暫稱 `GEO Core`，保留來源層、答案層與原始 `query-run`。
- `[已確認 2026-08-22]` AI Trust Index／GEO Core 中，`unknown` 不等於 0；產品以特殊狀態標示目前沒有可用證據，統計上不得併入 0 的分母，也不得解讀為已證明品牌不存在。`query-run` 的重跑與分母影響須在詳細方法文件說明。

## 供應商實測

| 服務 | 狀態 | 證據 |
|---|---|---|
| Perplexity Sonar | 正式站已驗證 | 2026-09-02 `POST /api/test-search-provider` 回傳 HTTP 200、provider `perplexity`、model `sonar`。 |
| DeepSeek V4 Flash | 正式站已驗證 | 2026-09-02 `POST /api/test-provider` 回傳 HTTP 200、provider `deepseek`、model `deepseek-v4-flash`。 |
| Developer API 固定四家 | 本機帳號 smoke 已驗證 | 2026-09-09 同一固定 prompt 各一次、無 retry；GPT-5.6 Luna、Gemini 3.5 Flash-Lite、Sonar、Claude Haiku 4.5 均回搜尋證據與引用。這不是正式站部署驗證。 |

## 線上部署實測（2026-08-10）

以下均為 `https://geocheck.lisheng.cv` 的直接觀察，不代表 2026-08-09 個別失敗請求的確切原因：

- `[觀察]` `GET /healthz` 回傳 HTTP 200。
- `[觀察]` `POST /api/test-provider` 回傳 HTTP 200，實際 provider 為 `gemini`、model 為 `gemini-3.1-flash-lite`。
- `[觀察]` `POST /api/test-search-provider` 回傳 HTTP 200，Perplexity `sonar` 成功。
- `[觀察]` `POST /api/audit-real-lite` 以 `https://example.com` 測試，11.47 秒回傳 HTTP 200；產生的報告頁亦回傳 HTTP 200。
- `[觀察]` 線上首頁與 `llms.txt` 仍為 Gemini 舊版文案，表示正式環境尚未部署目前 repo 的 DeepSeek 版本。
- `[觀察]` 完整測試的 `crawlDiagnostics.browser` 顯示 Render 缺少 Playwright Chromium 執行檔；該次因 HTTP 抓取可用而成功退回 `selectedMethod: http`。
- `[觀察 2026-08-10 11:47]` Render 已設定 hermetic `PLAYWRIGHT_BROWSERS_PATH=0`，建置時下載 Chromium headless shell 並實際啟動驗證；Linux 建置與部署成功，缺少執行檔的故障已排除。
- `[觀察 2026-08-10 11:48]` 重新測試 `https://buna.com.tw/` 時，Render 的 HTTP 回應仍無可讀文字，Chromium 則收到防機器人驗證頁；因此該站失敗的剩餘原因是目標站對雲端抓取的驗證，不是 Gemini、Perplexity 或 Chromium 未安裝。報告 ID：`real_lite_1786333679652`。
- `[觀察 2026-08-11 08:34–08:36]` Render 的暫時 Scrapling runtime probe 曾將 Start Command 改為 Python `http.server`，導致 `/home` 回傳 404、首頁無法使用。已將 Start Command 復原為 `npm run mock-api`，Build Command 復原為安裝並驗證 Playwright Chromium headless shell；Render 顯示部署成功，`/` 與 `/home` 均回到正式首頁。此事故未整合 Scrapling 或 Patchright 至 repo 依賴。
- `[觀察 2026-08-11]` commit `e8283a3` 新增 Google Translate 最後備援：僅在原站 HTTP 與瀏覽器結果仍不足以評分時使用，並以 `google-translate` 標示抓取方式。正式驗收 `https://buna.com.tw/` 的報告 `real_lite_1786409875807` 顯示抓取品質 `complete`、站內準備度 60、Perplexity 有效查詢 2/2、GEO 50；不再是 `fetch-limited`。

**目前能下的結論**：線上服務不是持續性的 Gemini／Perplexity 全域故障。JavaScript 高度依賴、反爬蟲或 HTTP 內容不足的網站，可能因瀏覽器備援不可用而失敗或只得到有限證據。要判定 2026-08-09 那一次錯誤的直接原因，仍需當時受測網址或 Render request log。

## 最終演算法審計

| 網站 | GEO | 站內準備度 | Perplexity | 提及率 | 官網引用率 | 實體對齊 |
|---|---:|---:|---:|---:|---:|---|
| 壽司郎 | 65 | 63 | 41 | 0% | 50% | 是 |
| Hunterest | 41 | 87 | 0 | 0% | 0% | 否 |

結果符合產品目的：Hunterest 的站內結構雖較完整，但未因結構拿到高 GEO 分；壽司郎有實體與官網引用證據，因此 GEO 分較高。資料集 SHA-256：`83d50e17a6962342d5e1baf7c44ea3e97fb40bda0c4ff2ba7703b8304010cd6c`。

## 尚未完成的交付門檻

完整的 AI Trust Index v1 發布與正式環境驗收，見 `docs/DEPLOYMENT_RELEASE_CHECKLIST.md`。2026-09-02 已完成首頁、`/healthz`、legacy endpoint retirement、兩個 provider，以及 unknown 報告 API／HTML／Markdown 的受控驗證。

1. `[產品決策待確認]` 若 DeepSeek 兩輪後仍無法提供五題有效候選，產品要維持 `unknown`，或採用可見、版本化的固定題型備援。這會改變 query-run 的形成方式，不能由 Agent 自行決定。
2. `[白皮書後續追蹤]` 2026-09-09 已完成 Wave 0 基準波收數、大數據分析與基準報告（`research/outputs/xinyi-dining-h2-2026-wave0/wave0-baseline-report.md`）。下一階段為 10 月初進行之 Wave 1 縱向追蹤（追蹤推薦名單穩定度與引用漂移），以及評估 Playwright/Stealth 爬取受 WAF 阻擋大型飯店網域。
3. `[每次發布]` 執行 `npm.cmd test`；任一同步、計分或安全測試失敗都不得部署。

## 對外聲明

GeoCheck 量測的是公開網站與指定 Perplexity 查詢集下的可觀測 GEO 證據，不保證任何 AI 引擎一定引用、排名或推薦。失敗或未知證據不補零，也不由 DeepSeek 猜測。
