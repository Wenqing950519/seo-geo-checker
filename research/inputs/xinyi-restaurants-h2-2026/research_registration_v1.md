# 2026 下半年信義區餐廳 AI 曝光度基準與變化追蹤報告

版本：research-registration-v1.0  
建立日期：2026-09-03  
狀態：研究方向已由作者確認；尚未核准任何付費 AI 證據批次  
正式決策：`docs/DECISION_LOG.md` D-022  
最高規範：`docs/attachments/GEO_RESEARCH.md.docx` v1.0.0

## 0. 時間標示與出版邊界

本報告的對外名稱採用「2026 下半年」，但其 **計畫觀測窗僅為 2026-09-03 至 2026-12-31**，有效觀測以每波實際收集日期為準。封面、摘要、每張結果圖與方法章均須列出各波實際收集日期；本研究不持有、也不宣稱重建 2026 年 7 至 8 月的 AI 回答。

研究只描述指定 Perplexity 模型、固定且人工核准的無品牌查詢集、指定語言／地區設定與各波收集窗口下的可觀測結果。它不代表所有 AI 系統、不揭示模型內部排序邏輯，也不估計餐廳營收或獲客效果。

## 1. 研究問題

**主研究問題**：在固定、人工審核後的信義區餐廳網站 cohort 中，2026 年 9 至 12 月各觀測波的品牌答案採用率、已驗證第一方 URL 來源證據率、有效 query-run 比率與 `unknown`／失敗率呈現何種分布與變化？

**次研究問題**：

1. 在同一波次中，連鎖／飯店與獨立／地方品牌、菜系、價格帶、商場／非商場等預先定義分組的結果是否不同？
2. 相同網站與相同查詢在不同波次的觀測是否穩定；若不穩定，變動主要出現在答案採用、來源證據、有效分母或量測失敗？
3. 店點資格、共用網域與網站存取狀態的變動，對可量測 cohort 有何影響？

上述問題只支持描述性分布與時間內觀察。不得把差異寫成網站特徵、SEO、內容作法或 GeoCheck 造成的因果效果。

## 2. 清單與分析單位

| 層次 | 定義 | 現況與用途 |
| --- | --- | --- |
| 候選母體 | 既有 140 家信義區餐廳線索 | 只作審核起點；不得直接視為樣本或母體普查。 |
| 店點 cohort | 正常營業、信義區、對一般消費者開放且提供內用的品牌 × 門市 | 目標約 110 家；須由人工填妥資格、證據與排除理由後凍結。 |
| 網站量測 cohort | 對應店點的去重公開網站根網域 | 只量一次；原有 50 家／46 根網域是線索，不是最終 n。 |
| 共用網域群組 | 多品牌或多門市共用的根網域 | 必須在 entity master 列明各店的 `owned_urls`；無法精確歸屬時不納入品牌層結果。 |
| 時間面板 | 同一凍結網站 cohort 的四個波次 | 基準波與 10、11、12 月各一波；每波精確日期、時區與設定在呼叫前凍結。 |

`candidate_cohort_registry_v1.csv` 是本篇的重整候選清單，不是 reviewed entity master，也不能直接交給付費 batch。

## 3. 固定量測與分析規則

- 每站每波執行 1 次 authority query、每一題人工核准的 unbranded discovery query，以及 1 次 DeepSeek V4 Flash 描述性 profile；Perplexity 與 DeepSeek 的實際 model、pipeline、parser 和 profile 版本全部記錄。
- 同一 cohort 內每個網站使用完全相同的 unbranded query set。現有 `research-input/query-set.xinyi-dining.example.json` 只是候選題庫；作者審核、版本化與凍結後才可使用。
- 研究主結果先報 GEO Core 原始層：答案採用率、來源證據率、有效分母、entity grounding、`unknown` 與失敗率。AI Trust Index v1（65%／35%）只能作產品層輔助欄位，且不能取代兩個構面或原始 query-run。
- 拒答、provider 失敗、無可見回答與無法解析輸出保留為 `unknown`，不補為 0、不放進 0 的分母。可見且可判定的回答未提及品牌或未引用已驗證官方 URL，才是量測 0。
- 低分可識別小型商家只做彙總或匿名；研究不產出優化建議、行動清單、排名榜或預期效果。

## 4. 正式量測前的閘門

1. [已完成 2026-09-09] 人工完成候選 cohort registry：70 筆候選逐列審核，63 家合格（`include`）、7 家排除（`exclude`）並完整記錄排除理由、地址、營業、證據 URL 與審核者 `eason`。
2. [已完成 2026-09-09，經方案 A 確立為 63 家合格餐廳對應 49 個去重根網域] 核准店點 cohort、去重網站清單與 exact reviewed entity master；計算並記錄輸入檔 SHA-256：
   - `xinyi-70.cohort_registry.reviewed.csv`: `811bb9c9ba205c1ca31e5d9f47691a22a725e8815b3b5dee378e6e19a35ec5f7`
   - `xinyi-70.entity_master.reviewed.csv`: `7293782a31876806d5c9da6fe45fd26dbf10670d8fbafe2b1cc024d71e8b110a`
   - `xinyi-49.sites.approved.csv`: `2a455be2198afb77cd02f8219b054b6268786d69c1be5c5fd4ea3374e20bfd4b`
   - `query-set.xinyi-dining-h2-2026.approved.json`: `8b30d91a3a74b46d29338fd4034fe68feb44a338d2c98530b51109b7be3c5954`
3. [已完成 2026-09-09，升級真實情境題組 v2.0] 人工審核並另存 approved query set，包含 `query_set_version: xinyi-dining-2026h2-v2.0`、`reviewed_by: eason`、`reviewed_at: 2026-09-09`、`review_status: approved`，包含三題真實無品牌搜尋問題（約會慶生推薦、信義區聚餐推薦、高評價火鍋或燒肉推薦）。
4. [待每波凍結] 每波開始前凍結該波的日期／時區、模型、網站輸入 hash、query-set 版本、預算與硬上限；若 model、query 或 cohort 改變，須新版本並分開報告。
5. [進行中] 透過 whitepaper preflight / zero-API 抓取預檢，確認沒有 pending entity、缺官方網域、未覆蓋 URL 或未映射的共用網域，並標記網站連線基線後，才可執行付費 batch。

## 5. 預計證據包與交付結構

每波至少保存 `results.jsonl`、`results.csv`、`summary.json`、`methodology.json`、API 用量檔、原始答案／來源、失敗紀錄及資料集 hash。年底的對外白皮書採視覺化 deck 形式，但每個圖表必須能回到樣本、分母、觀測日期、Claim ID 與原始資料。

1. 研究範圍與透明聲明。
2. cohort 建立、排除與樣本結構。
3. 9 至 12 月 AI 曝光度基準與波次變化。
4. 預先定義分組的描述性比較。
5. `unknown`、失敗、cohort 異動與限制。
6. 方法、query set、資料字典、Claim／Source ledger、AI 使用與利益關係揭露。

## 6. 研究工作流與 skill 分工

| 工作 | 本專案可用／建議能力 | 產物 |
| --- | --- | --- |
| cohort 與付費量測 | 已安裝 `geo-whitepaper-research` | 凍結 query set、entity master、波次 evidence dataset。 |
| 主張與來源管理 | `docs/RESEARCH_STANDARD.md` 現有的 Source／Claim ledger 規則；可評估增設 `grounded-citations` | 逐主張證據帳本。 |
| 學術與平台背景查證 | 官方文件與原始論文；可評估增設 `research-agent`、`arxiv`、`firecrawl` | 已驗證 TECH／GOV／S1 背景來源。 |
| 方法與全文紅隊 | 可評估增設 `grill-me` | 反方、過度宣稱與出版前稽核。 |
| 最終文字 | 可評估 `research-paper-writing`、`humanizer` | 有敘事但不犧牲證據的對外版本。 |

後四項是你提供的候選外部 skill，現階段尚未安裝；未安裝前不得把它們視為本專案已執行的流程。
