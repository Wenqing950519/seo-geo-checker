# Developer Console — frontend planned, backend available

目前沒有視覺前端。後臺已提供 `/v1/auth/*` 與 `/v1/console/*`，負責邀請驗證、登入、方案啟用、API key、用量與工作列表；契約見 `docs/developer-api/openapi.yaml`。未來前端只應呼叫這些後臺，不複製 tenant、配額或金鑰規則，也不替代 `apps/web` 的產品 A。
