# GeoCheck HTTP service

`server.js` 是目前 A 的 Node HTTP 入口。`application/` 為量測編排，`storage/` 為 A store。2026-10-21 起 Developer API（`/v1`）、B 的 store 與 `developer-api-migrations/` 已移到 ls-labs `products/platform`（LSL-D-009），本機伺服器不再掛載它。

在 repository 根目錄執行 `npm.cmd start`。操作與環境設定見 [OPERATIONS.md](OPERATIONS.md)。`services/api/wrangler.jsonc` 只管理 A；Platform 的 Worker 與 D1 binding 在 ls-labs `products/platform/wrangler.jsonc`。

未來 Account／Project／Run 的 domain 與持久工作屬服務層；它們不放 core 或 SDK。是否先做 practitioner workflow 或 public API 由路線決策決定，不從資料夾名稱推定產品優先序。
