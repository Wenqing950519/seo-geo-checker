# Repository 整理紀錄 — 2026-09-08

本次依 D-026 實際搬移 272 個檔案，按責任建立 apps／packages／services／research／docs，保留原始資料與 A 行為。這是本機分支 `codex/repository-layout` 的整理，尚未 commit、push 或部署。

## 分類結果

| 原來 | 現在 | 處理理由 |
|---|---|---|
| mock-api 的核心／provider／public／server 混放 | apps/web、packages/geo-core、crawler、ai-providers、shared、services/api | 按產品與執行責任找唯一正本；舊 module 只 re-export |
| mock-api/tests、scripts | tests/regression、scripts/runtime、research/scripts | 測試、安裝與實驗用途分開 |
| research-input/output/sources/work | research/inputs、outputs、sources、work | 收斂四個根目錄；raw evidence 不改 bytes |
| root 舊演算法、Word、business_docs | docs/archive/algorithms、specifications、business | 歷史版本不再與現行 AI Trust Index 混淆 |
| seo-geo skill／封裝、策略及 P1 文件散落 | archive/seo-geo、docs/strategy、docs/research/methodology／plans | 舊工具與新流程分開；提案不等於決策 |

`CLAUDE.md` 改為讀取 `AGENTS.md` 的入口，避免兩份長篇 contract 漂移；補充 coding 規則更新實際位置。docs 根部維持共同治理與當前契約，不另複製 B schema。新增的 planned README 只定義 SDK／console／monitor 邊界，沒有 class、依賴或假功能。

## 去重與保留

搬移清單內逐檔 SHA-256 檢查沒有找到內容完全相同的兩份檔案；這不代表整個 repository 已無語義重複。舊 BRD／PRD、不同研究輸出、各版 evidence ledger 不能只按名稱判斷重複，因此本次歸檔／分類，未刪內容。

50 個搬移後空目錄以非遞迴方式移除，沒有刪除非空目錄。node_modules、`.scrapling-runtime` 是執行依賴，tmp 是暫存，`.agents`／`.claude`／`.workbuddy` 是工具設定，不因看似雜亂就刪除。raw research snapshots、歷史審計 seed 與 locator 維持；不把其舊測量日期改成今天。

本次保留 mock-api 的 `.env`、usage／funnel／leads 路徑，避免遺失部署秘密與紀錄；未讀取或搬移金鑰。它不是第二份產品實作，所有 wrapper 都直接載入 canonical module。相容層移除條件是部署命令、白皮書 CLI 與外部使用者皆已改接新路徑，需另一次明確遷移。

## 驗證方式

```powershell
npm.cmd test
npm.cmd run test:layout
npm.cmd run verify:layout
```

搬移前既有全套測試通過，搬移後保留全套 regression。新增的 layout 測試檢查新舊入口是同一 module instance、core 不依賴 I/O／provider、browser runtime 仍定位根 node_modules。HTTP 測試對新舊入口都檢查首頁、analytics、favicon、圖片及 mock 報告 JSON／HTML／Markdown；provider／DNS／D1 皆隔離，不發起付費呼叫。搬移表中的所有 A 靜態資源保持原 bytes。

`verify:layout` 檢查所有目的檔存在、raw evidence hash 相同、static assets 相同與 D1 migration 路徑存在。程式允許因 import／相對路徑調整而變動；OPS 文件與 wrangler schema 相對路徑也有更新。沒有增刪 SQL table 或改遠端 D1。

repository 未設定 lint／typecheck 指令，本次不宣稱這兩項通過。沒有驗證線上部署、真實付費 audit、browser 對實站抓取或 provider 連線；人工發布前依部署 checklist 驗收。

## 找舊檔與回退

[搬移表](layout-migration-2026-09-08.json) 每列保存 from、to、原大小與 SHA-256。以舊 locator 搜尋 from，再取 to；JSONL／CSV 內的舊絕對路徑不為搬移而改寫。首次搬移後立即核對每個檔案 hash，再調整程式 import。

回退不可直接 `git reset --hard`，因本次起始時已有未追蹤策略／架構文件。先保存當前分支差異與未追蹤檔，核對 manifest，再按 from／to 反向還原檔案與 import；原始碼可對照基準 commit `30709e4a436cc9a4a7069f2242e46d0e0abee5db`。相容 wrapper 可直接繼續運行，因此通常不需為換回啟動命令而反向搬整個 repository。

`prepare-layout.cjs`／`rewrite-layout.cjs` 是此次一次性遷移工具，帶有防重跑檢查；日常只執行 verify-layout。它們保留作為可審查的搬移方法，不是開發服務的一部分。

## 商業路線依據

已閱讀指定 Downloads 企劃書，來源 SHA-256 為 `703fb17d6249952876ec9407c4ca74369af14e2c66ff966de94f6aa89755e99b`；只產出 [ROADMAP_ALIGNMENT](../strategy/ROADMAP_ALIGNMENT.md) 對照，沒有再複製一份完整企劃造成版本分叉。Project／Run／有限排程可以先服務 apps/web，Developer Console 與 SDK 不必先做；具體產品優先序與商業決策仍待確認。
