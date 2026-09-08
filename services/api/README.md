# GeoCheck HTTP service

`server.js` 是目前 A 的 Node HTTP 入口；尚無正式 `/v1` Developer API。`application/` 為共用量測與生成題組，`storage/` 為 cache／D1，`guards/` 為既有限流，`migrations/` 為原本 D1 migration。

在 repository 根目錄執行 `npm.cmd start`。操作與環境設定見 [OPERATIONS.md](OPERATIONS.md)。D1 管理設定改用 `services/api/wrangler.jsonc`；本次沒有執行 migration、變更遠端資源或部署。

未來 Account／Project／Run 的 domain 與持久工作屬服務層；它們不放 core 或 SDK。是否先做 practitioner workflow 或 public API 由路線決策決定，不從資料夾名稱推定產品優先序。
