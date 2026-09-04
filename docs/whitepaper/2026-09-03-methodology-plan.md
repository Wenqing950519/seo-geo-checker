---
type: whitepaper-planning-handoff
project: GeoCheck
status: planning-only
created: 2026-09-03
scope: product-and-methodology-whitepaper
---

# GeoCheck GEO 方法論／產品白皮書規劃交接

> 本文件不是正式白皮書、研究結果或已核定研究設計。它保存 2026-09-03 對目前 repository 的唯讀盤點，供後續在其他 session 延續。

## 工作目標

為具 SEO／GEO 基礎、但未必具工程背景的行銷人、PM、研究者與企業讀者，建立一份公開網頁白皮書。正文應依序說明：為何這樣設計、GeoCheck 量什麼、一次檢測如何運作、指標如何理解、方法依據與限制。

## 已確認的範圍

- GeoCheck 量測指定 Perplexity 查詢集下的可觀測 GEO 證據；不承諾引用、排名、推薦、流量、獲客或營收效果。
- 目前產品主分數是 `AI Trust Index v1.0.0`；舊 GEO V3 只保留供歷史追溯，不應形成新白皮書結論。
- 白皮書需分開說明「單站產品檢測」與「可發布的研究批次」。兩者的題組規則不同，不能合併描述。
- 本文件中的產品實作描述可作為 implementation fact；是否有效、可外推或足以支持產業結論，需另外取得證據與作者核准。

## 建議章節

| 章節 | 核心問題 | 現有實作可支持的說明 |
| --- | --- | --- |
| 1. 範圍與問題 | GeoCheck 解決什麼，又不聲稱什麼？ | 指定條件下的可觀測證據，不是全網 AI 保證或商業成效指標。 |
| 2. 量測對象 | AI Trust Index、GEO Core、站內準備度有何差異？ | 產品總分、原始研究記錄與站內技術／內容訊號彼此分離。 |
| 3. 單站產品檢測 | 一次提交網站後，系統如何形成報告？ | 抓取網站、判讀結構、產生並驗證候選題、Perplexity 觀測、解析答案與引用、輸出報告。 |
| 4. 白皮書研究批次 | 為何跨樣本比較不能使用動態逐站題目？ | cohort 使用人工審核、凍結的共同非品牌題組，並先通過 entity master 覆蓋檢查。 |
| 5. 指標解讀 | 65／35、有效分母、unknown、69 分封頂代表什麼？ | 分數由答案採用率與第一方官方 URL 來源證據率組成；unknown 不作 0；少於兩次有效 query-run 時封頂。 |
| 6. 證據判定 | 提及、引用、第一方來源、實體對齊如何區分？ | 回答正文的品牌採用與來源 URL 證據分開保存；直接實體查詢不進 discovery 總分分母。 |
| 7. 站內準備度 | 抓取、robots、sitemap、Schema 與內容訊號可說明什麼？ | 可描述網站準備訊號及其限制；不可稱為 AI 引用或排名保證。 |
| 8. 限制與治理 | 結果受哪些條件限制，如何更正或復現？ | 揭露模型、平台、題組、資料期間、失敗率、版本、雜湊與不適用範圍。 |

## 產品流程：兩條不能混用的路徑

### 單站產品檢測

```text
公開網站 URL
  -> 首頁／代表頁抓取與技術訊號
  -> DeepSeek 依頁面證據產出 5–8 個候選非品牌題
  -> 本地規則排除品牌題、重複題與意圖不足題，選出兩題
  -> Perplexity 執行一個實體對齊查詢與兩個 discovery query-run
  -> 回答與引用解析、官方網域對齊
  -> AI Trust Index、GEO Core、站內準備度與個別報告
```

若候選題未通過驗證，系統不呼叫 Perplexity，AI Trust Index 以 `unknown` 呈現。

### 可發布白皮書研究批次

```text
研究問題與分析單位
  -> DeepSeek 草擬代表性產業題目
  -> 人工審核並凍結共同非品牌 query set
  -> 人工審核 entity master：品牌、別名、官方網域、owned URL
  -> 付費呼叫前的 preflight 覆蓋檢查
  -> 全 cohort 使用相同題組的 Perplexity query-run
  -> 每站一次 DeepSeek 基本資料／結構分類
  -> 保留 JSONL、CSV、方法、失敗紀錄與資料集雜湊
```

白皮書批次禁用動態逐站題目與 provider fallback；DeepSeek profile 只可供分組與描述，不得改變分數或產生優化建議。

## 已確認的計算與資料處理

### AI Trust Index v1.0.0

```text
AI Trust Index
  = 0.65 × 答案採用率
  + 0.35 × 已驗證第一方官方 URL 的來源證據率
```

- 兩個成分共用「有效且可見的 discovery query-run」分母。
- 有效回答未提及品牌或未引用官方 URL 是已量測的 0。
- 拒答、供應商失敗、不可解析回答與不可用輸出為 `unknown`／排除值，不計為 0。
- 沒有有效可見回答時，指數為 `null`／`unknown`。
- 有效 query-run 少於兩次時，保留 raw score，但產品顯示值上限為 69，標記為覆蓋不足。
- 品牌／實體 authority query 只協助別名、實體與來源對齊，不進入非品牌 discovery 分母。

### 站內準備度與歷史分數

- 站內準備度以本地確定性規則檢查抓取、收錄設定、robots、sitemap、canonical、metadata、JSON-LD、可讀文字、圖片 alt、標題結構與內容訊號。
- 此結果不進入 AI Trust Index，不可稱為 AI 已引用、已收錄或將被推薦的證明。
- 歷史 V3 的混合 GEO 分數仍在程式輸出中作追溯，但不得進入新白皮書結論。

## 需外部證據的主張清單

| 擬主張 | 所需證據 | 建議蒐集方式 | 不可替代的內容 |
| --- | --- | --- | --- |
| LLM／AI 搜尋回答會因時間、模型或提示而改變 | 原始研究、可復現預印本、平台官方文件 | arXiv 搜尋後讀全文；追溯引用鏈 | 不能由單次 GeoCheck 結果推出。 |
| 可見度的構念與量測設計 | 資訊檢索、答案評估、品牌提及與可複現性研究 | arXiv／Semantic Scholar；建立 claim-evidence ledger | 不可把產品權重稱為學界標準。 |
| Perplexity 的 API、模型與引用輸出行為 | Perplexity 官方 API／產品文件與版本紀錄 | Firecrawl 先搜尋，再抓取官方原文 | 不可反推未公開排序或引用機制。 |
| 第一方 URL 為何可作來源證據 | 來源可驗證、實體對齊、引用品質的研究或驗證設計 | 研究檢索；必要時另設人工驗證研究 | 不代表答案完整、正確或模型內部信任。 |
| 站內訊號與搜尋可讀性的關係 | 官方標準、爬蟲文件與實證研究 | 官方文件優先，研究為輔 | 不可直接稱為提升 AI 推薦率。 |
| GEO 與流量／商業成效的關係 | 原始市場資料、訪談、前後測或對照研究 | 政府／第一手資料與研究設計 | 橫斷面相關不可宣稱因果。 |

## 作者決定清單

1. 第一版是否明確定位為「產品方法與透明說明」，而非產業實證白皮書？
2. 65／35 與 69 分封頂在公開版中應定位為產品 v1 規則，或要等待效度研究後再列為正式方法主張？
3. 是否同時公開單站產品流程與白皮書研究流程？若公開，需以兩張獨立流程圖呈現。
4. 站內準備度與改善建議是否只作為附屬產品功能，不納入 GEO 方法論主體？
5. 第一版的可複現性承諾為何：公開哪些題組、entity master、原始輸出、失敗紀錄、資料集雜湊與更正紀錄？

## 建議的後續工作順序

1. 作者先回答上列五項，並將重大決定記入 `docs/DECISION_LOG.md`。
2. 建立白皮書 research registration：單篇 RQ、範圍、讀者、地域、平台、分析單位、發布邊界與不回答的問題。
3. 建立 claim-evidence ledger，再以 arXiv、官方文件與第一手資料填補外部主張。
4. 決定是否需要正式 cohort 研究；若需要，先完成題組與 entity master 人工核准，才可啟動付費批次。
5. 依已核准主張撰寫正文，最後進行反方檢查、限制檢查、利益關係與 AI 使用聲明檢查。

## 主要實作依據

- `docs/CURRENT_STATE.md`
- `docs/AI_TRUST_INDEX_V1.md`
- `docs/DECISION_LOG.md`（尤其 D-019、D-020、D-021）
- `mock-api/lib/ai-trust-index.js`
- `mock-api/lib/geo-measurement.js`
- `mock-api/lib/perplexity-visibility.js`
- `mock-api/lib/query-planner.js`
- `mock-api/lib/real-lite-audit-v2-core.js`
- `.agents/skills/geo-whitepaper-research/SKILL.md`

## 驗證紀錄

- 2026-09-03：執行 `npm.cmd test`，目前全套測試通過。
- 此結果只驗證程式與契約的一致性，不構成外部效度、研究結論或出版資格。
