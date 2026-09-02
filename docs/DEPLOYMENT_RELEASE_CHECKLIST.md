# AI Trust Index v1 發布與驗收清單

本清單用於發布 `200ccb6`、`57fa2c7`、`9e41953`、`2532be5`。本機測試通過不等於正式站已驗證；只有下列正式環境證據齊全，才能宣稱可上線。

## 發布前

- 確認 `npm.cmd test` 通過，且工作樹沒有把未審核研究樣本、API 金鑰或本機暫存檔納入提交。
- 部署環境已設定 `DEEPSEEK_API_KEY`、`PERPLEXITY_API_KEY`、`ADMIN_PATH_TOKEN` 與 `ADMIN_TOKEN`；不要把值寫入 Git 或報告。
- 確認白皮書正式資料仍未開始收集。正式 batch 需要人工核可的 site list、query set、entity master；草稿與 smoke 資料不得混入。

## 部署後：不產生成本的檢查

1. `GET /healthz` 回傳 HTTP 200，內容為 `{ "ok": true, "service": "geocheck" }`。
2. 首頁標題或文案包含 `AI Trust Index`，且說明答案採用 65%、已驗證官方 URL 證據 35%。
3. `GET /llms.txt` 說明 AI Trust Index 不是模型內部信任，並保留 unknown 不等於 0 的邊界。
4. `POST /api/audit` 回傳 HTTP 410、`code=deprecated_endpoint`、`replacement=/api/audit-real-lite`。這證明不會再發出 mock 分數。

## 部署後：受控 provider 檢查

1. 以部署環境呼叫 `POST /api/test-provider`，記錄 HTTP 狀態、provider、model、時間與 latency；不得在公開白皮書暴露金鑰或完整回應。
2. 呼叫 `POST /api/test-search-provider`，以相同方式記錄 Perplexity model 與時間。
3. 對公開可讀、低風險的測試網址執行一次 `POST /api/audit-real-lite`。確認回應中的：
   - `audit.score.algorithm_version` 為 `ai-trust-1.0.0`。
   - `audit.score.breakdown.answer_adoption.weight` 為 65，`source_evidence.weight` 為 35。
   - `audit.score.denominator` 顯示有效／總 query-run；沒有有效可見回答時 `value` 為 `null`、`evidence_status` 為 `unknown`，而不是 0。
   - 報告頁與 Markdown 同時顯示 AI Trust Index、答案層、來源層、provider/model 與限制。
4. 以一次無效或受限情境確認錯誤訊息不會回傳秘密，且 rate limit、cache 與 usage ledger 仍正常。

## 發布判定

| 狀態 | 條件 |
|---|---|
| `implementation_ready` | 全套本機測試通過、版本化程式與文件一致。 |
| `deployment_verified` | 不產生成本檢查與兩個 provider 檢查都在正式站成功。 |
| `single_audit_verified` | 一筆正式 AI Trust Index audit 的 API、HTML、Markdown 結構都符合 v1。 |
| `whitepaper_ready` | 題組與 entity master 已人工核可，付費 batch 預算、collection window、dataset hash 與 unknown 排除規則已凍結。 |

未達 `deployment_verified` 不得宣稱正式站穩定；未達 `whitepaper_ready` 不得發布統計性白皮書結論。
