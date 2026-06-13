# SEO/GEO 健檢網站架構文件範本

> 用途：這份文件是給 Claude / Codex / 開發協作者使用的產品與網站架構參考。目標是讓 AI 或工程協作者理解產品方向、頁面架構、SEO/GEO 策略、UI 需求與開發優先級，避免只做出漂亮頁面但失去商業目的。

---

## 1. 專案背景

### 1.1 產品一句話

這是一個 SEO/GEO 健檢網站，讓網站主輸入網址後，快速了解：

- AI / 搜尋引擎目前如何理解他的網站
- 網站是否存在技術 SEO 問題
- 內容是否容易被 AI 引用
- 在 AI 搜尋問題中是否出現
- 哪些問題最值得優先修正

### 1.2 商業目標

第一階段不是做完整 SaaS，而是做一個「免費健檢工具 + 顧問服務轉換漏斗」。

核心轉換路徑：

```text
用戶輸入網址
→ 取得免費 SEO/GEO 健檢報告
→ 看見具體問題
→ 留下聯絡方式
→ 進一步洽談客製化 SEO/GEO 優化服務
```

### 1.3 當前定位

網站不應該假裝是一間大型公司。比較真實可信的定位是：

> 由獨立 SEO/GEO 研究者設計的 AI 搜尋能見度健檢工具，結合技術 SEO 檢查、AI 眼中定位分析與內容可引用性評估，幫助網站主看見搜尋與 AI 引用中的盲點。

語氣方向：

- 專業但不誇大
- 透明說明方法與限制
- 不把 GEO 包裝成神秘魔法
- 強調 SEO 基礎仍然重要
- 用具體報告與方法論建立信任

---

## 2. 目標用戶

### 2.1 主要用戶

- 中小企業主
- B2B SaaS 團隊
- 顧問服務網站
- 醫美、診所、法律、會計等高信任服務業
- 已經有網站，但不知道 AI 搜尋是否理解自己的品牌
- 做過基礎 SEO，但不知道如何面對 ChatGPT / Perplexity / Gemini 等 AI 搜尋場景的人

### 2.2 使用者真正想知道的問題

- 我的網站在 AI 搜尋裡會被提到嗎？
- ChatGPT / Perplexity / Gemini 會不會引用我的網站？
- AI 眼中的我的品牌是什麼？
- 為什麼 AI 可能推薦我的競品，而不是我？
- 我的網站應該先修技術 SEO、內容，還是品牌定位？
- 如果要做 SEO/GEO 優化，第一步該做什麼？

---

## 3. 網站版本策略

### 3.1 第一版：一頁式 Landing Page + 報告頁

第一版以快速驗證轉換為主。

必要頁面：

```text
/
/report/[id]
/privacy
/terms
```

首頁採一頁式結構，但要預留未來拆頁的資訊架構。

### 3.2 第二版：拆出 SEO 可索引頁

當內容與服務變清楚後，拆出：

```text
/services/geo-optimization
/services/seo-consulting
/services/technical-seo-audit
/resources/what-is-geo
/resources/ai-search-visibility
/resources/llms-txt-guide
/resources/schema-for-ai-search
/case-studies
```

拆頁條件：

- 已有 3-5 篇完整資源內容
- 已有 2-3 份完整範例報告
- 開始需要承接自然搜尋流量
- 有明確服務方案或報價邏輯

---

## 4. 首頁資訊架構

首頁目的：

1. 讓使用者理解問題
2. 讓使用者願意輸入網址
3. 讓使用者相信報告不是亂產生的
4. 讓需要幫助的人留下聯絡方式

### S0. Navigation

導覽項目：

- 健檢功能
- 報告範例
- 方法論
- 服務方案
- 學習資源
- CTA：免費健檢

注意：

- CTA 要固定一致，不要同時出現太多主要行動。
- 一頁式錨點可先使用 `#modules`、`#sample-report`、`#methodology`、`#services`、`#resources`。

### S1. Hero

目標：第一眼說清楚痛點與行動。

建議文案：

```text
你的網站，AI 看得懂嗎？

輸入網址，檢查你的網站在 Google 與 AI 搜尋中的能見度，
找出 AI 眼中定位、技術 SEO、內容可引用性與優先修正方向。
```

主要 CTA：

```text
開始免費健檢
```

次要 CTA：

```text
查看範例報告
```

信任輔助文案：

```text
免費・無需註冊・約 60 秒產出初步報告
```

避免：

- 不要承諾一定能提升排名
- 不要說「保證被 ChatGPT 引用」
- 不要把 GEO 講成可操控 AI 的秘技

### S2. Pain Section

核心標題：

```text
被 Google 收錄，不代表會出現在 AI 答案裡
```

三個痛點：

1. AI 不知道你是誰
2. 技術 SEO 沒壞，但內容不容易被引用
3. 品牌定位在 AI 眼中模糊或被誤解

每個痛點都要接近買方語言。

例如：

```text
當使用者問「哪個工具最適合我？」時，AI 可能直接列出你的競品，
而不是你。這通常不是單一關鍵字問題，而是品牌定位、內容結構與引用訊號不足。
```

### S3. Methodology / 健檢如何運作

這一區非常重要，用來補信任。

標題：

```text
這份健檢不是單純跑分，而是從 AI 如何理解你開始
```

流程：

```text
1. 讀取網站基本資訊
2. 分析 AI / 搜尋引擎眼中的網站定位
3. 檢查技術 SEO 基礎
4. 評估內容可引用性
5. 生成產業相關 AI 搜尋問題
6. 彙整優先修正方向
```

必須透明說明：

- 初步健檢不等於完整 SEO audit
- AI 搜尋結果可能會隨時間與模型變動
- 若使用 proxy 測試，要明確標示不是正式引用率
- 深度優化仍需要人工判讀、商業脈絡與網站後台數據

### S4. 五大健檢模組

模組：

1. AI Positioning
2. Technical SEO
3. Content Citeability
4. GEO Visibility
5. Opportunity Summary

每個模組格式：

```text
模組名稱
一句白話說明
檢查項目 chips
```

AI Positioning 範例：

```text
先確認 AI 與搜尋引擎目前怎麼理解你的網站：品類、受眾、解決的問題，以及和哪些競品同場出現。
```

Technical SEO 範例：

```text
檢查 title、meta、H1、canonical、schema、robots.txt、sitemap、llms.txt 等會影響搜尋與 AI 理解的基礎訊號。
```

### S5. Sample Report / 範例報告

這一區要比一般 landing page 更重要。

目的：

- 讓用戶知道會拿到什麼
- 顯示報告不是空泛 AI 文案
- 展示顧問判斷能力

建議放一份匿名範例：

```text
範例：B2B SaaS 網站
```

報告摘要包含：

- Overall Health Score
- AI 眼中定位
- 技術 SEO 問題
- 內容可引用性缺口
- 競品出現情境
- P1-P3 優先修正方向

注意：

免費頁面可以展示摘要，不需要給完整 SOP。

### S6. Trust / 關於方法與操作者

如果目前沒有公司與案例，不要硬裝成大型團隊。

建議文案：

```text
這套健檢流程由獨立 SEO/GEO 研究者設計，目標是把網站健檢流程產品化：
自動化工具負責收集資料，最終優化方向仍以人工判讀、搜尋意圖與商業情境為準。
```

可補充：

- 方法論持續更新
- 參考 Google Search 官方 SEO 基礎原則
- 強調 AI 搜尋優化仍建立在 SEO、內容品質、品牌實體與可引用證據之上

不要寫：

- 領先業界
- 最強 AI SEO 團隊
- 保證排名
- 保證被 AI 推薦

### S7. Services

服務區不要只寫服務名稱，要用買方情境描述。

#### GEO 優化服務

適合：

- AI 搜尋常推薦競品但沒有推薦你
- 網站有內容，但 AI 無法清楚理解你的定位
- 想提升品牌在 ChatGPT / Perplexity / Gemini 類搜尋中的出現機會

包含：

- AI 眼中定位診斷
- 競品敘事分析
- 內容可引用性優化
- FAQ / comparison / evidence page 規劃
- schema 與實體訊號建議

#### SEO 顧問服務

適合：

- 想建立長期自然搜尋流量
- 不知道該先做內容、技術還是網站架構
- 需要 Search Console 數據解讀

#### 技術 SEO 健檢

適合：

- 網站改版前後
- 收錄或流量異常
- 想檢查 indexability、schema、canonical、sitemap、內部連結

### S8. Resources

第一版可以在首頁顯示卡片，但建議內容最終要拆成獨立 URL。

第一批資源：

- GEO 是什麼？和 SEO 有什麼不同？
- AI 搜尋能見度是什麼？
- 為什麼 ChatGPT 沒有提到我的品牌？
- llms.txt 對 SEO/GEO 有幫助嗎？
- Schema 如何幫助 AI 理解網站？

要求：

- 每篇都要有明確 title / meta description
- 每篇都要內鏈到健檢工具
- 每篇都要內鏈到相關服務
- 不要只做 accordion 內容，因為不利於長期 SEO 擴張

### S9. Final CTA

標題：

```text
想知道 AI 眼中的你的網站是什麼樣子？
```

CTA：

```text
開始免費健檢
```

或：

```text
預約一次 SEO/GEO 診斷
```

如果是 lead form，欄位只保留：

- Email
- Website URL
- 想解決的問題

---

## 5. 報告頁 `/report/[id]`

報告頁是轉換頁，不只是結果頁。

### 5.1 SEO 設定

- 預設 `noindex`
- 不進 sitemap
- 不應公開暴露用戶網站分析結果

### 5.2 報告結構

```text
1. Overall Health Score
2. AI 眼中定位
3. GEO / AI 搜尋能見度
4. 技術 SEO 健檢
5. 內容可引用性
6. 前三個優先修正方向
7. CTA：預約解讀 / 請協助修正
```

### 5.3 報告語氣

要具體，但不要恐嚇。

好的語氣：

```text
你的網站目前可以被搜尋引擎讀取，但 AI 對品牌定位的理解仍偏模糊。
這可能讓你在高意圖問題中輸給定位更清楚、內容更容易被引用的競品。
```

不好的語氣：

```text
你的網站 SEO 很差，必須立刻修正。
```

### 5.4 免費報告界線

免費報告應該給：

- 問題在哪裡
- 為什麼重要
- 優先級
- 修正方向

不一定要給：

- 完整逐字文案
- 完整技術部署碼
- 全站內容策略
- 詳細競品拆解

---

## 6. SEO/GEO 技術要求

### 6.1 基礎 SEO

必做：

- SSR / SSG，重要內容不可只靠 client render
- 每頁唯一 title
- 每頁唯一 meta description
- canonical
- sitemap.xml
- robots.txt
- Open Graph
- mobile-friendly
- fast loading
- descriptive URLs

### 6.2 Structured Data

首頁建議使用：

- Organization
- WebSite
- SoftwareApplication
- Service
- FAQPage

服務頁建議使用：

- Service
- BreadcrumbList
- FAQPage

資源文章建議使用：

- Article
- BreadcrumbList
- FAQPage, if suitable

### 6.3 GEO / AI Search 原則

文案與產品邏輯需遵守：

- GEO 不是取代 SEO，而是建立在 SEO、內容品質與品牌實體訊號之上
- 不承諾保證被 AI 引用
- 區分 AI 真實測試與 source visibility proxy
- 強調內容可引用性、清楚定位、具體證據與第三方佐證

---

## 7. UI 設計方向

### 7.1 視覺基調

- 明亮
- 專業
- 科技感克制
- 避免太像玩具或模板站

建議色系：

- 深藍：信任、專業
- 青綠：AI / 科技 / 行動感
- 白底與淺灰分區：提高可讀性

### 7.2 Icon 使用

避免大量 emoji。

建議使用一致的 icon library，例如：

- lucide
- heroicons

原因：

- B2B / 顧問型服務需要更成熟的信任感
- emoji 容易讓產品看起來偏 Demo 或玩具

### 7.3 動效原則

- 動效服務於理解，不是炫技
- Hero 可以有輕量視覺
- 滾動動畫要克制
- 支援 `prefers-reduced-motion`
- 不要讓動畫隱藏重要文字

---

## 8. 資料結構參考

```typescript
type Report = {
  id: string
  url: string
  created_at: string
  status: "done" | "error"
  score: {
    overall: "critical" | "needs_work" | "decent" | "strong"
    technical: number
    positioning: number
    geo_visibility: number
    citeability: number
  }
  positioning: {
    perceived_category: string
    perceived_audience: string[]
    perceived_use_cases: string[]
    misunderstandings: string[]
    missing_scenes: string[]
    competitors: string[]
    confidence: "low" | "medium" | "high"
  }
  seo: {
    issues: Issue[]
  }
  geo: {
    measurement_type: "real_ai_answer" | "source_visibility_proxy"
    tested_questions: Question[]
    citation_rate?: number
    competitor_mentions: string[]
  }
  citeability: {
    strengths: string[]
    gaps: string[]
  }
  summary: {
    narrative: string
    top_3_actions: Action[]
  }
}

type Issue = {
  check: string
  severity: "high" | "medium" | "low"
  page: string
  detail: string
  impact: string
}

type Question = {
  question: string
  intent: string
  cited: boolean
  mentioned: boolean
  source?: string
  competitors?: string[]
}

type Action = {
  priority: "P1" | "P2" | "P3"
  type: "technical" | "content" | "positioning" | "authority"
  target: string
  recommendation: string
  reason: string
  expected_impact: string
}
```

---

## 9. API 參考

```text
POST /api/audit
GET /api/status/[id]
GET /api/report/[id]
POST /api/leads
```

資料流：

```text
URL submitted
→ create job
→ crawl homepage / sitemap / robots / llms.txt
→ technical SEO checks
→ AI positioning
→ generate GEO questions
→ run AI/search visibility checks
→ generate report
→ show /report/[id]
→ collect lead
```

第一版可以先 mock API 與報告資料，重點是驗證：

- 用戶是否願意輸入 URL
- 用戶是否看得懂報告
- 用戶是否願意留下聯絡方式

---

## 10. Claude / 開發協作指令

當請 Claude 或其他 AI 協助開發時，請使用以下規則：

### 10.1 不要自由改產品定位

產品定位固定為：

```text
SEO/GEO 免費健檢工具 + 顧問服務轉換漏斗
```

不要改成：

- 一般 SEO agency 官網
- 完整 SaaS dashboard
- 純內容部落格
- 過度 AI hype 的 landing page

### 10.2 優先補信任，不是補炫技

優先順序：

1. 方法論透明
2. 範例報告
3. CTA 清楚
4. SEO 基礎完整
5. 視覺精緻

不要把大部分時間花在：

- 複雜動畫
- 過度裝飾
- 無法驗證的 AI 宣稱

### 10.3 文案要求

文案要：

- 具體
- 克制
- 可驗證
- 貼近買方問題

文案不要：

- 保證排名
- 保證被 AI 引用
- 誇大工具能力
- 空泛說「提升內容品質」

### 10.4 UI 要求

- 保持明亮專業
- CTA 一致
- 手機版優先
- 避免文字溢出
- 卡片不要過度堆疊
- Icon 使用一致系統，不要大量 emoji

---

## 11. 待決策事項

以下項目尚未確定，開發前需要決策：

1. 品牌名稱
2. 網站正式網域
3. 顧問介紹是否使用個人名義或產品名義
4. lead 收集方式：自建表單 / Google Form / Tally / Typeform
5. 第一版是否真的接 AI API，或先使用 mock report
6. 是否要提供 PDF 匯出
7. 第一批範例報告產業
8. 第一批資源文章主題
9. 服務報價是否公開
10. 是否加入英文版

---

## 12. 第一版交付標準

第一版完成時至少要有：

- 首頁一頁式 landing page
- URL input CTA
- 方法論說明區
- 五大健檢模組
- 一份完整範例報告展示
- 服務方案區
- lead form
- privacy page
- basic metadata
- JSON-LD structured data
- mobile responsive
- no broken links

第一版不必有：

- 帳號系統
- 歷史報告
- 付費訂閱
- 多語系
- 完整 dashboard

---

## 13. 成功指標

第一階段要觀察：

- 訪客是否輸入網址
- URL input conversion rate
- report completion rate
- 報告頁停留時間
- lead form conversion rate
- 使用者是否回覆「報告有幫助」
- 是否有人願意預約診斷或付費

不要太早只看：

- 自然搜尋流量
- 大量註冊數
- SaaS MRR

因為第一階段目標是驗證需求與服務轉換，不是直接做成熟 SaaS。

---

## 14. 核心判斷

這個網站最重要的價值不是「自動產報告」，而是：

> 讓網站主第一次看見：AI / 搜尋引擎到底怎麼理解我的網站，以及我為什麼可能輸給競品。

因此所有頁面、文案、UI、報告與 CTA 都要圍繞這件事設計。

