# Legacy compatibility only

這裡保留舊 Node 啟動入口、研究 CLI 的 import re-export，以及原本 `.env`／usage／funnel／leads 路徑。每個 wrapper 指向唯一的新實作，不複製演算法。新增程式請放 apps、packages、services、research 或 tests。

`npm.cmd run mock-api`、`node mock-api/server.js` 與既有 `mock-api/scripts/*.js` 啟動方式仍有效。靜態檔案已搬到 apps/web/public；測試在 tests/regression；D1 設定／migration 請使用 services/api 的位置。舊文件中的研究資料路徑請查 `docs/maintenance/layout-migration-2026-09-08.json`。
