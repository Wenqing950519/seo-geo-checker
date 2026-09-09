# GeoCheck

GeoCheck 目前提供單站 AI 搜尋曝光診斷；此 repository 已按產品、核心規則、外部整合與研究資料分層。Developer API 的 B0～B2 後臺、OpenAPI 與四家官方 adapter 已實作，20 輪受控 benchmark 全數成功；視覺前端、SDK client、付款、遠端 B D1 與公開部署仍未完成，因此不是已上線服務。

## 從這裡開始

```powershell
npm.cmd start
npm.cmd test
```

`npm.cmd start` 啟動 `services/api/server.js`，預設 port 8787。原本的 `npm.cmd run mock-api` 與 `node mock-api/server.js` 仍可使用。環境設定沿用 root `.env` 或 `mock-api/.env`，本次沒有搬移金鑰、用量或聯絡人紀錄。首次安裝與部署細節見 [服務操作說明](services/api/OPERATIONS.md)。

## 目錄

```text
geocheck/
├─ apps/
│  ├─ web/                    # A：首頁資源、報告組裝、analytics
│  └─ developer-console/      # 僅邊界說明，尚無功能
├─ packages/
│  ├─ geo-core/               # evidence、site-analyzer、query-generator、scoring
│  ├─ crawler/                # HTTP / browser / Python 抓取及技術探測
│  ├─ ai-providers/           # Perplexity、DeepSeek、結構化模型 router
│  ├─ monitor/                # 僅邊界說明，尚無排程服務
│  ├─ sdk/                    # 僅邊界說明，尚未發布 npm
│  └─ shared/                 # errors 與現有環境載入
├─ services/api/              # 現行 HTTP、application、storage、guards、D1 migrations
├─ tests/                    # regression、目錄相容與 HTTP 檢查
├─ scripts/                  # runtime 安裝、整理驗證工具
├─ research/
│  ├─ inputs/                # 候選池、凍結題庫、entity master
│  ├─ outputs/               # 各次實驗結果；不覆寫、不視作產品快取
│  ├─ sources/               # 外部原始資料與取得紀錄
│  ├─ work/                  # 候選資料整理工具
│  ├─ scripts/               # 批次與模型驗證 CLI
│  ├─ lib/                   # entity 檔案讀取與 research profile
│  └─ *-audit-2026-08-21/    # 原有研究審計及歷史證據
├─ docs/                     # 共同決策、API/架構、strategy、research、archive
├─ archive/                  # 舊 seo-geo skill 與封裝；非產品程式
└─ mock-api/                 # 相容入口與既有私有 runtime 檔案，不新增實作
```

這是同一套 Node 專案的模組整理，尚未轉為多服務部署或可獨立發布的 npm workspaces。爬蟲有外部 I/O，因此放在 core 外；商家報告放在 A，避免將中文文案變成 SDK 契約。query planner 仍混有生成／選題，暫留 application，純驗證的下一步抽取見 TASKS。

## 文件導航

| 想做什麼 | 入口 |
|---|---|
| 接手附屬 API 的產品／安全與實作設計 | [2026-09-09 實測與審計](docs/developer-api/AUDIT_2026-09-09.md)、[B API 交接](docs/developer-api/HANDOFF.md)、[產品與架構](docs/developer-api/BLUEPRINT.md)、[防濫用與資安](docs/developer-api/SECURITY.md) |
| 理解現在怎麼運作 | [CURRENT_STATE](docs/CURRENT_STATE.md)、[ARCHITECTURE](docs/ARCHITECTURE.md) |
| 確認 A／B 與 API 範圍 | [PRODUCT_BOUNDARY](docs/PRODUCT_BOUNDARY.md)、[API_CONTRACT](docs/API_CONTRACT.md) |
| 看後續順序 | [TASKS](docs/TASKS.md)、[路線與架構對照](docs/strategy/ROADMAP_ALIGNMENT.md) |
| 找搬走的舊檔／判斷是否可刪 | [整理紀錄](docs/maintenance/REPOSITORY_CLEANUP.md)、[完整搬移表](docs/maintenance/layout-migration-2026-09-08.json) |
| 研究與治理 | [docs 索引](docs/README.md)、[research 索引](research/README.md) |

新增檔案先選定責任位置；產品實作不放 `mock-api`，實驗輸出不放 docs 根目錄，下載／暫存放忽略版控的 `tmp/`。歷史論述與來源保持原文，用搬移表定位舊路徑，不將過去證據改寫成目前結果。
