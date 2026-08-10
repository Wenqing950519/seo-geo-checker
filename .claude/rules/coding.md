# 程式規則（細則）

> 本檔是 `CLAUDE.md` / `AGENTS.md` 的 Engineering Rules 細則。

## 本專案實際結構

| 用途 | 位置 |
|---|---|
| 主程式 | `mock-api/` |
| 測試 | `mock-api/tests/` |
| 量測核心 | `mock-api/lib/geo-measurement.js` |
| 查詢規劃 | `mock-api/lib/query-planner.js` |
| 研究 profile | `mock-api/lib/research-profile.js` |
| Provider | `mock-api/providers/perplexity.js` |
| Server | `mock-api/server.js` |
| 研究 skill | `.agents/skills/geo-whitepaper-research/` |
| 研究工具鏈 | `research-work/`（23 支 .mjs/.py） |

> 註：Contract 範本提到的 `src/` 與 `tests/` 在本 repo 對應 `mock-api/` 與 `mock-api/tests/`。
> **不要為了符合範本而重新命名目錄**——那屬於未經要求的大規模重構。

## 修改前

- 先讀相關模組、測試與現有規格（`ALGORITHM_V3.md`）
- 明說**要改什麼**與**不改什麼**
- 採最小可驗證變更
- 不順手重構
- **不刪除未知用途的程式、資料或設定**

## 修改後

```bash
npm.cmd test
```

- 執行相關測試、型別檢查與 lint
- 說明**未能執行**的驗證（例如需要 API key 或實站的部分）
- 提供變更摘要、風險、人工驗收步驟
- **測試失敗時不得宣稱完成**

## 上線前檢查

1. Render 保留 `GEMINI_API_KEY`、`PERPLEXITY_API_KEY`、`ADMIN_PATH_TOKEN`、`ADMIN_TOKEN`
2. 測 `POST /api/test-provider` 與 `POST /api/test-search-provider`
3. 用正確 `X-Admin-Token` 測 `POST /api/internal/research-profile`（錯誤密碼須回 401）
4. `npm.cmd test` 全綠
5. 白皮書批次前先估成本與地區限制

## 安全

- 不得將 API key、token 寫入程式碼或提交至 git（`.env` 已在 `.gitignore`）
- 後台路徑 `/<ADMIN_PATH_TOKEN>` 不得公開
- 遇到 credentials 相關操作，先問使用者

## 分支

- 不直接在 `main` / `master` 上修改，走 feature branch
- 目前分支：`feature/geo-measurement-audit-fixes`
