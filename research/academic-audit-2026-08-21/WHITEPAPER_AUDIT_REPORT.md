# GeoCheck 白皮書學術可驗證性稽核報告

稽核日期：2026-08-21  
稽核 profile：`geo-whitepaper`
主要對象：`GEOCheck_Technical_Whitepaper_V3_2026-07-16.docx`  
相關方法文件：`2026_台灣餐飲_AI搜尋能見度_白皮書研究藍圖.md`、`ALGORITHM_V3.md`、專案治理與 P1 審查紀錄

## 一、正式結論

目前不能以學術角度確認「整份白皮書的所有論點皆具備可驗證性且都有權威來源」。本輪稽核的可追溯結果是：

| 分類 | 數量 | 意義 |
|---|---:|---|
| 支持 | 8 | 在限定範圍內有官方、標準、同儕審查論文或本地可重現執行證據支持 |
| 部分支持 | 2 | 有證據支持風險或方法方向，但不足以支持普遍、因果或定量結論 |
| 被反證 | 6 | 現有官方文件、學術推論或本地治理紀錄與白皮書的強表述直接衝突 |
| 尚未完成逐句證據映射 | 376 個白皮書候選句 | 機械盤點的候選句，不能當作已驗證或已否定 |

因此，V3 目前較準確的定位是「有可重現技術基線的歷史版本＋尚未完成外部效度驗證的研究設計」，不是可以對外宣稱全部論點均已被學術證據確認的正式定稿。

產品總分名稱依目前決策使用「AI 信任度」。本報告不把它解釋成模型內部的心理信任，也不把它當成學術上已驗證的構念；它目前只能被描述為待驗證的產品指標。測量層仍應分開記錄：來源層面的可取得性／可引用性，以及答案層面的品牌出現、引用與事實正確性。

## 二、稽核範圍與方法

本輪使用 `C:\Users\eason\Documents\skill\academic-search` 的 `geo-whitepaper` profile，採取以下順序：

1. 將 V3 DOCX 完整抽取為可搜尋文本，保留段落與表格。
2. 對白皮書與研究藍圖做機械式候選主張盤點。
3. 以官方文件、標準文件、同儕審查論文、明確標示的 preprint，以及 GeoCheck 本地可重現執行紀錄建立證據帳本。
4. 對高影響力主張做分組判斷：`SUPPORTED`、`PARTIAL`、`CONTRADICTED`；證據不足時不得補寫成支持。
5. 以目前 repository 原始碼與 `npm.cmd test` 檢查實作狀態；這只能證明程式目前如何運作，不能證明權重、構念或因果關係有效。

全文盤點結果：V3 有 431 個候選句，其中 376 個被標為需要驗證；研究藍圖有 234 個候選句，其中 180 個被標為需要驗證。機械抽取會把表格欄名、標題和同一論點的拆句算成不同候選句，所以本報告以「論點群」做學術判斷，並保留原始候選庫供逐句追查。

## 三、高影響力主張判定

### 已支持，但必須保留邊界

- `WP-R01`：`robots.txt` 控制爬取，不應被寫成可靠的索引排除機制。Google 官方文件支持此區分；RFC 9309 可作為協定層補充來源。
- `WP-R02`：sitemap 有助於發現 URL，但不保證爬取、收錄或排名。Google 的 sitemap 文件與 Sitemap protocol 都支持「發現提示不等於結果保證」。
- `WP-R03`：JavaScript 造成使用者可見內容與爬蟲可見內容之間的差異。Google 官方開發者文件支持這個技術風險。
- `WP-R04`：搜尋爬蟲與訓練／grounding 爬蟲是不同的政策類別。OpenAI、Anthropic、Google 的文件支持各自產品範圍內的區分，不支持把某一家規則泛化成所有答案系統的共同規則。
- `WP-R05`：Google 的生成式搜尋功能仍建立在其核心 Search 系統上，且不需要額外的特殊標記。這只對 Google Search 生成式功能成立，不能推論 Perplexity、ChatGPT 或 Claude 的行為。
- `WP-R08`：生成答案的外部世界主張需要獨立來源與人工審查的 attribution／citation 判斷。AIS 與 ALCE 等研究支持這個評估原則，但不會替 GeoCheck 的權重或評分公式背書。
- `WP-R10`：目前 repository 有 25 個規則、合計 100 分。這由原始碼與成功執行的測試直接支持；它是實作事實，不是學術效度證明。
- `WP-R11`：目前 `geo-assessment` 實作了 technical access 20%、content citeability 30%、Perplexity observation 50% 的分層。這是程式現況；來源沒有證明這組權重合理或外部有效。

### 部分支持，不能寫成定律或已驗證效果

- `WP-R09`：LLM 輸出變異是可重現性的風險。現有 preprint 支持「需要做多次執行與分布檢查」的風險判斷，但不足以宣稱所有模型、溫度設定或部署都會以同樣幅度變異。
- `BP-R03`：EMR、share of voice、prominence、citation support、factual accuracy 已有公式和欄位草案，但還缺 frozen codebook、raw runs、eligibility decisions、locked analysis data 與已執行分析產物，因此目前是方法草案，不是已證明可重現的研究結果。

### 已被反證或必須改寫

- `WP-R06`：不能寫成 structured data 或 `llms.txt` 保證更高的 AI citation visibility。Google 明確說沒有特殊生成式搜尋標記要求，structured data 也不保證在搜尋結果中顯示；最多可寫成「可觀測、可解析或可能影響 eligibility 的訊號」，不能寫成效果保證。
- `WP-R07`：citation 出現不能證明該來源造成推薦。引用是否存在、引用是否正確、來源是否真的支持主張，是不同問題；因果影響需要另外的實驗或識別設計。
- `WP-R12`：V3 白皮書寫 Gemini 3.1 Flash-Lite 為主要結構化 provider，但目前 repository 與測試已改為 DeepSeek V4 Flash 及既定 fallback。V3 若保留原文，必須標示為 2026-07-16 歷史快照；若要做現行定稿，需更新版本與模型描述。
- `WP-R13`：V3 的 technical-only 100 分不能再描述為目前完整 production score。現行程式另有 Perplexity observation lane，且證據不足時回傳 unknown/null。白皮書應拆開「技術基線」與「答案／來源觀測」兩層。
- `BP-R01`：100 店、3 平台、516 次測試是研究藍圖的目標設計，不是已完成的研究。P1 紀錄顯示當時尚無正式樣本核准與正式批次執行。
- `BP-R02`：H1–H5 是待檢驗假設，不是餐飲品牌能見度、平台差異或因果效果的既成發現。正式執行前不得用結論式語氣發布。

## 四、定稿前必要修正

### 必修

1. 將白皮書版本狀態改成「歷史實作快照」或更新為與 current repository 一致的新版；至少修正 Gemini／DeepSeek、技術 100 分／現行分層評估的落差。
2. 將「AI 信任度」明確寫成產品測量名稱，並在方法章節說明它不是模型內部信任，也不是已完成構念效度驗證的學術量表。
3. 移除或改寫所有「schema、FAQ、cases、comparisons、proof、`llms.txt` 會提升 AI 引用／推薦」的保證式語句。若保留，應改成可觀測 proxy，並明示尚未完成 calibration。
4. 將「引用存在」與「引用正確」「來源支持主張」「來源造成推薦」拆成不同指標，不得把最後一項當成單次觀測即可證明的結論。
5. 將研究藍圖中的 H1–H5、樣本數、平台數與 516 runs 全部標為 protocol target／hypothesis，直到正式資料、資格判定和鎖定分析檔案完成。
6. 在白皮書正文建立 claim ID 到 evidence ID／URL／定位資訊的對照表。目前附錄有官方連結，但不是逐主張引用，無法讓讀者快速重現每一個重要論點的證據鏈。

### 建議在研究定稿前補齊

- 預先鎖定人工標註規則與雙人標註比例，並指定 inter-rater agreement 指標。
- 為 `content_citeability` 的五個 3 分 proxy 建立外部效度設計；在沒有 AI answer citation outcome 或其他基準資料前，不要稱作 citation probability。
- 對 Perplexity／ChatGPT／Claude 的平台比較採相同 query、同一時間窗、多次 run 與隨機化順序，保存完整 raw responses、引用 URL、截圖／回應 hash 和 model/config metadata。
- 將 `unknown`、`not observed`、`not eligible`、`not cited` 分成不同狀態，避免把缺資料當成零分。
- 補 SSRF、rate limiting、robot policy、來源快照與供應商版本等 reproducibility／安全性記錄。

## 五、目前不能下的結論

本輪證據不足以確認：

- 25 項規則的權重具有統計或學術上的構念效度。
- technical access、content citeability 與 Perplexity observation 的 20/30/50 權重能預測品牌被引用、被推薦或使用者信任。
- FAQ、案例、比較、證據內容 proxy 與任何答案系統的實際引用率存在穩定因果關係。
- 某一答案平台的爬蟲規則可代表全部 AI 搜尋或生成式答案平台。
- 台灣餐飲研究的 H1–H5 已被資料證明。

## 六、可追溯產物

- [抽取後的 V3 白皮書全文](./source-text/GEOCheck_Technical_Whitepaper_V3_2026-07-16.md)
- [V3 機械候選主張盤點](./legacy-v3/audit.md)
- [研究藍圖機械候選主張盤點](./legacy-blueprint/audit.md)
- [正式 SQLite evidence database](./research-final.db)
- [正式 evidence ledger](./exports-final-v3/EVIDENCE_LEDGER.md)
- [claims JSONL](./exports-final-v3/claims.jsonl)
- [sources JSONL](./exports-final-v3/sources.jsonl)
- [evidence JSONL](./exports-final-v3/evidence.jsonl)
- [稽核建庫腳本](./seed_external_evidence.py)

正式資料庫目前保存 18 個來源、25 段證據、16 個分組主張，以及本地測試與 legacy candidate audit 的 action／analysis 紀錄。

## 七、來源類型與限制

本輪使用的權威來源包括 Google Search Central、Google crawlers 文件、OpenAI Publishers FAQ、Anthropic crawler 文件、RFC 9309、Sitemaps protocol、Schema.org，以及 ACL Anthology 的同儕審查研究。另使用兩篇 preprint 作為方法風險的補充，不把它們當成定論。

OpenAlex provider 在本次環境中回報 `UNAVAILABLE`，因此沒有把 OpenAlex 搜尋結果當成已取得證據；本輪外部證據以可開啟的官方頁面、ACL 論文頁面與本地可重現紀錄為準。外部來源可支持或反駁命題，但不能替代 GeoCheck 自己完成的實驗、標註、校準與效度驗證。

## 八、給定稿人的一句話

白皮書目前可以定稿成「可追溯、可重現的技術基線與研究協定」，但還不能定稿成「所有 AI 信任度相關論點都已由權威研究證實」；定稿前最重要的工作是修正版本漂移、刪除保證式因果語句，並把尚未完成的研究設計清楚標為待驗證假設。
