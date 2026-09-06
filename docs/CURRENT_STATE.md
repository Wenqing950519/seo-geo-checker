---
type: current-state
project: GeoCheck
last_updated: 2026-09-06
tags:
  - geocheck
  - current-state
---

> [!note] 本檔原名 `CURRENT_OPERATIONAL_STATUS.md`，2026-07-25 移入 `docs/` 成為 Contract 指定的 `CURRENT_STATE.md`。
> 內容未經改動。此檔為營運現況的共同事實來源；狀態變更時必須更新此處，不得只寫在對話或記憶中。

# GeoCheck 當前運作狀態

更新日期：2026-09-06

## 已完成

- `[正式站已驗證 2026-09-02]` AI Trust Index v1.0.0 已取代產品／報告的主分數：可見答案採用率 65%、已驗證第一方官方 URL 來源證據 35%。GEO Core 保留兩層、query-run 分母與原始證據；站內準備度與建議不進入此分數。
- `[正式站已驗證 2026-09-02]` 無有效可見回答時，AI Trust Index 為 `unknown`／`null`，不補成 0；少於兩個有效 query-run 時封頂 69。API、HTML 報告與 Markdown 已共同呈現此狀態、provider/model 與限制；舊 GEO V3 僅存 `legacy_geo_score` 供歷史追溯。

- `[歷史 V3]` Algorithm V3.0.0 曾採 GEO-first：Perplexity 搜尋觀測 50%、內容可引用性 30%、必要技術存取 20%。既有 V3 資料保留追溯，不併入 AI Trust Index v1 或新白皮書統計。
- `[歷史 V3]` Perplexity 無法量測時，整體 GEO 分數為未知；站內準備度不得冒充 GEO 分數。
- `[已確認 2026-09-06]` DeepSeek 不參與計分。單站報告由 DeepSeek 先辨識產業並產候選題，再由後端選四題交給 Perplexity；若首輪候選不合格會重產一次，仍無法選出四題時停止 Perplexity 並正確標示 `unknown`。這個保守路徑已驗證，但「自動題型備援是否可進入產品量測」尚待使用者決策。
- `[已啟用 2026-09-06]` 專用 `geocheck-reports` D1（APAC；`audit_reports` migration 已遠端驗證）保存單站成功報告，並以網站、題組模式／內容與 pipeline 版本作為快取身分；同題組且未過期才重用，避免不同自訂題或版本誤用舊結果。Render 已使用帳戶範圍的最小 D1 編輯權限 token 啟用持久保存；公開唯讀狀態端點已確認 `reportStore.enabled: true`，未以付費稽核作為驗證。
- 網站與 Skill 共用 `mock-api/lib/geo-measurement.js`，並由同步測試阻止權重漂移。
- 白皮書先由 DeepSeek 草擬候選題並強制人工審核凍結；使用兩題題庫時每站 Perplexity 3 次、DeepSeek 描述 1 次，並保留獨立硬上限、JSONL 續跑與資料集雜湊。正式 batch 會在任何 provider 設定或付費呼叫前，拒絕未覆蓋、pending、缺品牌／官方網域，或共用網域未明確對應 owned URL 的 entity-master 樣本。
- DeepSeek 改採官方 API 直接呼叫；單站結構化判讀的備援順序為 DeepSeek → GPT-5.6 Luna → Gemini，並記錄實際 provider。白皮書批次明確禁用備援，避免同一 cohort 靜默混用模型；部署後仍須以健康檢查驗證金鑰與連線。
- 後台維持無公開入口的 `/<ADMIN_PATH_TOKEN>`，並以 `ADMIN_TOKEN` 驗證用量與研究代理請求。
- GA4 使用者旅程 tracking schema v1.0 已在 repo 完成：涵蓋 landing、CTA、URL submit、分析開始／完成／失敗、報告查看、下一步、第二次分析與 lead submit；UTM 於同一 browser session 跨首頁／報告頁保留，受測網址與聯絡個資不送入自訂事件。已完成本機流程與去重測試；正式站部署後仍須以 GA4 DebugView／Realtime 驗收實際收件。
- `[已確認 2026-08-14]` Product Activation 定義為 `result_viewed`，Business Conversion 定義為 `lead_submitted`，兩者為目前僅有的 GA4 Key Events。`second_analysis` 只代表 Repeat Intent；成功重複使用由 BigQuery／SQL 依同一匿名使用者後續新的 `analysis_completed → result_viewed` 流程判定。詳見 D-018。
- `[已確認 2026-08-22]` 產品層核心指數命名為 `AI Trust Index`／AI 信任度；其可觀測定義是 AI 對品牌答案的採用率與引用來源證據的真實度。詳細方法以來源可驗證、品牌實體對齊、內容相關與主張支持度操作化，不代表模型內部信任。研究層暫稱 `GEO Core`，保留來源層、答案層與原始 `query-run`。
- `[已確認 2026-08-22]` AI Trust Index／GEO Core 中，`unknown` 不等於 0；產品以特殊狀態標示目前沒有可用證據，統計上不得併入 0 的分母，也不得解讀為已證明品牌不存在。`query-run` 的重跑與分母影響須在詳細方法文件說明。

## 供應商實測

| 服務 | 狀態 | 證據 |
|---|---|---|
| Perplexity Sonar | 正式站已驗證 | 2026-09-02 `POST /api/test-search-provider` 回傳 HTTP 200、provider `perplexity`、model `sonar`。 |
| DeepSeek V4 Flash | 正式站已驗證 | 2026-09-02 `POST /api/test-provider` 回傳 HTTP 200、provider `deepseek`、model `deepseek-v4-flash`。 |

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

## 尚未完成的交付門檻

完整的 AI Trust Index v1 發布與正式環境驗收，見 `docs/DEPLOYMENT_RELEASE_CHECKLIST.md`。2026-09-02 已完成首頁、`/healthz`、legacy endpoint retirement、兩個 provider，以及 unknown 報告 API／HTML／Markdown 的受控驗證。

1. `[產品決策待確認]` 若 DeepSeek 兩輪後仍無法提供五題有效候選，產品要維持 `unknown`，或採用可見、版本化的固定題型備援。這會改變 query-run 的形成方式，不能由 Agent 自行決定。
2. `[人工輸入待備齊]` 白皮書正式 batch 仍需要核可的 site list、凍結 query set 與覆蓋所有網址的 reviewed entity master；尚未開始任何正式付費收數。
3. `[每次發布]` 執行 `npm.cmd test`；任一同步、計分或安全測試失敗都不得部署。

## 對外聲明

GeoCheck 量測的是公開網站與指定 Perplexity 查詢集下的可觀測 GEO 證據，不保證任何 AI 引擎一定引用、排名或推薦。失敗或未知證據不補零，也不由 DeepSeek 猜測。
