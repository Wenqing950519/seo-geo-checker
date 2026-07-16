# 報告頁 `/report/[id]` 文案

## 頁面目標

報告頁是轉換頁，不只是結果頁。它要讓使用者理解：

- 目前網站最大問題是什麼
- 這些問題為什麼影響 SEO/GEO
- 哪些問題應該優先處理
- 若需要幫助，可以如何聯繫

## SEO 設定

```text
noindex
```

報告頁不應進 sitemap，也不應預設公開被 Google 索引。

## 頁面標題

```text
SEO/GEO 網站健檢報告
```

副標：

```text
這份報告根據網站公開資訊、技術 SEO 訊號、AI 眼中定位與內容可引用性，整理出初步診斷與優先修正方向。
```

## 區塊 1：Overall Health Score

標題：

```text
整體健康度
```

說明範本：

```text
你的網站目前具備部分搜尋引擎可讀取的基礎，但在 AI 眼中定位、內容可引用性或技術訊號上仍有可改善空間。這可能影響你在高意圖搜尋與 AI 答案中的出現機會。
```

狀態文案：

Critical：

```text
目前有明顯技術或定位問題，可能影響搜尋引擎讀取與 AI 理解。
```

Needs Work：

```text
網站基礎大致存在，但仍缺少讓搜尋引擎與 AI 穩定理解的關鍵訊號。
```

Decent：

```text
網站已有良好基礎，但仍可透過內容結構、可引用證據與 schema 補強 AI 搜尋能見度。
```

Strong：

```text
網站 SEO/GEO 基礎良好，下一步可聚焦在競品差異化、內容深度與外部佐證。
```

## 區塊 2：AI 眼中定位

標題：

```text
AI 目前如何理解你的網站
```

說明：

```text
這一區整理 AI / search 可能如何判斷你的網站品類、服務對象、核心用途與競品關係。若這裡和你的實際定位不一致，後續內容與 SEO 策略可能會偏離商業目標。
```

欄位：

- Perceived Category
- Perceived Audience
- Perceived Use Cases
- Misunderstandings
- Missing Scenes
- Competitors Found
- Confidence

## 區塊 3：GEO / AI 搜尋能見度

標題：

```text
AI 搜尋能見度
```

說明：

```text
這一區會根據網站定位產生測試問題，觀察品牌是否出現、是否被引用，以及哪些競品在同樣問題中被提到。結果會受到時間、模型與搜尋環境影響，因此應視為初步訊號，而非固定排名。
```

欄位：

- Tested Question
- Intent
- Brand Mentioned
- Site Cited
- Competitors Mentioned
- Source / Notes

## 區塊 4：技術 SEO 健檢

標題：

```text
技術 SEO 問題
```

說明：

```text
這一區列出會影響搜尋引擎讀取、頁面理解、結構化資料與 AI 可讀性的技術訊號。問題會依照嚴重度與修復優先級排序。
```

欄位：

- Severity
- Check
- Page
- Detail
- Impact

## 區塊 5：內容可引用性

標題：

```text
內容是否容易被 AI 引用？
```

說明：

```text
AI 比較容易引用清楚、具體、有結構、有證據的內容。如果頁面只有行銷敘述，缺少定義、FAQ、數據、案例或比較資訊，即使被收錄，也不一定容易被 AI 摘錄進答案。
```

檢查方向：

- 是否有定義型段落
- 是否有 FAQ
- 是否有具體數據
- 是否有案例或第三方佐證
- 是否有比較表
- 是否能回答決策型問題

## 區塊 6：前三個優先修正方向

標題：

```text
建議優先處理的 3 件事
```

說明：

```text
以下建議依照影響程度、修復成本與商業價值排序。免費報告會提供方向與原因；若需要完整執行方案，可以預約進一步診斷。
```

欄位：

- Priority
- Type
- Target
- Recommendation
- Reason
- Expected Impact

## 報告頁 CTA

標題：

```text
想知道這些問題該怎麼修？
```

副標：

```text
留下你的網站與聯絡方式，我們可以協助你解讀報告，判斷最值得優先處理的 SEO/GEO 優化方向。
```

按鈕：

```text
預約報告解讀
```

## V3 分數顯示規則

報告需分開顯示「GEO 實測分數」與「站內準備度」。GEO 分數來自 Perplexity 搜尋觀測 50%、內容可引用性 30%、必要技術存取 20%；Perplexity 證據不足時，GEO 顯示「未知」，不可用站內準備度代替。
