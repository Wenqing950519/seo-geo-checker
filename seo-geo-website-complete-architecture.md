# SEO/GEO 健檢網站完整架構規劃

## 1. 產品定位

這個網站不應該只被設計成一個小工具，而應該是：

> 免費健檢工具 + 專業顧問服務轉換漏斗 + SEO/GEO 教育內容中心

核心策略：

> 用工具建立信任，用報告製造痛點，用內容建立權威，用顧問服務變現。

一句話定位：

> 幫品牌檢查自己在 Google 與 AI 搜尋中的可見度，找出 SEO/GEO 結構問題，並提供可執行的優化方向。

對外可以使用的產品說法：

- AI 搜尋能見度健檢工具
- AI Search Visibility Audit for growing websites
- 讓你的網站被 Google、ChatGPT、Perplexity 更容易理解與引用

第一版不要急著包裝成完整 SaaS。更穩健的方向是先做「診斷型產品」，用免費或低門檻健檢引導潛在客戶聯繫你做深度 SEO/GEO 優化。

## 2. 目標用戶

優先客群：

- 中小企業官網
- B2B SaaS
- 顧問型服務
- 醫美、診所、法律、會計等高信任需求產業
- 有內容但不確定 AI 搜尋是否理解自己的品牌
- 已經做過基礎 SEO，但不知道 GEO / AI Search Visibility 怎麼做的網站

用戶核心問題：

- 我的網站在 AI 搜尋裡有被提到嗎？
- ChatGPT / Perplexity / Gemini 會不會引用我的網站？
- AI 眼中我的品牌到底是什麼？
- 我的網站內容是否足夠清楚、可引用、可信？
- 我應該先修技術 SEO，還是先補內容？

## 3. 網站主架構

建議 sitemap：

```text
/
├── /tools/seo-geo-checker
├── /report/[id]
├── /services/geo-optimization
├── /services/seo-consulting
├── /services/technical-seo-audit
├── /resources
│   ├── /resources/what-is-geo
│   ├── /resources/ai-search-visibility
│   ├── /resources/llms-txt-guide
│   ├── /resources/schema-for-ai-search
│   ├── /resources/chatgpt-seo
│   └── /resources/perplexity-seo
├── /case-studies
│   └── /case-studies/[slug]
├── /about
├── /contact
├── /privacy
└── /terms
```

MVP 第一版不需要全部完成，但資訊架構應該先預留這些位置，避免後續擴張時網站結構混亂。

## 4. MVP 第一版範圍

第一版建議只做：

```text
/
/tools/seo-geo-checker
/report/[id]
/services/geo-optimization
/resources/what-is-geo
/contact
/privacy
```

第一版先不要做：

- 使用者帳號
- 歷史報告對比
- 付費牆
- 完整 dashboard
- 多專案管理
- 自訂大型問題集

這些應該放到第二階段，等你確認用戶真的願意留下聯絡資料或付費後再做。

## 5. 首頁 `/`

首頁是商業入口，不只是工具入口。

首頁任務：

- 清楚說明你解決什麼問題
- 引導用戶做免費健檢
- 建立你對 SEO/GEO 的專業感
- 導向服務頁與資源頁

建議區塊：

1. Hero
   - 主標：檢查你的網站是否能被 Google 與 AI 搜尋正確理解
   - 副標：輸入網址，取得一份 SEO/GEO 健檢報告，了解你的 AI 搜尋能見度、技術 SEO 問題與優先優化方向。
   - CTA：輸入 URL 開始健檢

2. 痛點區
   - 你的網站可能在 Google 被收錄，卻沒有出現在 AI 答案裡
   - AI 可能不知道你是誰、服務誰、解決什麼問題
   - 技術 SEO 沒壞，不代表內容能被 AI 引用

3. 工具能檢查什麼
   - AI 眼中定位
   - 技術 SEO
   - 內容可引用性
   - GEO 能見度
   - 優先修正方向

4. 報告範例預覽
   - Overall Health Score
   - AI Positioning
   - Technical SEO Issues
   - Content Citeability
   - Priority Actions

5. 服務說明
   - 如果你需要修正問題，可以申請客製化 GEO / SEO 優化服務

6. 教育內容入口
   - GEO 是什麼
   - AI 搜尋能見度是什麼
   - 如何讓 AI 更容易引用你的網站

7. 最終 CTA
   - 免費檢查網站

## 6. 工具頁 `/tools/seo-geo-checker`

這是產品核心頁。

完整流程：

```text
用戶輸入 URL
↓
抓取網站基本資料
↓
AI 眼中定位
↓
技術 SEO 健檢
↓
GEO 問題生成
↓
AI / search visibility 測試
↓
產出報告
↓
留下 email 或聯繫顧問
```

健檢模組建議拆成五個：

### 6.1 AI Positioning

目的：先確認 AI / 搜尋引擎目前怎麼理解這個網站。

檢查內容：

- AI/search 認為這是什麼網站
- 屬於哪個品類
- 服務什麼受眾
- 解決什麼問題
- 和哪些競品一起出現
- 是否與品牌自我定位一致
- 是否有錯誤理解或定位模糊

這一步應該放在競品分析之前，因為真正有價值的競品不只是使用者自認的競品，而是 AI 搜尋結果中經常和你同場出現的品牌。

### 6.2 Technical SEO

檢查內容：

- title
- meta description
- H1
- heading hierarchy
- canonical
- robots.txt
- sitemap.xml
- schema / structured data
- Open Graph
- indexability
- internal links
- llms.txt

這一層要提供可驗證的問題，不要只輸出抽象建議。

### 6.3 Content Citeability

目的：判斷網站內容是否容易被 AI 摘錄、理解與引用。

檢查內容：

- 是否有清楚定義型段落
- 是否有 FAQ
- 是否有具體數據
- 是否有案例、來源、引用、研究或第三方佐證
- 是否有作者、更新日期、公司資訊
- 內容是否能獨立回答使用者問題
- 頁面是否只是在賣產品，沒有回答搜尋意圖

### 6.4 GEO Visibility

目的：測試網站在 AI 搜尋問題中的可見度。

第一版可以做輕量版：

- 先根據網站定位生成 5-8 題問題
- 測試品牌是否出現
- 測試網站是否被引用
- 記錄哪些競品出現
- 區分 real AI answer 與 source visibility proxy

不要使用固定 5 題測所有網站。不同產業、不同商業模式、不同 ICP，需要不同問題。

### 6.5 Opportunity Summary

報告最後只給 3 個最高優先修正方向。

每個建議要包含：

- 目標頁或新資產
- 對應問題或查詢
- 為什麼重要
- 問題依據
- 建議方向
- 預期影響
- 不確定性

免費報告不要給完整 SOP。完整方案應該導向顧問服務。

## 7. 報告頁 `/report/[id]`

報告頁是轉換頁，不只是結果頁。

建議順序：

### 7.1 Overall Health Score

分級：

- Critical
- Needs Work
- Decent
- Strong

不要只給分數，要給一句商業解釋，例如：

> 你的網站技術結構大致可被搜尋引擎讀取，但 AI/search 對品牌定位的理解仍偏模糊，可能導致你在高意圖問題中輸給競品。

### 7.2 AI 眼中定位

顯示：

- AI/search 如何理解這個網站
- 目前被歸類到什麼品類
- 哪些受眾或場景被理解
- 哪些地方沒有被理解
- 是否出現錯誤定位
- 建議納入競品分析的對象

### 7.3 AI 搜尋能見度

顯示：

- 測試了哪些問題
- 網站是否出現
- 是否被引用
- 哪些競品出現
- 信心等級
- 測試限制

### 7.4 技術 SEO 健檢

顯示：

- High / Medium / Low 問題
- 受影響頁面
- 問題說明
- 對 SEO/GEO 的影響

### 7.5 內容可引用性

顯示：

- AI 為什麼可能不引用你
- 缺少哪些答案型內容
- 缺少哪些證據
- 哪些頁面最需要補強

### 7.6 前三個優先修正方向

建議格式：

| Priority | Type | Target | Problem | Recommended Direction |
|----------|------|--------|---------|-----------------------|
| P1 | AI Positioning | Homepage / About | AI 無法清楚判斷品牌定位 | 補強首頁的定義型段落與服務對象 |
| P2 | Technical SEO | Sitewide | 缺少 Organization schema | 增加結構化資料提高實體辨識 |
| P3 | Content | Service Page | 缺少可引用 FAQ | 增加決策型 FAQ 回答高意圖問題 |

### 7.7 CTA

CTA 不要太複雜。

建議文案：

- 我想知道怎麼修這些問題
- 預約一次 GEO 診斷
- 請幫我做完整優化方案

表單欄位：

- Email
- Website
- 一句話描述需求

報告頁建議預設 `noindex`，除非未來你刻意要做公開 benchmark。

## 8. 服務頁

至少需要三個服務頁，因為不同客戶痛點不同。

### 8.1 `/services/geo-optimization`

主打：

- AI 搜尋能見度
- ChatGPT / Perplexity / Gemini 引用機會
- 品牌實體定位
- 內容可引用性
- 競品敘事分析

頁面區塊：

1. GEO 是什麼問題
2. 為什麼傳統 SEO 不一定足夠
3. 服務包含什麼
4. 適合誰
5. 交付物
6. 合作流程
7. CTA

### 8.2 `/services/seo-consulting`

主打：

- SEO 策略
- 關鍵字與內容策略
- 網站架構
- Search Console 分析
- 成長顧問

### 8.3 `/services/technical-seo-audit`

主打：

- 技術檢查
- indexability
- schema
- site structure
- Core Web Vitals
- crawl/index issues

三個服務頁可以共用底層 CTA，但主標、痛點與案例要不同。

## 9. 內容中心 `/resources`

這是網站自己的 SEO moat。

第一批內容建議：

- GEO 是什麼？和 SEO 有什麼不同？
- AI 搜尋能見度是什麼？
- 為什麼 ChatGPT 沒有提到我的品牌？
- llms.txt 對 SEO/GEO 有幫助嗎？
- Schema markup 如何幫助 AI 理解網站？
- 如何讓內容更容易被 AI 引用？
- AI 搜尋時代，SEO 還重要嗎？
- Perplexity SEO 怎麼做？
- ChatGPT SEO 怎麼做？
- 小型網站如何做 GEO 健檢？

這些內容的目標不是只衝大流量，而是建立專業信任與服務轉換。

每篇文章都應該包含：

- 明確定義
- 實務例子
- 常見錯誤
- 可執行檢查項目
- 內部連結到工具頁
- 內部連結到服務頁

## 10. 技術 SEO 要求

這個網站本身要成為你的展示案例。

必做：

- SSR / SSG，避免重要內容只靠 client render
- 每頁唯一 title
- 每頁唯一 meta description
- 清楚 URL 結構
- sitemap.xml
- robots.txt
- canonical
- Open Graph
- Breadcrumb
- Organization schema
- Service schema
- SoftwareApplication schema 給工具頁
- FAQ schema 視情況使用
- 報告頁 `noindex`
- 快速載入
- 手機優先
- 表單防 spam
- rate limit

Google 官方仍把 SEO 定義為幫助搜尋引擎理解內容、幫助使用者找到網站；生成式 AI 搜尋也仍然建立在搜尋索引、排名與品質系統上。因此這個網站不能只追 GEO buzzword，基礎 SEO 一定要穩。

參考資料：

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google generative AI search optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google Structured Data intro](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [Google robots.txt documentation](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)

## 11. API 與資料流

建議資料流：

```text
用戶輸入網址
↓
POST /api/audit
↓
建立 jobId
↓
crawler 抓 homepage、robots.txt、sitemap、llms.txt
↓
seo-analyzer 做技術 SEO 檢查
↓
ai-positioning 分析網站定位
↓
question-generator 生成 GEO 測試問題
↓
geo-tester 測試 AI/search visibility
↓
report-generator 產出報告
↓
儲存報告
↓
redirect /report/[id]
```

建議 API：

```text
POST /api/audit
GET /api/status/[id]
GET /api/report/[id]
POST /api/leads
```

第一版儲存可以先用簡單資料庫或 JSON store，但若要公開上線，建議使用：

- Postgres / Supabase
- Redis 做 job status 與 rate limit
- Object storage 存截圖或原始測試紀錄

## 12. 報告資料結構建議

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

## 13. 轉換設計

免費報告要做到：

- 讓用戶覺得診斷可信
- 讓用戶看懂問題
- 讓用戶感覺問題具體
- 但不要把完整解法全部免費交出去

CTA 應該出現在：

- 報告頁上方摘要後
- 優先建議區塊後
- 頁面底部

CTA 文案建議：

- 幫我解讀這份報告
- 我想修這些 SEO/GEO 問題
- 預約一次網站能見度診斷

Lead 表單第一版只需要：

- Email
- Website URL
- 需求描述

## 14. 商業模式路徑

第一階段：免費工具 + 顧問服務

- 免費健檢
- 收集 lead
- 人工回覆
- 提供一次性 SEO/GEO 優化方案

第二階段：產品化服務

- 基礎健檢免費
- 深度報告付費
- 每月監控方案
- 客製化內容與技術優化

第三階段：SaaS 化

- 帳號系統
- 歷史報告
- 競品追蹤
- 自訂 GEO 問題集
- 每週監控
- PDF 匯出
- 團隊權限

## 15. 執行優先順序

建議先做：

1. `/tools/seo-geo-checker`
2. `/report/[id]`
3. `/services/geo-optimization`
4. 首頁 `/`
5. `/resources/what-is-geo`
6. `/contact`
7. `/privacy`

最小可驗證版本：

```text
URL 輸入
→ AI 眼中定位
→ 技術 SEO 健檢
→ 內容可引用性評估
→ 3 個優先建議
→ CTA 留 email
```

## 16. 關鍵判斷

這個產品最有價值的地方不是「自動產報告」，而是：

> 幫客戶第一次看見：我的網站不是只有 SEO 問題，而是 AI 根本沒有正確理解我。

因此網站架構要圍繞一件事設計：

> 讓用戶輸入網址後，快速產生一份可信、具體、但不過度免費的診斷報告，最後自然導向你的客製化 SEO/GEO 服務。

第一版要避免做成大型 SaaS。先把它做成能展示專業、收集需求、驗證付費意願的健檢漏斗，會比一開始追求完整產品更穩。
