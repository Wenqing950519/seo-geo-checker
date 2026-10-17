# 2026 年 10 月白皮書數據紀錄：Wave 1

10 月紀錄已建立，目前完成的是 9 月基準核對與 Wave 1 收數準備；本檔沒有 10 月新量測結果。

版本：october-record-v0.1；建檔日期：2026-10-15（Asia/Taipei）。本地研究工作稿，尚未對外發布。精確核對時間見 [baseline-audit.json](preparation/baseline-audit.json) 的 `recorded_at`。

## 執行狀態

任務階段：既有證據整理與每波凍結前準備。可用來源為已核准的 H2 cohort、v2.0 題組、Wave 0 JSONL／CSV、37 份 raw JSON 與 API 用量帳本。已驗證項目為輸入契約、基準資料集語義雜湊、用量帳本語義雜湊，以及每個成功網域的三題 raw 回答連結；檔案逐一 SHA-256 見 `baseline-audit.json.source_files`。

未驗證來源：10 月新回答、當期商家營業與網域歸屬、10 月 runtime 模型／設定、完整帳單成本，以及 9 月原始收數 source commit。此次查閱時的工作樹 HEAD 為 `df246014797360a1119686130cfa9d0fdb276345`，有既有未提交改動；它只識別本次查閱環境，不能冒充 9 月收數版本，也未凍結為 Wave 1 執行版本。

可使用主張限於下列 OBS 帳本內的 9 月儲存結果。資料缺口為 10 月整波資料、逐呼叫與最終回答對帳、人工複核紀錄與當期設定。不能形成 9→10 月增減、推薦穩定度、全體 AI 能見度、網站改善效果或營收／流量因果結論。

需要作者決定的項目：Wave 1 實際採集窗口與模型設定、是否沿用既有 cohort／題組，以及含重試的實際請求和金額上限。既有核准紀錄保留；本檔不新增人工核准。

【禁止進入正式寫作】10 月證據帳本尚無新量測。以下僅為基準紀錄與待補資料，不生成 10 月實證結論。

## 研究範圍與可比較條件

沿用研究登錄的主問題：同一人工核准 cohort 在 9 至 12 月各波的答案採用率、已驗證第一方 URL 來源證據率、有效 query-run 與未知／失敗率如何變動。這是描述性追蹤；每波採集日期才是資料代表時間，並非整個月份的連續觀測。

既有 cohort 為 70 筆已審核候選、63 家納入店點、7 家排除，對應 49 個去重網站根網域。結果單位是網站 × 波次及網站 × 題目 × 波次，不能稱為 63 家餐廳均有獨立分數。追蹤鍵應保存原輸入 URL／網域、store_id 與實際 final URL；9 月有轉址，直接用 final URL 等值連接會漏列。

題組 `xinyi-dining-2026h2-v2.0` 於 2026-09-09 由 `eason` 核准。若沿用，完整三題為：

| query_id | 固定題目 |
|---|---|
| dating-celebration-01 | 台北信義區有推薦適合約會或慶祝生日的高級餐廳嗎？ |
| gathering-general-01 | 台北信義區聚餐推薦？ |
| hotpot-bbq-01 | 信義區想吃高評價的火鍋或燒肉推薦？ |

9 月方法記錄為 Perplexity `sonar`、DeepSeek `deepseek-v4-flash`（release `0731`），pipeline `3.0.0-query1.5.0-perplexity-p2.1.0-s3.1.0-trust1.0.0`、profile `1.1.0`、parser `2.1.0`、scoring `3.1.0`。這些是歷史設定，10 月是否相同仍須確認。MCAC 與 Platform 四引擎 benchmark 屬不同設計，未納入本紀錄。

## 基準與待填數據

| 指標與分母 | 9 月 Wave 0：本次重算 | 10 月 Wave 1 |
|---|---:|---|
| 網域結果列數 | 49 | 尚未收數 |
| 成功／結果網域 | 37/49（75.51%） | unknown |
| 失敗或未知／結果網域 | 12/49（24.49%） | unknown |
| 成功站有效探索 query-run | 111（37 × 3） | unknown |
| 對應受測品牌被提及／有效探索回答 | 3/111（2.70%） | unknown |
| 對應受測品牌第一方來源被引用／有效探索回答 | 0/111（0.00%） | unknown |
| 儲存的站點答案採用率平均 | 2.6756756757%（n=37） | unknown |
| 儲存的 AI Trust Index 平均 | 1.7432432432（n=37） | unknown |

上述提及與第一方引用數是依已儲存 parser 判定加總，尚未逐筆人工判讀。3/111 的 pooled rate 與儲存站點百分比的平均略有差異：後者沿用已四捨五入的站點值。兩者分開保留，後續同口徑比較。

每題有 37 筆有效回答，各有 1 筆對應目標品牌提及、0 筆目標第一方引用；每題的完整回答文字 SHA-256 各有 37 個不同值。文字不同不足以證明統計獨立。0/111 也不表示所有回答完全未引用任何餐廳官網，更不支持官網缺陷造成引用不足的因果解釋。

9 月結果列時間為 2026-09-09 14:41:47.952 至 14:56:54.230（Asia/Taipei）；用量帳本事件涵蓋當日 14:12:03.354 至 14:57:32.768。前者是結果記錄時間，不能替代每一個 API 請求的精確採集時間。

12 筆失敗在資料中分為 `crawl_quality` 5、`url_dns` 3、`translate_fetch` 4。這些是程式記錄的失敗階段；不據此認定全部為 WAF／SPA，也不推論 AI 爬蟲必定被阻擋。失敗列的三個核心指標維持 null，未補 0。

## 用量與完整性

帳本有 337 個不重複事件 ID，狀態均記為 success：Perplexity 262 次，DeepSeek 75 次，合計 299,666 tokens。操作數為 authority 75、discovery_1 75、discovery_2 75、discovery_3 37、structured_analysis 75。它和最終 37 組三題結果不是一對一；尚未確認各事件屬於哪些最後保留、先前執行或其他處理，不擅自稱為重試。

全部 262 次 Perplexity 事件的 `costConfigured=false`，因此完整成本為 unknown。summary 的估算金額未涵蓋完整供應商費用，不能作全批成本。舊報告的「API 請求成功率 100%」僅能描述已記帳事件狀態，不能替代整體站點量測成功率。

核對通過的語義雜湊如下；這與檔案 bytes 的 SHA-256 是不同定義：

| 對象 | SHA-256 |
|---|---|
| Wave 0 按輸入順序選取 stableResearchRow 欄位並序列化 | `03a0f5eb0053e45e40bbd86ce695e04e35fb0c4d087a132cdc1b689143d84907` |
| 用量事件逐筆 JSON 序列化、以換行連接且無末尾換行 | `1827822294f145aa7b7ec97988e6d3cf327f65734f2d126905ac86c5b98debc5` |

## Wave 1 執行前紀錄

以下為依既有研究設計計算的準備值，狀態為 `pending_author_wave_freeze`。49 站 ×（1 authority＋3 discovery）＝196 次 Perplexity 邏輯呼叫；49 次 DeepSeek profile；沿用已核准題組時草擬呼叫為 0。這是邏輯呼叫規劃，不是含所有內部嘗試的費用或實際 HTTP 請求保證。

現有 batch 的 `--max-perplexity-calls`／`--max-deepseek-calls` 會檢查待跑站點的規劃量；這次未驗證它們能限制所有內部嘗試。9 月帳本也高於當時 methodology 的 196／49 規劃量，須先對帳並確認實際預算控制。10 月採集起訖、USD／TWD 金額上限、執行 source commit、帳戶與區域／語言／system prompt 等完整設定、人工複核者均待凍結；不以歷史標籤推定現況。

沿用 cohort 的建議可保留比較基礎，但反方是商家營業／網域可能已變更、模型即使同名也可能更新，差異未必來自商家。應另記 cohort 異動，分開報全波有效樣本與兩波均有效的 matched panel；本次沒有替作者選擇新的樣本或穩定度指標。

## 證據對照與重跑

| Claim ID／類型 | 本紀錄可使用的主張 | 來源與定位 | 人工核准 |
|---|---|---|---|
| OBS-OCT-PREP-001／OBS | 既有輸入契約為 70 候選、63 納入、7 排除、49 網域及核准三題 | S01；`node scripts/verify-whitepaper-inputs.mjs` 四項通過 | 輸入保留原核准；本次紀錄待複核 |
| OBS-OCT-PREP-002／OBS | 9 月 49 列中成功 37、失敗 12 | S02；`baseline-audit.json.baseline` | 待複核 |
| OBS-OCT-PREP-003／OBS | 儲存判定 3/111 目標提及、0/111 目標第一方引用 | S02＋S03；`baseline-query-runs.csv` 的 valid／brand_mentioned／first_party_cited | 待逐筆複核 |
| OBS-OCT-PREP-004／OBS | 337 帳本事件，262 次費用未設定 | S04；`baseline-audit.json.usage` | 待對帳 |
| OBS-OCT-PREP-005／OBS | 資料集與帳本語義雜湊吻合 | S02＋S04＋S05；`baseline-audit.json.baseline` | 程式驗證；待人工複核 |

來源均屬 P0、由 GeoCheck 研究工作區保存，資料年份 2026；本次擷取日期 2026-10-15。S01＝`research/inputs/xinyi-restaurants-h2-2026/` 的 reviewed registry／entity master、approved sites 與 approved query set；S02＝Wave 0 `results.jsonl`／`methodology.json`；S03＝同目錄 `raw/*.json`，逐筆原文 locator 見下方 CSV；S04＝同目錄 `api-usage-events.jsonl`／`api-usage-summary.json`；S05＝`.agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs` 的 stableResearchRow 與雜湊流程。各完整檔案路徑、byte 數與 SHA-256 均保存於 [稽核 JSON](preparation/baseline-audit.json)。這些來源只支持本地儲存結果，不代表對外商家資訊已重新查證。

從 repository 根目錄執行 `node research/work/audit-wave0-for-october.mjs`，會離線重建 [111 筆基準明細](preparation/baseline-query-runs.csv) 與稽核 JSON，不呼叫供應商、不改原始資料。程式檢查一對一樣本連接、失敗 null、原始回答檔與題組對應、有效分母、事件 ID 及帳本 hash；資料集 hash 的布林結果也須為 true。未重新驗證語意抽取、推薦／提及區別或來源正確性。

建議人工驗收：先核對三筆目標品牌提及及其上下文，再覆核共用網域歸屬與各類失敗，最後對齊用量事件與保留回答。建議學習紀錄內容：同一研究中店點、網域、query-run 與付費呼叫各有不同分母；比較前須先對齊觀測單位與有效樣本。本次未改寫正式 Learning Log 或決策紀錄。
