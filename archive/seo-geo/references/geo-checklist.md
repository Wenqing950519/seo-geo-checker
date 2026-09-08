# GEO 測試:記錄格式與可引用性準則

## 單次測試記錄欄位

每題每次實測記錄一筆,彙整進 `geo-YYYYMMDD.json`:

```json
{
  "question_id": "q1",
  "provider": "perplexity",
  "run": 1,
  "measurement_type": "real_ai_answer",
  "cited": true,
  "mentioned_only": false,
  "cited_pages": ["/blog/how-to-choose"],
  "citation_position": 2,
  "competitors_cited": ["competitor-a.com"],
  "source_artifact": "screenshot/export URL/path if available",
  "notes": "引用的是舊文章,新版指南未被收錄"
}
```

彙整層級欄位:`citation_rate`(該題引用次數/測試次數)、`overall_rate`、
`competitor_rates`、與上期的 `delta`。`real_ai_answer` 與 `source_visibility_proxy`
必須分開統計,不能混成同一個引用率。

## 判定原則

- 「引用」= 回答的來源/引註中出現本站網域,或回答內容明顯轉述本站獨有資訊
- 只看到品牌名被提及但沒有來源連結 → 記 `mentioned_only: true`,不算 cited
- 搜尋結果完全沒有相關來源時,該次記錄仍要保留(這本身是訊號)
- 只用一般 web search 觀察來源可見度時 → 記 `measurement_type: "source_visibility_proxy"`
  並在報告中標示不是 AI 引用率

## 結果呈現的誠實規範

樣本小是這類測試的本質限制,規範的目的是讓報告經得起專業審計:

- 任何引用率必附樣本量與測試條件:「3/9 次(3 題 × 3 runs,perplexity,2026-06-10)」
- 總測試次數 <10:只用次數表述,禁用百分比;10–30:百分比取整數,不帶小數
- 單期變化 ±1 次以內 = 雜訊,不解讀、不寫進重點
- 每次 run 記錄 provider 與(可知時)模型版本;已知模型改版的期間,該期所有變化
  都要加註「期間 provider 模型有更新,變化可能來自模型而非內容」
- 報告固定附一段「測試限制」:樣本量、provider 覆蓋、proxy 比例、隨機性說明

## 競品贏因拆解

對「競品被引用、本站沒有」的題目,抓取競品被引用的實際頁面,逐維度對照:

| 維度 | 檢查什麼 |
|------|----------|
| 內容結構 | 是否自含段落、FAQ、定義式開頭直接回答該題 |
| 證據密度 | 數據、年份、案例、出處的數量與具體度 |
| 權威訊號 | 第三方引用、媒體報導、Wikipedia/維基條目、域名年齡 |
| 新鮮度 | 發布/更新日期,內容是否反映近況 |
| 語言與市場 | 是否有該語言版本、是否針對該市場語境 |
| 技術 | schema 類型、頁面可抓取性 |

輸出格式(每題一筆,進 `competitor_win_analysis`):

```json
{
  "question_id": "q3",
  "competitor": "competitor-a.com",
  "cited_page": "https://...",
  "win_factors": ["證據密度:含 12 個具體數據點", "結構:開頭 40 字直接回答"],
  "replicable": ["補數據點", "改寫開頭段"],
  "not_replicable": ["他們有 50+ 篇媒體報導的權威累積"],
  "recommended_action": "短期改結構與證據,中期經營第三方報導"
}
```

可複製/不可複製的區分是這個分析的價值所在:它決定建議是「改頁面」還是「經營外部權威」,
兩者的成本與時程完全不同。

## 可引用性準則(給「未被引用」頁面的體檢)

AI 引擎傾向引用具備這些特徵的內容,逐項檢查 target_page:

1. **自含段落**:單一段落能獨立回答問題,不依賴上下文
2. **具體數據與出處**:有數字、年份、來源,而非空泛形容
3. **明確的問答結構**:FAQ 區塊、定義式開頭(「X 是…」)
4. **實體清晰**:品牌、產品、人名前後一致,首次出現有完整說明
5. **schema 標記**:FAQPage、HowTo、Article 等對應類型
6. **更新時間明確**:頁面標示發布/更新日期
7. **第三方佐證**:是否有其他網站引用此頁(權威訊號,改善需外部努力)

給建議時:每個未引用問題最多列 3 個最關鍵的缺口,附具體改法,不要全清單轟炸。
優先處理 `questions.json` 中 business_value 高、decision/consideration 階段、且有可用證據的問題。
