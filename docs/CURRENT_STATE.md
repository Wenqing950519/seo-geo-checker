---
type: current-state
project: GeoCheck
last_updated: 2026-08-10
tags:
  - geocheck
  - current-state
---

> [!note] 本檔原名 `CURRENT_OPERATIONAL_STATUS.md`，2026-07-25 移入 `docs/` 成為 Contract 指定的 `CURRENT_STATE.md`。
> 內容未經改動。此檔為營運現況的共同事實來源；狀態變更時必須更新此處，不得只寫在對話或記憶中。

# GeoCheck 當前運作狀態

更新日期：2026-08-01

## 已完成

- Algorithm V3.0.0 已切換為 GEO-first：Perplexity 搜尋觀測 50%、內容可引用性 30%、必要技術存取 20%。
- Perplexity 無法量測時，整體 GEO 分數為未知；站內準備度不得冒充 GEO 分數。
- DeepSeek 不參與計分。單站報告由 DeepSeek 先辨識產業並產 5–8 題候選，再由後端選兩題交給 Perplexity；產題失敗時停止計分。
- 網站與 Skill 共用 `mock-api/lib/geo-measurement.js`，並由同步測試阻止權重漂移。
- 白皮書先由 DeepSeek 草擬候選題並強制人工審核凍結；使用兩題題庫時每站 Perplexity 3 次、DeepSeek 描述 1 次，並保留獨立硬上限、JSONL 續跑與資料集雜湊。
- DeepSeek 改採官方 API 直接呼叫；單站結構化判讀的備援順序為 DeepSeek → GPT-5.6 Luna → Gemini，並記錄實際 provider。白皮書批次明確禁用備援，避免同一 cohort 靜默混用模型；部署後仍須以健康檢查驗證金鑰與連線。
- 後台維持無公開入口的 `/<ADMIN_PATH_TOKEN>`，並以 `ADMIN_TOKEN` 驗證用量與研究代理請求。

## 供應商實測

| 服務 | 狀態 | 證據 |
|---|---|---|
| Perplexity Sonar | 已啟用 | 2026-07-16 最終審計 6/6 呼叫成功。 |
| DeepSeek V4 Flash | 待部署驗證 | 程式設定為 `deepseek-v4-flash`；尚未以正式 `DEEPSEEK_API_KEY` 執行 `POST /api/test-provider`。 |

## 線上部署實測（2026-08-10）

以下均為 `https://geocheck.lisheng.cv` 的直接觀察，不代表 2026-08-09 個別失敗請求的確切原因：

- `[觀察]` `GET /healthz` 回傳 HTTP 200。
- `[觀察]` `POST /api/test-provider` 回傳 HTTP 200，實際 provider 為 `gemini`、model 為 `gemini-3.1-flash-lite`。
- `[觀察]` `POST /api/test-search-provider` 回傳 HTTP 200，Perplexity `sonar` 成功。
- `[觀察]` `POST /api/audit-real-lite` 以 `https://example.com` 測試，11.47 秒回傳 HTTP 200；產生的報告頁亦回傳 HTTP 200。
- `[觀察]` 線上首頁與 `llms.txt` 仍為 Gemini 舊版文案，表示正式環境尚未部署目前 repo 的 DeepSeek 版本。
- `[觀察]` 完整測試的 `crawlDiagnostics.browser` 顯示 Render 缺少 Playwright Chromium 執行檔；該次因 HTTP 抓取可用而成功退回 `selectedMethod: http`。
- `[觀察 2026-08-10 11:47]` Render 已設定 hermetic `PLAYWRIGHT_BROWSERS_PATH=0`，建置時下載 Chromium headless shell 並實際啟動驗證；Linux 建置與部署成功，缺少執行檔的故障已排除。
- `[觀察 2026-08-10 11:48]` 重新測試 `https://buna.com.tw/` 時，Render 的 HTTP 回應仍無可讀文字，Chromium 則收到防機器人驗證頁；因此該站失敗的剩餘原因是目標站對雲端抓取的驗證，不是 Gemini、Perplexity 或 Chromium 未安裝。報告 ID：`real_lite_1786333679652`。
- `[觀察 2026-08-11 08:34–08:36]` Render 的暫時 Scrapling runtime probe 曾將 Start Command 改為 Python `http.server`，導致 `/home` 回傳 404、首頁無法使用。已將 Start Command 復原為 `npm run mock-api`，Build Command 復原為安裝並驗證 Playwright Chromium headless shell；Render 顯示部署成功，`/` 與 `/home` 均回到正式首頁。此事故未整合 Scrapling 或 Patchright 至 repo 依賴。
- `[觀察 2026-08-11]` commit `e8283a3` 新增 Google Translate 最後備援：僅在原站 HTTP 與瀏覽器結果仍不足以評分時使用，並以 `google-translate` 標示抓取方式。正式驗收 `https://buna.com.tw/` 的報告 `real_lite_1786409875807` 顯示抓取品質 `complete`、站內準備度 60、Perplexity 有效查詢 2/2、GEO 50；不再是 `fetch-limited`。

**目前能下的結論**：線上服務不是持續性的 Gemini／Perplexity 全域故障。JavaScript 高度依賴、反爬蟲或 HTTP 內容不足的網站，可能因瀏覽器備援不可用而失敗或只得到有限證據。要判定 2026-08-09 那一次錯誤的直接原因，仍需當時受測網址或 Render request log。

## 最終演算法審計

| 網站 | GEO | 站內準備度 | Perplexity | 提及率 | 官網引用率 | 實體對齊 |
|---|---:|---:|---:|---:|---:|---|
| 壽司郎 | 65 | 63 | 41 | 0% | 50% | 是 |
| Hunterest | 41 | 87 | 0 | 0% | 0% | 否 |

結果符合產品目的：Hunterest 的站內結構雖較完整，但未因結構拿到高 GEO 分；壽司郎有實體與官網引用證據，因此 GEO 分較高。資料集 SHA-256：`83d50e17a6962342d5e1baf7c44ea3e97fb40bda0c4ff2ba7703b8304010cd6c`。

## 上線前檢查

1. Render 改為設定 `DEEPSEEK_API_KEY`、`PERPLEXITY_API_KEY`、`ADMIN_PATH_TOKEN` 與 `ADMIN_TOKEN`；移除不再使用的 `GEMINI_*` 與 `GEOCHECK_RESEARCH_API_*`。
2. 部署後測試 `POST /api/test-provider` 與 `POST /api/test-search-provider`。
4. 執行 `npm.cmd test`；任一同步、計分或安全測試失敗都不得部署。
5. 白皮書批次執行前，先公告預計網站數與兩家供應商的硬上限。

## 對外聲明

GeoCheck 量測的是公開網站與指定 Perplexity 查詢集下的可觀測 GEO 證據，不保證任何 AI 引擎一定引用、排名或推薦。失敗或未知證據不補零，也不由 DeepSeek 猜測。
