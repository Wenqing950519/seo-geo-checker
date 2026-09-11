---
type: decision-log
project: GeoCheck
last_updated: 2026-09-02
tags:
  - geocheck
  - decisions
---

# GeoCheck Decision Log

> [!important] 這是「正式決策」的唯一憑據
> 依 `AGENTS.md` Human Ownership 條款：**未記錄於本檔的重大方向，不得視為正式決策。**
> Agent 提出的建議在使用者確認並記入本檔之前，一律是「建議」而非「已確認決策」。

## 記錄格式

每筆決策使用以下欄位。**Status 只有使用者能標記為 `Confirmed`。**

```markdown
### D-XXX 決策標題

- **日期**：YYYY-MM-DD
- **狀態**：Proposed / Confirmed / Superseded
- **決策者**：
- **決策內容**：
- **理由與依據**：
- **考慮過的替代方案**：
- **影響範圍**：
- **可追溯來源**：（commit / 文件 / 研究批次 ID）
```

---

## 待補登的既有決策

> 以下是從既有文件與程式中**觀察到已生效**、但從未正式記錄理由的決策（狀態一律 `Proposed`，待使用者確認補齊理由）。
> 依 RESEARCH_STANDARD §12.2「權重不得任意設定」，D-001 尤其需要補上依據。

### D-001 演算法 V3 權重設定為 50/30/20

- **日期**：2026-07-16（依 `ALGORITHM_V3.md` 標示日期）
- **狀態**：**Proposed — 不予補正，將由 P2 取代**（2026-07-26 更新）
- **決策者**：〔不明。2026-07-26 訪談中使用者未認領此決定〕
- **決策內容**：GEO = Perplexity 搜尋觀測 ×0.50 + 內容可引用度 ×0.30 + 網站技術基礎 ×0.20
- **理由與依據**：**無。文件與程式中皆未見推導依據。**
- **2026-07-26 補充發現**：權重實為**兩層**，先前僅記錄外層。
  - 外層 `mock-api/lib/geo-assessment.js:26`：`technical×0.2 + citeability×0.3 + perplexity×0.5`
  - **內層** `mock-api/lib/perplexity-visibility.js:105`：`mentionRate×40 + citationRate×30 + authority×0.3`
  - 內層佔總分 50%、影響更大，但從未記錄於任何文件。
- **處置**（2026-07-26 使用者確認）：不在此補寫理由，改由 **P2** 依 `PROJECT_CHARTER.md §4.2` 的構念定義重新推導。在 P2 完成前，兩層權重皆視為**未經校準的暫定值**，依 `RESEARCH_STANDARD §12.2` 不得用於對外結論。
- **考慮過的替代方案**：V2.2.1-rules（見 `ALGORITHM_V2.md`）
- **影響範圍**：所有 GEO 分數、白皮書結論、對外報告
- **可追溯來源**：`ALGORITHM_V3.md`、批次 `v3-rules-smoke-2026-07-16`

### D-002 Perplexity 缺結果時 GEO 標記為 unknown 而非 0

- **日期**：2026-07-16
- **狀態**：**Proposed — 待使用者確認**
- **決策內容**：Perplexity 無法取得結果時，GEO 必須為 `unknown`，不得為 0
- **理由與依據**：缺乏證據 ≠ 表現差；符合 RESEARCH_STANDARD §1.1「無證據，不生成事實性文字」
- **影響範圍**：分數呈現、對外解讀
- **可追溯來源**：`ALGORITHM_V3.md`、`docs/CURRENT_STATE.md`

### D-003 DeepSeek 不得影響 GEO 分數

- **日期**：2026-07-16
- **狀態**：**Superseded — 由 D-013 取代**（2026-08-01）
- **決策內容**：DeepSeek V4 Flash 僅供 profile/context 與候選題生成，不得改變 GEO score，也不可直接產生推薦結論
- **理由與依據**：**TODO — 推測與證據來源一致性有關，待確認**
- **影響範圍**：演算法效度、白皮書方法論
- **可追溯來源**：`ALGORITHM_V3.md`

---

## 正式決策

> 以下 D-004 ～ D-011 於 **2026-07-26 引導式訪談**中由使用者逐項拍板，狀態為 `Confirmed`。
> 決策者：Wenqing950519。可追溯來源：本次 session 訪談紀錄 + `docs/PROJECT_CHARTER.md`（2026-07-26 版）。

### D-004 專案目的優先序

- **日期**：2026-07-26 ｜ **狀態**：Confirmed
- **決策內容**：`研究白皮書 > 能力展示 > 商業化`。OPC 路徑因難度過高擱置，改以創業競賽為嘗試場域（標的未鎖定，不構成硬時程）。研究所路徑時點為 2028/01 或 2028 年底，**時程非重點，方法論累積性才是**。
- **理由與依據**：使用者自陳。商業化不放棄，若成功將回頭作為能力展示佐證。
- **影響範圍**：所有 TODO 的填法、白皮書嚴謹度標準、資源分配
- **可追溯來源**：`PROJECT_CHARTER.md §0`

### D-005 目標對象拆分為「產品使用者」與「研究讀者」

- **日期**：2026-07-26 ｜ **狀態**：Confirmed
- **決策內容**：charter §2 分為兩類。產品使用者＝中小企業主本人（**標記為 Assumption，無第一手證據**）；研究讀者依序為外部專業檢驗者、競賽評審、潛在客戶。採「一份研究、兩種輸出」——嚴謹白皮書為正本，客戶版摘要由正本裁切，摘要不得新增正本沒有的主張。
- **理由與依據**：兩者對嚴謹度與可讀性的需求相反，合併會迫使白皮書二選一。
- **考慮過的替代方案**：只定義單一對象（被否決）
- **影響範圍**：白皮書寫作規格、報告格式設計
- **可追溯來源**：`PROJECT_CHARTER.md §2`

### D-006 專案層研究主軸定稿

- **日期**：2026-07-26 ｜ **狀態**：Confirmed
- **決策內容**：
  > 品牌在生成式引擎中的「可見度」應如何定義與操作化，才能得到有效度且可複現的測量？
  
  研究問題分兩層：專案層主軸（本條，幾乎不變，記於 charter §4.2）與單篇白皮書 RQ（每篇不同，記於各篇 `methodology.json`）。
- **理由與依據**：專案現有困難（權重無依據、`unknown` vs `0`、說不出何謂表現好、站內 87 卻 Perplexity 0）皆為同一缺口的症狀——**構念從未定義卻已在操作化**。
- **考慮過的替代方案**：純方法論版（缺「定義」層）、場域導向版、因果／驅動因子導向版
- **影響範圍**：P2 全部設計、白皮書定位、§1 定位的回填內容
- **可追溯來源**：`PROJECT_CHARTER.md §4.2`

### D-007 產品邊界

- **日期**：2026-07-26 ｜ **狀態**：Confirmed
- **決策內容**：GeoCheck 刻意**不做**兩件事——(1) 不承諾獲客或效果；(2) 不做內容代寫與執行。
- **未納入邊界者**（保留彈性，非已排除）：Google 傳統排名檢測、Perplexity 以外的生成式引擎
- **已知衝突**：與「付費改善服務」構想矛盾。因 §6 未定，本邊界暫時成立；若日後決定販售執行服務，須先修改本條。
- **影響範圍**：對外文案、商業模式、報告內容
- **可追溯來源**：`PROJECT_CHARTER.md §1`

### D-008 A4（引用 → 獲客）以探索性相關分析處理

- **日期**：2026-07-26 ｜ **狀態**：Confirmed
- **決策內容**：白皮書補一段探索性相關分析（H-004），**禁止宣稱因果**，並必須事先揭露四項限制：資料取得（僅代理指標）、反向因果、混淆變數、時間方向。
- **理由與依據**：A4 是產品敘事的核心，但與現有對外聲明「不保證引用、排名或推薦」衝突，且無法以橫斷面資料建立因果。主動揭露邊界比硬撐結論可信。
- **考慮過的替代方案**：誠實收窄範圍（不碰 A4）、僅列為已知限制
- **影響範圍**：白皮書研究設計、產品敘事、對外聲明一致性
- **可追溯來源**：`PROJECT_CHARTER.md §3.3`、H-004

### D-009 全面重構，採 P0→P1→P2→P3 階段

- **日期**：2026-07-26 ｜ **狀態**：Confirmed
- **決策內容**：重構範圍涵蓋 GEO 計分演算法、免費健檢研究方法、白皮書研究設計、產出物與報告格式。分四階段，**僅 P3 碰 code**：
  - P0 填完 charter（使用者主導）
  - P1 拆解現有系統、產出隱性決定清單（只讀不改）
  - P2 依 §4.2 重新推導四份純 `.md` 規格（使用者設計、Agent 反方）
  - P3 依 P2 規格重寫後端（Agent 實作、使用者驗收）
  
  P2 內部順序：白皮書研究設計 → 計分演算法 → 免費健檢方法 → 產出物格式。
- **理由與依據**：使用者動機為「確保知道每個細節如何運作」，符合 Anti-Dependency Rule。但重寫 code 無法解決權重、A4、L2 三個實際痛點——它們是研究設計問題。且未盤點就重寫違反 `coding.md`「不刪除未知用途的程式」。
- **考慮過的替代方案**：直接進 P1、P0 與 P1 並行、直接動 code（均被否決）
- **影響範圍**：全專案工作順序
- **可追溯來源**：`PROJECT_CHARTER.md §9`

### D-010 協作分寸：雙方都提，使用者拍板

- **日期**：2026-07-26 ｜ **狀態**：Confirmed
- **決策內容**：P2 期間 Agent 可主動提出選項與業界做法，但一律標記為「建議」。決定權完全在使用者；經確認並記入本檔後才是決策。
- **理由與依據**：使用者要求「不要抹殺想像力和創造力」，同時不排斥參考選項。
- **考慮過的替代方案**：Agent 只提問不給方案、Agent 先出草案
- **可追溯來源**：`PROJECT_CHARTER.md §9`

### D-011 成功定義（含 L2 可複現性）

- **日期**：2026-07-26 ｜ **狀態**：Confirmed
- **決策內容**：成功＝(1) 方法論完整到能與教授對談；(2) 受過外部檢驗（至少一位外部專業讀者認真讀完並批評）；(3) 達到 **L2 可複現性**（原始資料可被第三方取得）。
- **附帶意涵**：`research-input/` 與 `research-output/` 目前被 `.gitignore` 排除，**未達 L2**。此為對外發布前的必修項。
- **未納入**：L3 獨立可重製（本階段不列為成功條件）
- **失敗訊號**：**尚未定義**（Human Ownership，待補）
- **影響範圍**：發布前檢查清單、版控政策
- **可追溯來源**：`PROJECT_CHARTER.md §7`

### D-012 設計原則：量測層／分析層分離

- **日期**：2026-07-26 ｜ **狀態**：**Confirmed（方向）／Proposed（細節）**
- **決策內容**：方向確認——量測層只產出穩定的原始訊號（是否提及、是否引用官網、來源網域、站內技術與內容特徵訊號），不合成分數；分析層每篇白皮書可自訂分析方式。**細節（切點位置、原始訊號清單）留待 P2 詳議。**
- **推論**：權重從量測層消失，只在需要對客戶呈現單一數字時出現——即權重屬產品層問題，非研究層問題。現行架構將兩者綁死於 `geo-assessment.js`，是權重爭議的結構性根源。
- **理由與依據**：單篇 RQ 每篇不同，若演算法隨之改動則跨篇資料不可比，累積性歸零；而累積性是 D-004 的核心目標。
- **影響範圍**：P2 全部設計、`ALGORITHM_V4` 架構
- **可追溯來源**：`PROJECT_CHARTER.md §5`

### D-013 結構化判讀供應商改為 DeepSeek V4 Flash

- **日期**：2026-08-01 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：以 `deepseek-v4-flash` 取代 Gemini Flash-Lite，承接產業／實體分類、候選搜尋題與白皮書描述 profile。Perplexity 維持為實際搜尋可見度的觀測來源；DeepSeek 不得改變 GEO score、搜尋觀測、引用或確定性規則點。
- **理由與依據**：使用者於本次工作明確決定並授權立即改寫。
- **考慮過的替代方案**：保留 Gemini、由 DeepSeek 取代 Perplexity（均未採用）。
- **影響範圍**：provider、設定、成本帳本、批次腳本、研究輸出 schema、報告文字、部署健康檢查。
- **可追溯來源**：2026-08-01 使用者指示；`mock-api/providers/deepseek.js`。

### D-014 結構化判讀供應商備援優先序

- **日期**：2026-08-01 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：結構化判讀與候選題生成以 DeepSeek V4 Flash 為主力；服務不可用時，依序以 GPT-5.6 Luna、Gemini Flash 作為備援。Perplexity 仍獨立負責 GEO 搜尋觀測，不在此備援鏈中。
- **理由與依據**：同條件 API 測評中，DeepSeek 的候選題結果較佳且 token 消耗較低；使用者確認 GPT-5.6 Luna 保留為第一備援、Gemini 保留為最後備援。
- **影響範圍**：provider router、環境設定、用量帳本、單站報告與白皮書批次的失敗處理與方法記錄。
- **可追溯來源**：2026-08-01 匿名 API 測評批次 `research-output/blind-deepseek-luna-2026-08-01T12-11-00`；本次使用者確認。

### D-015 商業模式驗證前採非商業首頁文案

- **日期**：2026-08-10 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：商業模式尚未驗證期間，首頁不呈現收費、價格、顧問或商業方案；保留中性的資料表單，供使用者分享網站、健檢回饋、研究問題與作品交流。
- **理由與依據**：GeoCheck 已放入個人作品集，但商業模式仍未驗證。現階段首頁應忠實呈現作品與研究計畫狀態，不預先承諾尚未成立的商業內容。
- **決策邊界**：本條只規範驗證前的對外首頁文案，不等於永久放棄商業化，也不替 `PROJECT_CHARTER.md §6` 決定未來商業模式。
- **影響範圍**：首頁導覽、專案介紹、結構化資料、使用流程、聯絡表單、送出回饋與頁尾說明。
- **可追溯來源**：2026-08-10 使用者指示；`mock-api/public/home.html`。

### D-016 首頁公開目前的研究與評分方法

- **日期**：2026-08-10 ｜ **狀態**：Superseded — 由 D-017 取代
- **決策者**：Wenqing950519
- **決策內容**：在首頁中段以白話公開報告資料流程、現行 V3 評分構面與必要限制。50/30/20 權重必須明確標示為「暫定、未經校準」，不得描述成產業標準或客觀排名。
- **理由與依據**：GeoCheck 現階段以研究與能力展示優先；讓讀者理解「量了什麼、如何得到、不能推論什麼」，比只展示單一分數更符合研究透明度與作品集目的。
- **決策邊界**：本條只說明目前實作，不替 P2 完成構念定義、效度論證或權重推導，也不把暫定模型升格為正式研究結論。
- **影響範圍**：首頁中段、`llms.txt` 導覽、首頁文案測試。
- **可追溯來源**：2026-08-10 使用者指示；`mock-api/public/home.html#method`。

### D-017 首頁方法區不呈現暫定權重

- **日期**：2026-08-10 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：首頁方法區保留白話資料流程與必要限制，但移除 50/30/20 暫定權重說明區塊。
- **理由與依據**：使用者檢視實際畫面後決定移除該區，避免首頁中段過度聚焦尚未完成推導的暫定評分權重。
- **決策邊界**：只移除首頁權重呈現，不修改目前後端 V3 計分實作，也不替 P2 完成權重推導。
- **影響範圍**：首頁方法區、`llms.txt` 導覽說明、首頁文案測試。
- **可追溯來源**：2026-08-10 使用者截圖指示；`mock-api/public/home.html#method`。

### D-018 GA4 Activation、Repeat Intent 與 Key Event 定義

- **日期**：2026-08-14 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：
  - `result_viewed` 定義為 Product Conversion／Activation；使用者真正看到檢測結果，才算完成一次核心產品價值。
  - `analysis_started` 只代表開始使用，`analysis_completed` 是系統完成分析的中間 Funnel 指標。
  - `second_analysis` 保留為 Repeat Intent，不代表成功重複使用。
  - 成功重複使用由後續 SQL／BigQuery 判定：同一 anonymous user 曾完成一次 `result_viewed`，之後開始新的 analysis flow，並再次完成 `analysis_completed → result_viewed`。不新增第三次、第四次等事件。
  - GA4 Key Event 先只設定 `result_viewed`（Product Conversion／Activation）與 `lead_submitted`（Business Conversion）；其餘 tracking events 維持一般 Funnel event。
- **理由與依據**：核心產品價值在於使用者實際看到結果；開始或系統完成分析本身不足以代表使用者取得價值。商業轉換則以使用者成功送出聯絡／回饋資料為準。
- **決策邊界**：Tracking 只能描述產品行為與漏斗，不代表廣告增量效果、獲客因果或 GEO 改善成效。
- **影響範圍**：GA4 Key Events、Activation Rate、Campaign Funnel、BigQuery／SQL 分析定義與 tracking 文件。
- **可追溯來源**：2026-08-14 使用者確認；`docs/ANALYTICS_TRACKING.md`；`mock-api/public/analytics.js`。

### D-019 研究量測與產品總分分離；產品總分命名為 AI 信任度

- **日期**：2026-08-21 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：
  - 研究量測層分開保存來源層可見度與品牌答案層可見度，不先將兩者合成單一研究分數。
  - 產品分析層保留單一總分，正式命名為「AI 信任度」，不以「GEO 分數」作為產品對外名稱。
  - AI 信任度由可觀測的回答採用、品牌提及、引用與相關證據計算；不得表述為模型內部實際的信任狀態。
  - 研究文件仍可在必要時說明 GEO／生成式搜尋的研究背景，但產品總分的定義、介面與對外語言以 AI 信任度為準。
- **理由與依據**：使用者希望保留單一產品總分，同時避免將不同可觀測事件混成研究層的 GEO 構念；「AI 信任度」作為產品指數名稱，需與模型內部機制主張分離。
- **決策邊界**：本決策確認分層架構與產品命名，尚未確認 AI 信任度的最終變數、分母、權重、缺失值處理、封頂規則與效度驗證門檻；上述內容須在 P2 演算法規格中另行拍板。
- **影響範圍**：P2 演算法規格、研究輸出 schema、產品報告命名、首頁與對外說明、後續 P3 實作。
- **可追溯來源**：2026-08-21 使用者確認；`docs/P1_CONSTRUCT_WORKING_NOTES.md` C-003～C-008。

### D-020 AI Trust Index 與 GEO Core 的產品／研究命名及觀測邊界

- **日期**：2026-08-22 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：
  - 產品層核心指數正式使用 `AI Trust Index`／「AI 信任度」名稱。
  - AI Trust Index 對外只描述兩類可觀測結果：AI 對品牌答案的採用率，以及引用來源證據的真實度；詳細方法將「真實度」拆解為來源可驗證、品牌實體對齊、內容相關與是否支持答案主張，不得描述為模型內部的信任狀態。
  - 研究層暫稱 `GEO Core`，保留來源層、答案層、原始 query-run、引用、正確性與不確定性資料。若後續找到適用的權威官方術語，另行記錄來源並升版，不回溯改寫原始觀測資料。
  - `query-run` 對結果的影響、重跑次數、查詢差異與有效分母，放在詳細方法文件中說明；產品介面不必以技術術語作為主要文案。
  - 答案層與來源層分開。來源被引用且頁面有可驗證的品牌證據，可成立來源層證據；若品牌未出現在答案正文，不成立答案層採用。
  - `unknown` 不等於 0。產品可用特殊標示表達「目前不存在可用證據／未形成可判定結果」，但統計上不得把 unknown 當作 0 或納入 0 的分母；它不提供正向證據，也不代表已證明品牌不存在。
- **理由與依據**：使用者於 2026-08-22 確認；延續 D-019 與 P1 構念工作紀錄對研究量測／產品呈現分離的方向。
- **決策邊界**：本決策尚未確認 AI Trust Index 的最終權重、最低有效 query-run 數、封頂數值、推薦層級是否進入總分，以及效度驗證門檻。`GEO Core` 目前是研究層工作名稱，不宣稱為外部正式標準術語。
- **影響範圍**：P2 構念與演算法規格、產品報告語言、研究輸出 schema、unknown 顯示規則、方法文件與後續 P3 實作。
- **可追溯來源**：2026-08-22 使用者確認；本次對話；`docs/P1_CONSTRUCT_WORKING_NOTES.md` C-003～C-009。

### D-021 AI Trust Index v1 計分、分母與 unknown 規則

- **日期**：2026-09-02 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：
  - 產品總分採用 `AI Trust Index = 65% 答案採用率 + 35% 來源證據率`；研究記錄 `GEO Core` 保留兩層，不以總分取代原始觀測。
  - 答案採用率的分子為可見回答中採用／提及已對齊品牌的 query-run；來源證據率的分子為同一批回答中，引用已驗證為第一方官方網域 URL 的 query-run。兩者共用「有效且可見的回答 query-run」分母。
  - 直接輸入品牌／實體名稱的 authority query 可用於實體對齊、別名與來源背景，但不得進入非品牌 discovery 總分分母；須另列呈現。
  - `unknown` 不等於 0。無可判定的回答、拒答、provider 失敗與無法解析輸出，保留 query-run 後排除於分母與白皮書分數統計；有效回答未提及品牌或未引用官方 URL，才是計為 0 的觀測。
  - 少於 2 個有效 query-run 時，保留原始觀測但產品顯示分數封頂 69，並標示覆蓋不足；推薦／改善文字不進入計分。
- **理由與依據**：使用者於本次對話確認 65%／35%、直接品牌查詢可納入但須分開、URL／來源與 output 採用分層、unknown 不得當成 0；封頂沿用既有少於兩題覆蓋不足防呆，改以新構念呈現。
- **決策邊界**：來源證據 v1 以可驗證第一方 URL 引用率操作化；「內容是否支持特定主張」仍保留於 GEO Core 原始證據，尚未進入 v1 數值權重。封頂 69 是產品穩定性規則，非效度已完成的科學閾值。
- **影響範圍**：`docs/AI_TRUST_INDEX_V1.md`、API schema、報告、首頁文案、白皮書 skill／輸出與測試。
- **可追溯來源**：2026-09-02 使用者確認；本次對話；D-020。

### D-022 2026 下半年信義區餐廳 AI 曝光度追蹤研究範圍

- **日期**：2026-09-03 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：
  - 本篇對外報告名稱定為《2026 下半年信義區餐廳 AI 曝光度基準與變化追蹤報告》。
  - 「下半年」為報告的對外時間框架；封面、摘要與方法章必須明示計畫觀測窗為 **2026-09-03 至 2026-12-31**，有效觀測以每波實際收集日期為準。不得暗示本研究持有 2026 年 7 至 8 月的 AI 回答觀測。
  - 研究從單次橫斷面量測改為固定 cohort 的重複觀測。候選母體仍以既有 140 家信義區餐廳線索開始；最終店點樣本、去重網站 cohort 與共用網域歸屬，必須人工審核後凍結。
  - 本文研究層以 GEO Core 的答案採用率、已驗證第一方 URL 來源證據率、有效分母與 unknown／失敗率為主要結果；AI Trust Index v1 可作產品層輔助呈現，不取代原始觀測，也不產生餐廳改善建議或因果結論。
- **理由與依據**：使用者希望從 2026 年 9 月起累積可比較的觀測資料，並明確接受在「下半年」標題下揭露僅涵蓋 9 至 12 月的限制。
- **決策邊界**：本決策不核准最終餐廳名單、各波精確日期、query set 文字、模型替代方案或個別餐廳結論；這些仍須在正式 batch 前依白皮書治理規則凍結或核准。
- **影響範圍**：下半年研究登錄、cohort 審核表、query set、正式 AI 批次、方法章與出版透明聲明。
- **可追溯來源**：2026-09-03 使用者確認；`research-input/xinyi-restaurants-h2-2026/research_registration_v1.md`。

### D-023 產品對外語言改為商家白話；AI Trust Index 中文名定為「AI 信任值」

- **日期**：2026-09-03 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：
  - 對外指標名稱定為 **「AI 信任值」**（原 AI Trust Index）。程式內部識別碼（`ai_trust_index`、`ai-trust-*` 版本字串、檔名）維持不變，只改顯示文案。
  - 首頁與報告頁的使用者可見文字，一律改用一般商家看得懂的中文，不堆砌英文術語（原 `Technical SEO`、`Structured Data`、`E-E-A-T`、`P1–P3`、`query-run`、`canonical`、`JSON-LD` 等改為白話說明或加註說明）。
  - **報告頁不再說明測試方法與模型**：移除 Provider／Model／Attempts／Latency 標頭、搜尋問題設計卡片、DeepSeek 產業規劃卡片，以及文案中的 Perplexity／DeepSeek 名稱。報告聚焦於商家要知道的事：AI 有沒有提到我、有沒有引用我的官網、我該先修什麼。
  - 方法揭露改集中於首頁「我們怎麼做的」段落與 `/llms.txt`；研究層的供應商與模型仍完整保留在報告 JSON（`report.provider`、`report.model`、`audit.ai_validation`）與白皮書輸出，未刪除任何可追溯欄位。
- **理由與依據**：使用者於 2026-09-03 指出主網頁與報告頁術語過重、報告花太多篇幅解釋測試方式，商家真正要的是「我的網站到底有沒有 AI 曝光度」。
- **決策邊界**：本決策只改對外語言與報告資訊架構，**不改任何計分規則、權重、封頂或 unknown 處理**（仍依 D-021）。內部欄位名稱與研究輸出格式不變。
- **影響範圍**：`mock-api/public/home.html`、`mock-api/server.js`（報告 HTML／Markdown）、`mock-api/lib/ai-trust-index.js`、`mock-api/lib/real-lite-audit-v2-core.js` 的顯示字串、`mock-api/tests/ai-trust-surface.test.js`、`mock-api/tests/business-loop.test.js`。
- **可追溯來源**：2026-09-03 使用者指示；D-021。

### D-024 技術白皮書完成後全站 UI/UX 改版基準與 Hero 視覺鎖定

- **日期**：2026-09-03 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：
  - **時程優先序**：全站大規模改版工作排定於「技術白皮書」撰寫完成後啟動，目前第一優先維持技術白皮書的研究、實驗與撰寫。
  - **核心視覺資產鎖定 (Locked Core Asset)**：首頁經典 Hero 視覺（三層同心圓環、360 度旋轉雷達掃描光影、5 顆圍繞的浮動品牌知識膠囊、置中大氣主標題與網址輸入檢查列）為 GeoCheck 具備高度辨識度的品牌視覺核心，**列為絕對不可更動資產**。
  - **改版參照標竿 (Design Benchmark)**：除了上述 Hero 畫面外，首頁其餘章節與深度診斷報告頁面，後續改版將參照 `https://scrunch.com/platform/site-diagnostics/`（Scrunch Site Diagnostics）之專業現代 SaaS 設計語言與功能架構（包含各分頁健康度卡片、Audit Score 圓環指標、AI 爬蟲存取與流量圖表、深入代碼與內容層級之診斷修復指引）。
- **理由與依據**：使用者於 2026-09-03 明確指示；鎖定經典 Hero 作為品牌門面，並以 Scrunch Site Diagnostics 作為未來診斷功能與產品頁面演進的對標範本。
- **影響範圍**：技術白皮書完成後之下一階段產品改版里程碑、前端頁面架構規劃。
- **可追溯來源**：2026-09-03 使用者指示與截圖。

### D-025 單站產品觀測改為四題，報告採專用 D1 持久快取

- **日期**：2026-09-06 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：單站產品健檢使用四個不重複的非品牌 discovery queries。自訂觀測題各自選填：已填題目優先保留，未填名額由網站內容規劃補足至四題。成功報告採 GeoCheck 專用 D1 持久保存，供同一網站、同一題組模式／內容與同一 pipeline 版本在有效期限內重用，避免重複消耗 API。既有白皮書人工凍結題庫不因本決策自動改為四題。
- **理由與依據**：使用者指出兩題觀測會讓產品分數集中於 0、35、65、100（或覆蓋不足封頂 69），希望提升分數解析度並保留外部使用者產生的可追溯報告。
- **決策邊界**：AI Trust Index v1 的 65%／35% 權重、`unknown` 規則、少於兩個有效 query-run 的 69 封頂均不變；四題是單站產品的 query-set 規則，並非對白皮書已凍結 cohort 的追溯改寫。不得與 THE MAP 的 `bgo-career` D1 共用資料庫。
- **影響範圍**：`mock-api/lib/query-planner.js`、單站 Perplexity 呼叫數、首頁自訂題 UI、報告 pipeline 版本、D1 migration／環境設定與報告讀取路由。
- **可追溯來源**：2026-09-06 使用者指示；D-021、D-022。

---

## 仍待使用者確認

| ID | 內容 | 阻塞 |
|---|---|---|
| D-002 | Perplexity 缺結果時 GEO 為 `unknown` 而非 0 | 仍為 Proposed，2026-07-26 未觸及 |
| — | §1 一句話定位 | 待 P2 構念定義後回填 |
| — | §6 商業模式（付費部分賣什麼） | 使用者尚未想清楚 |
| — | §7 失敗／停損訊號 | 使用者尚未定義 |

### D-026 專案目錄分層與歷史資料整理

- **日期**：2026-09-08 ｜ **狀態**：Confirmed（目錄整理範圍）
- **決策者**：Wenqing950519
- **決策內容**：使用者在 API／SDK 架構分析後，明確要求實際整理 repository，建立類似 apps／packages／services／docs 的結構，並考慮其指定的 2026-09 商業企劃路線。將 A 的資源與報告、共用規則、爬蟲、provider、HTTP 與研究工具分層，歷史規格歸檔、研究資料集中，維持 A 與研究入口可運作。
- **落地方式**：核心純規則放 packages/geo-core；有 I/O 的爬蟲放 packages/crawler；A 報告放 apps/web/report；服務入口放 services/api。mock-api 保留相容 wrapper 與原有 env／ledger 路徑。sdk、monitor、developer-console 只保留 planned 責任說明。
- **決策邊界**：這是使用者授權的檔案與 import 整理，不是商業轉型／定價／多引擎／Account／Project／Monitoring 功能的批准；不改 D-021／D-025、不刪原始研究證據、不部署。兩份策略提案的優先序差異列於 strategy/ROADMAP_ALIGNMENT.md，未自行升格為正式策略。
- **驗證**：搬移前後完整測試通過，新增 core／相容入口與無外部呼叫的 HTTP 檢查；逐檔搬移表記錄來源 SHA-256。人工線上與付費量測未執行。
- **追溯**：本次使用者要求；maintenance/layout-migration-2026-09-08.json；maintenance/REPOSITORY_CLEANUP.md。

### D-027 Developer API 採官方搜尋 API 直連，不採 OpenRouter

- **日期**：2026-09-08 ｜ **狀態**：Confirmed（架構方向）
- **決策者**：Wenqing950519
- **決策內容**：GeoCheck Developer API 的正式量測路徑分別直連 OpenAI、Google Gemini、Perplexity、Anthropic 的官方 API；OpenRouter 不作為 production measurement、fallback 或計費路由。四家都以支援原生 web search 的低成本、輕量模型為候選，並分開管理金鑰、儲值／帳務、限制與失敗。
- **理由與依據**：AI 引用與 GEO 是產品核心，搜尋 surface 本身會影響回答與引用。路由商的搜尋選擇或 fallback 會讓結果混入另一層搜尋供應商，也會把儲值與成本歸屬改到不同路徑，因此正式證據需能追溯到各家官方 API。
- **落地方式**：先建立 `official-engine-profiles` 登錄與 `SearchProvider` port，所有 Developer API profile 初始均為 `planned`。每家 adapter 需保留原生 evidence，再映射共同 observation envelope；不得抹除供應商差異。既有 A 的 Perplexity 路徑維持不變。
- **決策邊界**：本決策不代表四家 adapter、Developer API、SDK、計費或監控已完成；不授權儲值、建立金鑰或付費呼叫。各家最終 model ID、搜尋參數、啟用順序、預算與跨引擎呈現仍待能力／成本測試後確認；不改 D-021、D-025 或現有 A 行為。
- **影響範圍**：`services/api/application/official-engine-profiles.js`、`services/api/ports/search-provider.js`、未來官方 provider adapters、observation schema、usage／reservation ledger、Developer API 能力矩陣。
- **可追溯來源**：2026-09-08 使用者本次確認；各家官方 web-search API 文件。

### D-028 首批官方量測模型與 DeepSeek 統合層邊界

- **日期**：2026-09-08 ｜ **狀態**：Confirmed（模型選定；啟用待驗證）
- **決策者**：Wenqing950519
- **決策內容**：首批官方搜尋 profile 分別選用 `gpt-5.6-luna`、`claude-haiku-4-5-20251001`、`gemini-3.5-flash-lite`、`sonar`，以低成本、輕量且具原生搜尋能力為優先。DeepSeek 若後續加入，只能讀取四家已完成的觀測來產生統合輸出／摘要；不作為第五個搜尋 engine。
- **理由與依據**：使用者希望在每家官方帳戶獨立儲值與控管成本的前提下，先用輕量模型執行 GEO／引用觀測；統合文字可後置，不能改變可追溯的原始搜尋結果。
- **決策邊界**：選定 model ID 不表示已完成帳戶可用性、web-search capability、價格、rate limit、資料保留、引用格式或成本驗證。所有 profile 保持 `selected_pending_smoke`，未取得明確儲值與測試授權前不得發出任何付費請求。DeepSeek 統合層尚未授權實作，且不得改寫回答、引用、分母、`unknown` 或 D-021 分數。
- **驗證更新（2026-09-09，非新決策）**：使用者已於本輪明確要求實測；四家以同一固定 prompt 各一次、無 retry 的帳號 smoke 均成功，因此 runtime profile 更新為 `single_smoke_verified`。尚未驗證 rate limit、長期相容性、保存條款或正式 SLA，原決策邊界其餘部分不變。
- **影響範圍**：官方 engine profile 登錄、未來 adapter fixture、成本預留、觀測 metadata、統合輸出 presenter 的邊界。
- **可追溯來源**：2026-09-08 使用者本次確認；OpenAI Docs、Anthropic、Gemini、Perplexity 官方 model 文件。

### D-029 附屬 Developer API 採固定四引擎、全成才成功與計費

- **日期**：2026-09-08 ｜ **狀態**：Confirmed（產品與失敗／計費語義）
- **決策者**：Wenqing950519
- **決策內容**：Developer API 是不影響現有產品 A 的附屬產品。客戶每次提交 prompt 或 URL，GeoCheck 以不公開的內部流程固定呼叫 OpenAI、Google Gemini、Anthropic、Perplexity 四個官方 profile；不提供逐次選擇或少跑特定供應商。GeoCheck 將四家結果與強化分析包成一個專業 API 回應，而非對外呈現模型路由器。
- **成功與回傳語義**：只有四家都完成才可標記 `succeeded`。任一家在有限重試後仍失敗，整個 job 標記 `failed`；已成功的 provider 結果仍以 `partial_results` 回傳，並逐家提供狀態與可公開的錯誤分類，但不得產生或宣稱完整四家比較結論。
- **計費語義**：客戶只在四家都完成並取得完整結果時支付一次完整 request；外部 provider 或 GeoCheck 系統造成的失敗不向客戶計費。內部仍保存每家 attempt、token、搜尋工具與實際／未知成本，失敗時已發生的供應商成本由 GeoCheck 承擔並進入成本帳本。對外 request 基本費、token／超額用量門檻與價格尚待成本 smoke test 後另行確認。
- **理由與取捨**：固定四家讓商品是跨平台 GEO 分析，而不是可替換的模型轉售；全成才成功可防止不完整樣本被誤當完整比較。代價是單一供應商不穩會提高整體失敗率與 GeoCheck 吸收的成本，因此 bounded retry、錯誤分類與成本觀測是上線前必要條件。
- **決策邊界**：本決策不修改產品 A、D-021 分數、現有 A provider 路徑或公開報告；不代表 Developer API、SDK、金流、帳戶、儲值或 provider adapter 已獲准實作。DeepSeek 邊界仍依 D-028。
- **影響範圍**：B 的 API／job schema、provider orchestration、`partial_results`、計費結算與 SDK 錯誤處理；產品 A 無影響。
- **可追溯來源**：2026-09-08 使用者確認「附屬產品不影響產品 A」、「一家失敗則整體失敗但回傳部分結果」及「供應商／系統失敗不計費」。

### D-032 Developer API Key 啟用門檻與訂閱方向

- **日期**：2026-09-08 ｜ **狀態**：Confirmed（啟用與商業形式；未實作）
- **決策者**：Wenqing950519
- **決策內容**：帳戶註冊本身不開始免費試用；使用者首次進入 API Key 管理介面即開始試用／服務資格計時，即使當次沒有建立任何key也算。建立key前仍須在 Free、Basic、Premium 中選擇方案。Basic、Premium 的長期商業形式採訂閱制，而非一次性點數包；Free 仍維持不綁卡、不自動付費。
- **決策邊界**：訂閱週期、額度在每期如何發放、是否自動續費、付款失敗、取消與降級、稅務及退款尚未決定。現階段未實作金流時，選擇付費方案不得假裝已付款或發放付費額度。D-030 的7天／每日3輪與無綁卡規則維持；本條僅取代其「註冊後立即起算」的時間解讀。
- **可追溯來源**：使用者確認「進入 API Key 管理 dashboard，即使不創建key也算」；建立key必須從三方案選擇，付費採「訂閱制」。

### D-031 Developer API 單題觀測與使用者問題優先

- **日期**：2026-09-08 ｜ **狀態**：Confirmed（輸入規則；未實作）
- **決策者**：Wenqing950519
- **決策內容**：承接一輪一題、固定四家回答的提案，預設由服務自動生成觀測問題；若使用者提交的prompt已包含要觀測的問題，直接採用該問題，不另生成或改寫。四家使用同一個最終問題，保存effective_prompt及問題來源（user／generated）。輸入URL而未提供問題時，從有限頁面內容產生一题。
- **決策邊界**：本決策不指定生成供應商或模板，也不授權付費呼叫。混合指令中問題的識別、多題輸入與資訊不足時的處理尚待契約設計，不得默默擴成多題或自行任選一題。P2的搜尋品質成功門檻仍待確認；不改A、計分、價格或D-029失敗扣量規則。
- **可追溯來源**：使用者確認「預設會自己生成採用，不過如果使用者的打API的Prompt當中已經有提出問題，那就不用去生成」。

### D-033 Developer API 選題與多題輸入的首版邊界

- **日期**：2026-09-08 ｜ **狀態**：Confirmed（契約方向；未實作）
- **決策者**：Wenqing950519
- **決策內容**：無使用者問題時，首版先採可版本化、低成本的模板／規則自動生成，不額外呼叫LLM。後續以實測比較是否升級為LLM規劃，不將其視為本輪既定成本。單一`prompt`一律視為一個原樣觀測任務：系統不從自然語言猜選哪一題、不拆成多輪、也不替不同provider各自生成問題；四家接收相同effective_prompt。若客戶將多題寫在同一prompt，仍作同一任務處理，文件告知答案可比較性與完整性可能下降。
- **理由與取捨**：四家先各自分析網站、各自出題再搜尋，至少會把4個觀測呼叫擴成8個外部呼叫，且問題不同，無法把結果解釋為相同條件下的跨平台比較。該做法可留作日後受控研究實驗，但不是首版商品流程。
- **決策邊界**：不指定模板內容、URL資訊不足時的錯誤／fallback、prompt長度與輸出token上限；也不授權任何付費LLM planner。未來若做`questions[]`批次，需另定每題扣量、部分失敗與總成本，不從本條推得。
- **可追溯來源**：使用者選擇先模板、後續再考慮LLM的C方向，並選擇多題輸入C方向；使用者提出四家各自選題的替代方案後，採首版不使用該方案的取捨。

### D-034 Developer API 分層保存方向

- **日期**：2026-09-08 ｜ **狀態**：Confirmed（原則；未凍結期限）
- **決策者**：Wenqing950519
- **決策內容**：資料保存採平衡的分層方向，不採「所有資料同一短期限」或預設長期保存一切。保存設計優先釐清內容類型、存放位置、存取權限與刪除／備份處理；保存較久本身不是主要顧慮。
- **決策邊界**：客戶可讀結果、使用者prompt、URL HTML、供應商原始回應、citation、帳務metadata、log與備份各留多久尚未決定。不得把先前7／30／90天候選值視為已確認；供應商資料保留、跨境處理及條款仍須逐家查證。
- **可追溯來源**：使用者選擇資料保存B方向，並指出核心是保存內容與方法而非單純保存時間。

### D-035 Developer API 雛型僅以 D1 保存結果層

- **日期**：2026-09-08 ｜ **狀態**：Confirmed（雛型儲存邊界；未實作）
- **決策者**：Wenqing950519
- **決策內容**：B 雛型使用獨立的 D1 結果層保存客戶可讀的結構化結果；不使用 R2 保存原始證據。原始 URL HTML、完整供應商 request／response、tool trace、除錯內容及使用者 cookie 均不進入雛型持久保存。不得共用或改動產品 A 的 `geocheck-reports` D1。
- **理由與取捨**：先用最小持久層驗證結果交付與保留需求，降低儲存、刪除與敏感內容範圍；代價是無法用雛型重播原始供應商回應、完整除錯或保存網頁快照。
- **決策邊界**：此條不是實作或建立遠端D1的授權，也未定結果保存期限、D1 schema、帳戶／配額帳本、raw evidence後續是否進R2。雛型必須在寫入前限制結果大小；D1單列2 MB上限及目前帳戶方案容量需在live前驗證，不能將任意provider原文塞進結果JSON。
- **可追溯來源**：使用者確認「雛型先構建D1僅結果層」。

  - **實作紀錄 2026-09-08**：使用者後續授權開始製作並自我驗證 API 雛型，直到需填入provider key環境變數即停止。已新增獨立B D1 migration／adapter、512 KiB結果序列化安全上限、fixture API與本機測試；未建立D1、未套用migration、未填key、未儲值或發出真實provider請求。

### D-030 Developer API Beta 定價與無綁卡試用

- **日期**：2026-09-08 ｜ **狀態**：Confirmed（Beta 商業契約方向；尚未啟用）
- **決策者**：Wenqing950519
- **決策內容**：Developer API 採低門檻 Beta 定價。新註冊使用者可免費試用 7 天，每天最多 3 輪；1 輪依 D-029 固定執行四家官方 profile。免費試用不要求綁信用卡、不自動轉為付費訂閱；試用結束後需由使用者主動購買。Beta 付費方案暫定 Basic 為 TWD 660／80 輪，Premium 為 TWD 1,390／170 輪。
- **扣量與失敗**：只有四家全數完成的 `succeeded` job 才扣除免費或付費輪數；`failed` job 即使帶有 `partial_results` 也不扣量、不計費。免費輪數每日重置，不遞延累積。
- **理由與取捨**：產品 A 與 Developer API 都尚未商業化，創辦人現階段以取得首批真實使用、建立信任及需求驗證為優先，並希望在出現真實使用者後才逐步投入官方 API 額度。無綁卡降低試用阻力，但會提高濫用與免費成本風險。
- **財務假設與重估門檻**：80／170 輪以單輪完整成本約 TWD 4、金流費約 3% 推算，方案毛利約 48%～49%；這些是未驗證假設，不是已觀測結果。正式啟用前需以官方帳戶 smoke test 驗證平均與 P95 成本、四家全成率、失敗吸收成本及付款費率；若單輪成本高於 TWD 4.5，必須先重算額度或價格，不得直接上線。
- **驗證更新（2026-09-09，非新決策）**：單次四家 smoke 的上游成本為 TWD 1.54～2.88，低於 TWD 4 假設與 TWD 4.5 門檻；僅 Perplexity 為 provider-reported 成本，其他依牌價估算，Google 因免費搜尋額度與 token 分拆未知而為區間。`n=1` 不足以驗證平均、P95、全成率、失敗吸收或毛利，定價決策不變。
- **必要保護**：免費流量在啟用前仍需定義身分驗證、單人／單裝置與全域成本上限、濫用處理及服務關閉條件；本決策不自行確定這些參數。不得提供 unlimited 使用。
- **決策邊界**：本決策是 Beta 價格與試用契約，不是永久價格承諾；不修改產品 A，也不授權串接金流、保存卡片、建立訂閱、儲值或發出付費 provider 請求。SDK、正式月費週期、額度效期、稅務與退款條款仍待後續確認。
- **可追溯來源**：2026-09-08 使用者確認低端市場策略、約 45% 毛利方向、Basic／Premium 價格、7 天每日 3 輪及不強制綁卡。

### D-036 Developer API 進入 20 輪受控供應商驗證

- **日期**：2026-09-09 ｜ **狀態**：Confirmed（一次性測試授權；非公開上線授權）
- **決策者**：Wenqing950519
- **決策內容**：先以公開網站與不含個資的真實問題執行 20 個完整回合；每回合固定四家官方 provider 各一次。供應商總預算上限 TWD 120，四家全數成功至少 19／20，P95 單輪成本不超過 TWD 4.5，任何一回合端到端時間不超過 30 秒。
- **執行邊界**：本輪不 retry、不公開 API、不建立前端、SDK、帳戶、金流或 dashboard。成本以 provider-reported 或官方牌價估算的保守上界計入；未知成本整輪暫列 TWD 12。每家 timeout 29 秒，輸出上限 1,024 tokens；OpenAI／Anthropic 搜尋上限 2 次，Google／Perplexity 依官方介面可用欄位控制並照實記錄。
- **後續門檻**：四項條件全部通過後，才規劃前端、技術文件及 API 管理 dashboard；通過不等於已批准部署或正式營運。若任一門檻失敗，先停在診斷與修補，不以調低門檻宣稱通過。
- **可追溯來源**：2026-09-09 使用者本次明確批准；固定題組與執行器位於 `docs/developer-api/evidence/controlled-benchmark-inputs-20-v1.json` 與 `scripts/developer-api/run-controlled-benchmark.cjs`。
- **執行結果（2026-09-09）**：20／20 回合四家全成；P95 單輪成本 TWD 3.490287、最高 TWD 3.69144；P95 延遲 11.907 秒、最慢 12.948 秒；保守總成本 TWD 53.304851。四項門檻全部通過，允許進入前端／技術文件／API 管理 dashboard 的規劃階段，但不構成部署或公開營運授權。
- **帳務對帳補充（2026-09-09，非新決策）**：使用者回報自接入後台累計 Claude USD 0.670、Gemini USD 0.008、OpenAI USD 0.300、Perplexity USD 0.115，合計 USD 1.093／TWD 34.467755（沿用 TWD 31.535／USD）。該範圍可能包含 benchmark 前 smoke，且未附帳單匯出，故只作總預算對帳，不取代事件檔的每輪成本與 P95；驗收判定仍採 TWD 53.304851 保守上界。

### D-037 完成 Developer API 1～3 項，介面先做後臺

- **日期**：2026-09-09 ｜ **狀態**：Confirmed（實作授權；非部署授權）
- **決策者**：Wenqing950519
- **決策內容**：完成產品基礎、三類介面的後臺契約，以及資安／營運驗證；視覺前端由使用者之後另行搭建。無法只靠本機確認的公開資訊可使用 Brave 瀏覽器查證並允許開視窗。
- **落地範圍**：帳戶邀請與信箱驗證、登入 session、API key 建立／列出／撤銷、tenant 隔離、持久 job、配額 reservation／settlement、provider attempt／成本 ledger、結果期限與刪除、customer／console／admin API、OpenAPI、D1 adapter／migration runner、admission kill switch 及資安測試。
- **人工邊界**：本決策不批准視覺前端、付款、正式寄信服務、建立 Cloudflare D1／API token、部署或公開流量。quota window、結果保存天數、production budget、事故負責人及付費週期仍由使用者拍板；程式將前兩項設為必填，不以便利預設冒充正式決策。
- **執行更新（2026-09-09）**：使用者後續明確批准 APAC D1 及最低權限持久 token。`geocheck-developer-api` 已成功建立；Cloudflare UI 顯示 D1 token 權限只能套用整個帳戶，無法限制單一 database。因這會同時授權 A 與其他 D1，已在建立 token 前停止，等待使用者選擇接受帳戶級 D1 Read／Edit 或改採只綁定 B D1 的 Worker gateway。migration、`.env` 寫入與遠端 readiness 尚未執行。

### D-038 Developer API D1 改採單庫 Worker gateway

- **日期**：2026-09-09 ｜ **狀態**：Confirmed（架構與部署）
- **決策者**：Wenqing950519
- **決策內容**：因 Cloudflare 帳戶 D1 token 不能限制到單一 database，使用者選擇 Worker gateway。`geocheck-developer-d1-gateway` 以 in-process `DB` binding 只連到 `geocheck-developer-api`；Render 只持有 gateway URL 與獨立 shared secret，不持有可讀寫其他 D1 的帳戶 token。
- **安全邊界**：gateway 只接受 Bearer 驗證後的單筆／batch data statements；拒絕 DDL、PRAGMA、ATTACH、transaction control、多 statement、非 scalar params及超量 request／response。schema migration 只由人工登入的 Wrangler OAuth 執行，不開 migration HTTP route；不得把 gateway secret、SQL 或 params 寫進 repo／log／前端。
- **執行結果**：B D1 的 `0001`～`0003` migration 已全部套用；Worker 已部署至 `https://geocheck-developer-d1-gateway.bgo-career.workers.dev`，Render 已保存 gateway URL／secret。公開 health 回 200、未授權 query 回 401、授權唯讀 schema query 回 200 並確認 17 個 `developer_*` tables。未建立帳戶級 D1 API token，未改 A D1。
- **執行補充**：授權 batch write／read 已回 200，全域 admission 已設為 `false`／`private beta not released`，避免後臺正式發布前接單。
- **尚未代表**：Render 線上 customer API 尚未部署本工作樹程式；private beta、公開流量、edge rate limit、備份還原與事故告警仍未完成。

### D-039 全面 Cloudflare 遷移與 Developer API Beta

- **日期**：2026-09-09 ｜ **狀態**：Confirmed（實作與預檢授權；正式帳務／DNS／公開發佈待執行時確認）
- **決策者**：Wenqing950519
- **決策內容**：不新增 Render service。A 主網站改為靜態 Pages 與同網域 A Worker；B 使用 `api.geocheck.lisheng.cv` 的 Worker、直接 D1 binding 與 Queue。A audit 改為可恢復非同步 job；Browser Run 優先，Container 中既有 Playwright／Scrapling 只在 Browser Run 失敗時作抓取備援。A、B 的 D1 分離，B 30 天結果保存、固定四家、四家全成才扣量與 `partial_results` 契約不變。既有 A lead 一次性遷往 A 專用 D1，付款、訂閱、正式寄信與視覺 customer/console 不在本期。
- **成本與安全邊界**：選用 Workers Paid 的 USD 5/月起點與 USD 10 警戒，不升 Cloudflare Pro。設定 Free WAF managed/custom rules、單一 `/v1/*` rate-limit、no-cache、TLS/HSTS；Workers 是 origin，不再使用 Render edge proxy。Render 保留七天，除非使用者再明確授權不得停用或刪除。
- **SDK**：建立 MIT `@geocheck/sdk@0.1.0-beta.1` TypeScript client，具 typed measurement/job/result/usage、顯式 idempotency key、2 秒 polling 與 `Retry-After`；不含 server 邏輯或 provider secrets，且不自動重送 POST。公開 npm publish 只在帳號登入並確認持有 scope 後執行。
- **驗證邊界**：先以 fixture、contract、Pages/Workers preview、D1 dry-run/import hash 與合成 Time Travel restore 驗證；付費 provider smoke 必須在執行當下另行確認。完成前不得把 dry-run、preview、fixture 或 Browser Run API 回應宣稱為正式客戶或供應商成功。

### D-040 三層產品架構與 Developer API 共用量測基礎

- **日期**：2026-09-09 ｜ **狀態**：Confirmed（產品方向；分階段實作）
- **決策者**：Wenqing950519
- **決策內容**：GeoCheck 的主要產品架構採「短測引流 → SaaS Dashboard → 診斷型 Agent」。短測用來建立單次基線與問題認知；Dashboard 保存跨期、跨引擎 Run 與差異；Agent 解釋既有證據、提出可複製的改善材料與異常提醒。Developer API 是三層產品共用的四引擎量測基礎，也可作為外部技術產品，但不得反向改寫產品 A 已確認的計分、`unknown` 或報告語義。
- **Agent 邊界**：Agent 只能提供診斷、解釋、提醒與由使用者自行採用的材料，不直接登入或修改客戶 CMS、網站或第三方帳戶；因此不改 `PROJECT_CHARTER.md §1` 的「只診斷、不代執行」邊界。
- **決策邊界**：這是產品方向，不代表 Project、視覺 Dashboard、排程、Agent、金流、正式寄信或公開 customer API 已完成或已部署。餐飲是否為最佳付費灘頭堡、第一 buyer／ICP、Dashboard／Agent 定價、留存機制及 AI citation 與營收的關係仍待驗證。
- **與既有決策的關係**：D-029 的固定四引擎、全成才成功／扣量與 `partial_results` 契約維持；其「附屬產品」解讀更新為 Developer API 可同時作為共用基礎與外部產品，但整合不得影響產品 A 現行行為。D-039 的本期實作與發布邊界不變。
- **可追溯來源**：`docs/research/business-plan-2026-09-09/multi-agent-business-plan-workflow.md` Stage One `0.1`、`Part 6 P0-1`；使用者 2026-09-09 確認其中明示決策為最新決策。

### D-041 藍新金流為預定 payment rail

- **日期**：2026-09-09 ｜ **狀態**：Confirmed（供應商選定；尚未串接）
- **決策者**：Wenqing950519
- **決策內容**：GeoCheck 未來需要台灣新台幣收款、信用卡定期定額及發票流程時，優先採用藍新金流（NewebPay）作為 payment rail；商業與技術設計以其 MPG、信用卡定期定額及相關加值服務的官方文件與正式商務條件為準。
- **決策邊界**：本決策只選定供應商，不授權現在建立商店、保存付款憑證、串接 production API、啟用扣款或對外宣稱可付款。實際費率、申請資格、退款／取消、失敗重試、電子發票方案、稅務與上線驗收尚未確認；D-030／D-032 的試用與訂閱語義維持，D-039 的「付款不在本期」維持。
- **可追溯來源**：`docs/research/business-plan-2026-09-09/multi-agent-business-plan-workflow.md` Stage One `Part 6 P1-4`；使用者 2026-09-09 確認其中明示決策為最新決策；藍新官方 MPG／定期定額文件只用於能力核對，不構成已串接證據。

### D-042 Dashboard 與 Developer Console 的產品、授權與資料邊界

- **日期**：2026-09-10 ｜ **狀態**：Confirmed（後端 foundation；未部署）
- **決策內容**：Product A Dashboard 服務行銷實作者的 Project 歷史追蹤、題組、Tracking Run、來源證據與跨期變化；Developer Console 服務 API key、usage、request job、成本、SDK 與技術帳戶設定。兩者可共用四引擎量測基礎，但不得共用 UI、browser API、session、API key、tenant／Project 授權、計費語義或資料查詢入口。
- **落地方式**：Dashboard browser API 使用 feature-gated `/app-api/v1` 與獨立 `gds_` session；Developer API 保持 `/v1`、`/v1/console`、`gcs_` management session、`gck_` API key 與 `developer_*` tables。Dashboard 使用 Project membership 與 `dashboard_*` schema，並只從可信的 Product A orchestration 接受 Tracking Run，不開放 browser client 寫入原始 observation。
- **決策邊界**：本決策不啟用 Dashboard 前端、排程、D1 remote migration、Dashboard 定價、付款、Agent 或公開流量；不改 D-029 固定四引擎、全成才扣量、`partial_results` 及 30 天 Developer API 結果保存。
- **驗證**：Dashboard service／HTTP tests 驗證 `gcs_` 與 `gck_` 無法存取 `/app-api/v1`、Dashboard handler 不接管 `/v1/console`、browser response 無 API key／quota／cost／tenant／Developer job 資料，且 raw evidence 僅由 Project-scoped evidence route 回傳。
- **可追溯來源**：使用者 2026-09-10 確認的 Dashboard implementation plan；`docs/product/dashboard/` 交接文件與 `tests/dashboard-*.test.js`。

### D-043 商業指標數字字體選定 Inter 與全站數字 Token 規範

- **日期**：2026-09-10 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：
  1. 商業與度量數字（KPI 分數、比率百分比、觀測分子分母、表格計數、日期）全面改用 **`Inter`**，開啟 OpenType `font-variant-numeric: tabular-nums`（`"tnum" 1`）。
  2. 廢除商業數據直接套用寫程式碼專用的 `JetBrains Mono`，徹底告別斜線零（`Ø`）與等寬字型在數字 `1` 產生的破碎間距。
  3. 確立全站字體 Token 分離架構：
     - `--gc-font-sans`：`'Noto Sans TC'`（介面導覽、標題、一般正文）
     - `--gc-font-number`：`'Inter'` 搭配 `tabular-nums`（全站所有商業指標、評分卡、走勢圖軸線、百分比）
     - `--gc-font-mono`：`'JetBrains Mono'`（僅保留給 API 金鑰、JSON Payload 與底層除錯代碼）
  4. 從 `brand.html` 品牌規範出發，一次性覆蓋推廣至全站（行銷 Dashboard、官方首頁、Demo、研究白皮書、開發者平台）。
- **影響範圍**：`brand.html`、`app.css`、`chart-utils.js`、`home.html`、`demo.html`、`whitepaper.html`、`developers.html`、`developers-console.html`、`developers-docs.html`。
- **可追溯來源**：使用者 2026-09-10 數字字體檢討與 Inter 選定指示。

### D-044 開發者平台字體系統與視覺設計全面同步產品 A Dashboard

- **日期**：2026-09-10 ｜ **狀態**：Confirmed
- **決策者**：Wenqing950519
- **決策內容**：
  1. 開發者平台的三大核心頁面（`developers-console.html`、`developers.html`、`developers-docs.html`）字體系統全面同步產品 A 行銷儀表板：
     - 正文、標題與導覽目錄統一套用 `'Noto Sans TC'`。
     - 商業指標、配額數字、走勢刻度與方案價格統一套用 `'Noto Sans TC'` 搭配 OpenType `font-variant-numeric: tabular-nums`，徹底消滅代碼斜線零（`Ø`）並確保數據縱向精密對齊。
     - 純程式碼、Token、API 金鑰與 JSON Payload 嚴格收斂至 `'JetBrains Mono'`。
  2. 視覺設計與排版全面去 AI 化：
     - 表格表頭統一採用產品 A 極簡微邊框淺灰風格（`#F8FAFC` 底色、`#475569` 文字、字重 600、微邊框）。
     - 全面清理所有頁面中多餘的中英對照括弧雜訊，回歸純粹的繁體中文介面。
     - 修復方案卡片標題括弧字串，回歸簡練乾淨的「免費試用」。
- **影響範圍**：`developers-console.html`、`developers.html`、`developers-docs.html`。
- **可追溯來源**：使用者 2026-09-10 Developer 相關部分全面改寫與產品 A 同步指示。

### D-045 共用 Google OAuth 與 Product A GSC 資料邊界

- **日期**：2026-09-10 ｜ **狀態**：Confirmed（實作；Google 審核與發布另驗）
- **決策內容**：A SaaS Dashboard 與 B Developer Console 共用同一 GeoCheck Google OAuth Web Client，但維持 `gds_`／`gcs_` session、帳號准入、資料表與授權判定完全隔離。兩者僅允許既有 verified account 使用相同 email 登入。B 僅請求 OIDC 基本身分 scope；A 的 GSC 連線才請求 `webmasters.readonly`。
- **GSC 邊界**：A 以 Project 為範圍加密保存 refresh token，首次回填 90 天、其後同步每日 clicks、impressions、CTR、average position，最多保存 13 個月。資料獨立呈現，不能併入 AI 可見度分數或分母；缺列不等於 0。解除連線必須刪除 token 與該 Project 的 GSC 匯入資料。
- **發布邊界**：Google OAuth app 對外 Production 前須有公開隱私政策、網域驗證與 scope verification；B 可先啟用基本登入，A GSC 功能在核准前 feature-gated。不得將本機 fixture、OAuth consent screen 或送審行為稱作 Google 已核准或公開可用。
- **同源部署補充**：使用者 2026-09-10 確認 B Developer Console 由 `api.geocheck.lisheng.cv/developers-console` 提供，與 B callback 同 origin，避免以 URL token 或跨產品 cookie 傳遞 `gcs_` session。Product A Dashboard 維持 `geocheck.lisheng.cv` 與 `gds_` session。
- **可追溯來源**：使用者 2026-09-10 明確選擇同一 OAuth client、既有帳號准入、每日彙總、90 天回填、13 個月保存與先補隱私政策再送 Google 驗證。

### D-046 Product A Dashboard Paid Beta 方案與 Sandbox 付款邊界

- **日期**：2026-09-10 ｜ **狀態**：Confirmed（實作與 Sandbox 驗證；非公開收款／部署授權）
- **決策內容**：Free 帳戶最多 2 個 active Projects，每個每週自動 Tracking Run，無手動更新。Paid Beta 為 TWD 330／訂閱週年月，最多 6 個 active Projects；每個每週自動 Run，帳戶共享每期 24 次手動立即更新、固定 Asia/Taipei 每日最多 6 次。手動額度不遞延；四引擎全成才扣量，`partial`／`failed` 保留觀測狀態但釋放 reservation。
- **訂閱生命週期**：採信用卡自動續訂；續扣失敗給 3 天完整寬限期。取消不按比例退款、權益保留至期末；到期仍未付款時全部 Project 保留唯讀，停止自動與手動量測，直到再次付款。
- **付款與隔離邊界**：藍新只做 Sandbox integration；Merchant ID、Hash Key、Hash IV 只可作 Worker secret，禁止保存卡號、secret 或未驗證 callback。Product A 使用獨立 `dashboard_*` entitlement、job、reservation、payment-event 資料，絕不共用 Developer API tenant、session、key、quota、cost 或資料庫。
- **發布邊界**：本決策不授權建立藍新商店、正式扣款、遠端 D1 migration、Worker deploy、公開流量或付費 provider calls。排程與 runner 必須受 admission kill switch 控制，預設關閉。
- **可追溯來源**：使用者 2026-09-10 明確確認本條方案、付款、時區、到期與 Sandbox 邊界。

### D-047 A／C 透過 Developer API 內部通道取得量測能力

- **日期**：2026-09-11 ｜ **狀態**：Confirmed（整合方向與通道契約；尚未實作）
- **決策者**：Wenqing950519
- **決策內容**：依 D-040 的共用量測基礎，產品 A Dashboard 的 Tracking Run 不自行實作四引擎量測，而是呼叫 Developer API（產品 B）已封裝好的量測能力。呼叫走 B 開放給內部產品的**內部通道**，不是對外 customer API：不佔用客戶 tenant、不消耗客戶配額、不產生客戶帳單。未來的產品 C（診斷型 Agent）採同一模式接入。
- **選擇理由**：四家 provider 金鑰、成本帳本、attempt 追蹤、lease/fencing 與重試邏輯只保留一份於 B。A 自行直連（共用程式層）會使這些最易出錯的機制重複實作並需在 A 再保管一份 provider 金鑰；A 當一般客戶（走公開 customer API）則會把內部用量混入 B 的客戶配額與計費帳本，使 B 的營收與用量數字失真。
- **維持不變的既有契約**：D-029 固定四引擎、全成才才算 `succeeded`、任一最終失敗則整體 `failed` 並回傳 `partial_results` 的量測語義不變。D-040 的「不得反向改寫產品 A 已確認的計分、`unknown` 或報告語義」不變。D-042／D-046 的資料隔離不變：A 仍使用獨立 `dashboard_*` 資料與 `gds_` session，內部通道不得讓 A 讀取 Developer tenant、API key、客戶 quota 或 cost 明細。
- **通道契約（2026-09-11 使用者逐項確認）**：
  - **認證與 caller 身分**：A 與 C 各持一把獨立的內部 service secret，B 以 `caller` 欄位記錄來源。可單獨停權、單獨輪替；不共用同一把金鑰，以確保「這筆費用由誰產生」永遠可回答。
  - **成本歸屬**：內部用量**記入** B 的 cost ledger，但與客戶計費**分開列示**。內部呼叫不佔客戶 tenant 配額、不產生客戶帳單。此項同時滿足 `RESEARCH_STANDARD.md`「API/token 用量須記入獨立 usage ledger」的要求。
  - **預算上限與 kill switch**：沿用 B 既有的 `developer_cost_budget_windows` 與 `developer_cost_reservations` 機制，不另建。暫定每日上限 TWD 500、每月 TWD 3,000（依 D-036 實測 P95 每輪 TWD 3.490287，每日上限約當 143 輪，相對 Paid Beta 6 Projects 每週各一次的預期負載有兩個數量級餘裕）。內部 kill switch 與客戶 admission **相互獨立**：關閉 A 不影響 B 的客戶，反之亦然。超限時停止接受新呼叫，已排隊者跑完，避免產生已付費但無結果的浪費。
  - **同步性**：**非同步**。A 送單取得 job id，經 B 既有 queue 執行，完成後回寫。依 D-036 實測最慢一輪 12.948 秒，同步等待會抵觸 Worker 執行時間限制。
  - **重試責任**：**由 B 重試到終局**，A 只接收最終結果。A 不得自行重排，避免 A 重排與 B 重試疊加造成費用倍增。
- **決策邊界**：本決策確定通道契約，**不代表**通道已實作或已部署。實作仍須經 `npm.cmd test` 全綠與人工驗收；上述預算數值可由使用者調整，調整後須更新本條。內部通道不得讓 A 或 C 讀取 Developer tenant、API key、客戶 quota 或 cost 明細。
- **現況**：截至 2026-09-11，A 的程式碼中不存在任何對 B 的呼叫；`recordTrackingRun` 僅由測試呼叫，A Worker 的 `scheduled()` 為空 stub。此決策記錄的是方向，不是已完成的實作。
- **可追溯來源**：使用者 2026-09-11 於選項 (a) 共用程式層／(b) A 作為一般客戶／(c) 內部通道中明確選擇 (c)，說明未來產品 C 採同一模式，並於同日逐項確認上列五項通道契約與「每日總花費上限加可立即關閉的開關」。
