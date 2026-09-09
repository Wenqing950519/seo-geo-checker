# Developer D1 gateway

這個 Worker 是 Developer API（產品 B）唯一的遠端 D1 data plane。它透過 `DB` binding 只連到 `geocheck-developer-api`，Render 端不持有 Cloudflare 帳戶級 D1 token。

對外只有兩個路由：

- `GET /healthz`：不讀資料庫，只回服務存活狀態。
- `POST /v1/query`：要求 `Authorization: Bearer <GATEWAY_TOKEN>`，接受單筆 `{ sql, params }` 或最多 64 筆的 `{ batch }`。

閘道只允許單一 `SELECT`、`INSERT`、`UPDATE`、`DELETE` 或 `WITH` data statement；拒絕 DDL、PRAGMA、ATTACH、transaction control、多 statement、非 scalar params、超過 1 MiB 的 request 及超過 2 MiB 的 response。SQL 與 params 不寫入 log。

操作：

```text
npm.cmd run gateway:types
npm.cmd run gateway:dry-run
npm.cmd run gateway:migrate
npm.cmd run gateway:deploy
```

`GATEWAY_TOKEN` 只能用 Cloudflare secret 設定，並以同值放入後端的 `GEOCHECK_DEVELOPER_D1_GATEWAY_TOKEN`；不得提交到 Git、前端或 log。更新 config 後先 dry-run，再部署。
