# GeoCheck HTTP service

`server.js` 是目前 A 的 Node HTTP 入口，也掛載 feature-gated 的 `/v1` Developer API。`application/` 為量測編排，`storage/` 為 A store、B 的 SQLite／獨立 D1 store，`developer-api-migrations/` 是 B schema。B 後臺已有多租戶帳戶、金鑰、持久 job、配額／成本 ledger 與 admin API；預設關閉，未部署、未公開營運。

在 repository 根目錄執行 `npm.cmd start`。操作與環境設定見 [OPERATIONS.md](OPERATIONS.md) 與 [Developer API 後臺手冊](../../docs/developer-api/BACKEND_RUNBOOK.md)。`services/api/wrangler.jsonc` 只管理 A；B 的 Worker 與 D1 binding 位於 `services/developer-d1-gateway/`，Node 後端使用兩個 `GEOCHECK_DEVELOPER_D1_GATEWAY_*` 值，不需要帳戶級 D1 token。

未來 Account／Project／Run 的 domain 與持久工作屬服務層；它們不放 core 或 SDK。是否先做 practitioner workflow 或 public API 由路線決策決定，不從資料夾名稱推定產品優先序。
