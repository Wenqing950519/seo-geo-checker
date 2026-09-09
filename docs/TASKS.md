# GeoCheck API／SDK 前置與漸進遷移任務

> 2026-09-09 最新交接入口：[developer-api/HANDOFF](developer-api/HANDOFF.md)。D-037 已完成 B0～B2 後臺；下一步是人工拍板資料位置／保存／quota／預算後建立遠端 B D1，再做寄信與 edge 控制。視覺前端由使用者另搭；SDK client、金流與代管 Monitoring 仍是另案。

> 2026-09-08 後續整理：依使用者新指示，已完成目錄與 import 分層、舊入口相容、測試搬移及 raw evidence 原位元保存，詳見 `maintenance/REPOSITORY_CLEANUP.md`。下文是先前平台遷移提案，不能整段視為已完成。T1 已有基線與目錄／HTTP regression；T2 僅完成實體檔案歸屬與純核心邊界，尚未全面注入 ports 或抽出 server renderer；T3–T5 未實作。Project／Run 可先於 SDK／public API，見 `strategy/ROADMAP_ALIGNMENT.md`。

建議依「凍結 A 契約 → 原地抽核心 → 持久工作與隔離 → 單引擎 B → SDK／多引擎／監控」順序推進，每一階段都保留可回退的 A 路徑。

2026-09-08：本清單全部為未執行提案；本次只新增 `ARCHITECTURE.md`、`PRODUCT_BOUNDARY.md`、`TASKS.md`。未更改 runtime、演算法、資料庫、研究資料或部署，未執行付費呼叫。文件中的測試為後續驗收要求，不代表已有測試覆蓋或已通過。

## 0. 實作前決策門檻

| ID | 需要確認的項目 | 建議與阻塞範圍 |
|---|---|---|
| D-B1 | B 首批使用者與具體使用情境、與白皮書優先序 | 先驗證「交付網站時量測」或「定時追蹤」之一；附件不能代替客戶證據；阻塞正式平台優先級 |
| D-B2 | API 先 explicit queries 還是提供自動 planner；URL 是 origin 還是 page scope | 建議 B explicit query set、保留完整 URL；A 維持四題；阻塞 schema freeze |
| D-B3 | Provider 路由 | 已由 D-027 確認官方直連四家、不採 OpenRouter；各家模型、原生證據 mapping 與啟用順序仍待逐一驗證 |
| D-B4 | retention、tenant 隔離、配額與計費單位 | D-029／D-030 已確認全成才扣量、無綁卡 7 天每日 3 輪、Basic 660／80 與 Premium 1390／170；成本、濫用、額度效期、token 上限與金流仍待驗證，阻塞公開流量 |
| D-B5 | SDK 首發語言、是否代管 monitoring、服務驗收門檻 | 依首批整合者決定；不先發布 npm 或建 Developer Console；阻塞公開 SDK／代管排程 |

正式方向由使用者確認後另記 DECISION_LOG。本次按要求不修改該檔。現有 D-021 的權重、unknown、分母與 cap，D-025 的 A 四題，以及研究人工審核門檻均維持。

## 1. 建立 A 的可重現相容基線

| 任務 | 範圍與產出 | 驗收與回退 |
|---|---|---|
| T1.1 | 為同步 `POST /api/audit-real-lite`、200/400/429、JSON／HTML／Markdown、410 舊路由建立匿名化固定 fixtures | 涵蓋 measured、全 unknown、部分 provider failure、fetch-limited、自訂部分題／重複題、cached result；固定 I/O，不打付費 provider |
| T1.2 | 補語義 characterization：四題 + authority、authority 排除、分母／cap、來源合併、舊報告 normalization | 在修正前先寫可重現測試；抽取前後同 fixture 的證據與分數一致；已知錯誤另開版本變更，不能把它悄悄改掉 |
| T1.3 | 記錄部署 runtime、report store、cache 及研究 CLI 的 import 邊界 | 明確區分文件記錄與當次 live evidence；核對來源合併、公開 provider 路由、未知快取及 excluded count 缺口 |

先閱讀相關模組及最近 scoped AGENTS。既有測試重點為 `ai-trust-index`、`ai-trust-surface`、`query-planner`、`perplexity-provider`、`audit-cache`、`d1-report-store`、`report-state`、`business-loop`、`brand-match`、`whitepaper-contract`、`whitepaper-preflight`、`skill-sync`。`package.json` 的 test script 使用 Node 測試腳本串接；目前沒有 lint／typecheck script，不得宣稱兩者已通過。

此階段只增加 characterization，不改 A；基線失敗先分清既有失敗與測試設計問題，禁止帶著未解釋的差異往下遷移。

## 2. 原地建立 core / application / adapter 邊界

| 任務 | 最小變更 | 驗收與回退 |
|---|---|---|
| T2.1 | 從品牌／來源／HTML／選題模組抽純函式，舊路徑保留 re-export | core 不 import server/env/fs/fetch/DB/browser；相同 fixture 行為不變；可還原呼叫指向 |
| T2.2 | 對 crawler、search、structured analysis、usage 注入 ports，Perplexity 保留原 adapter 行為 | provider payload、query 順序、retry 上限、raw evidence 與 errors 不漂移；不加入新 provider |
| T2.3 | 抽 application orchestration；scoring policy 與 A presenter 分開 | A 同步 handler 呼叫相同 use case，仍回原 JSON／URL；研究 CLI 可保留舊 import wrapper，review gate 不消失 |
| T2.4 | A HTML／Markdown 與 lead/funnel 從 server 分出，但保留原路由 | snapshot／DOM 關鍵行為與 CTA、GA4 去重保持；不改 Hero 或商家文案 |

這一階段不搬 runtime、不拆獨立部署、不改 schema。新舊 orchestration 可用 server-side 開關選擇；影子比較只重播同一固定證據，不能為比較額外呼叫付費模型。通過相關測試後跑一次完整 `npm.cmd test`；有程式變更才按新增失敗重跑必要檢查。

## 3. 建立 B 服務能力，A 繼續走相容路徑

| 任務 | 最小變更 | 必要驗收 |
|---|---|---|
| T3.1 | 凍結 canonical measurement / query-run / source schema 與 OpenAPI 草案 | 所有失敗保留、attempt 不重複計入分母、來源型別不丟失；A presenter 固定相容 profile |
| T3.2 | 新增 tenant/key、jobs、attempts、measurements、reservation ledger 與 outbox 儲存 | additive migration；B row 不透過 A 公開報告讀出；舊 audit_reports 不覆寫、不回填不存在的 tenant／證據 |
| T3.3 | durable worker、lease、resume、idempotency 與成本預留 | 程序重啟、重複投遞、兩 worker claim、POST 重送只得到同一工作／reservation；ambiguous provider attempt 有可追溯處置 |
| T3.4 | 封閉旁路與完成 egress／授權／全域限額 | 所有付費入口含 probe、研究代理、retry/fallback 有同等 guard；跨租戶、private redirect、browser 子資源、cache stampede 有測試 |

儲存故障時 B 不接受無法持久化的工作；A 可保留既有 best-effort cache 行為。若採同一 database，表與授權清楚分離；不得借用 THE MAP 資料庫。正式驗證儲存原子操作後才選 D1 或其他 adapter，不先假設 REST 多請求具交易性。

併發測試採 mocked provider 與可控制時計，證明 tenant 與全域預算不超額、同一 reservation 不重複結算、worker crash 不遺失成功結果；不以 10,000 次真實 API 呼叫做壓測。停止新 B admission／worker 即可回退，保留工作與 ledger 供恢復，不能刪庫回退。

## 4. 單引擎 B 與 SDK 契約驗證

| 任務 | 產出 | 驗收與回退 |
|---|---|---|
| T4.1 | `/v1/measurements`、jobs、read/list、engine capabilities，先 private beta | 完整 tenant auth、202/Location、idempotency 409、429/503 Retry-After、unknown/failed + partial_results schema；關閉 B route 不影響 A |
| T4.2 | 最小 SDK／HTTP 範例，首發語言依 D-B5 | create → wait → result → list；timeout、取消等待、pagination、safe retry contract tests；不內含 provider key 或 scoring |
| T4.3 | A 以同一 application 進行內部 dogfooding | 首先維持同步 facade；不要求瀏覽器立即改 async，也不強制研究改 API |

只有實際部署分離或同步 timeout 已成瓶頸，才新增 A async adapter：先讓 server 同時支援舊同步與新 job 契約，再以可回退前端開關逐步改輪詢。舊 JSON／報告連結與持久讀取繼續服務；停用新前端路徑即可回復同步。不能一次把現有 POST 改成 202 讓 A 讀不到報告。

正式 beta 前需人工走首頁輸入、自訂題、unknown、報告重開、Markdown、lead 與研究 dry-run。付費 smoke test 另行取得明確執行授權，先列 provider、query、最大 attempt 與成本上限；本次不執行。

## 5. 多引擎與 Monitoring 後置

| 任務 | 前置條件 | 驗收 |
|---|---|---|
| T5.1 | 依官方文件重新查證候選 provider 搜尋能力、引用格式、價格與 surface；保留查證日期與原始連結 | 附件說法不得直接當 Verified；選定一個新 adapter，fixture 覆蓋 citation/tool/refusal/empty/error |
| T5.2 | 來源語義與 per-engine analysis 版本核可 | 不把 search_result 當 answer_citation；同一模型不同 routing/search stack 有不同 engine profile；不宣稱 API 代表 consumer UI |
| T5.3 | SDK 契約穩定後提供客戶排程方式 | 每一期 fresh/new run，設定 hash 一致才比較；unknown 排除、series break 明確、重送不重複建立工作 |
| T5.4 | 有代管需求才做 scheduler/webhook | 時區／missed run／重疊工作／簽章／重試／防重放與 URL 安全驗收；可停排程不影響 A/B 單次量測 |

新 adapter 以 engine feature flag 控制，出問題只停該 engine；保留原始 evidence 與版本，不把失敗 engine 靜默換另一家、不將 unknown 改零。新來源規則以新 analysis version 產出，舊 A 不追溯重算。

## 完成前置工作的判準

實作接手者應能從三份文件說明：A request 到 report 的路徑、core 與 I/O 的界線、哪些欄位必須版本化、為何 job 與 analysis 狀態不同，以及如何在 B 故障時保留 A。尚待人工確認的是產品客群／優先序、來源與計分語義、服務保存與配額契約，以及 SDK／monitoring 的首發範圍。

建議日後在 `LEARNING_LOG.md` 記錄的核心概念：共用函式不等於 public API；SDK 不等於 core 的打包；量測重跑不同於 transport retry；快取命中不等於新觀測；provider 型別統一不等於證據可比。本次未修改該檔。
