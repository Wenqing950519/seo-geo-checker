# GEOCheck 演算法 V2.0

## 核心原則

- 總分完全由可驗證訊號計算；語言模型不參與加權。
- 未取得的資料標為未知，不用猜測補值。
- 搜尋用途爬蟲與模型訓練用途爬蟲分開呈現。
- 不為 AI 搜尋犧牲 Google 傳統搜尋的抓取與收錄。
- `llms.txt` 只列為實驗性導覽訊號，不計分。

## 舊版規則與新版規則

| 舊版規則 | V2.0 規則 | 分數 | 50 字內理由 |
|---|---|---:|---|
| 模型分數佔 65% | 模型不參與總分 | 0 | 避免同站重跑分數漂移 |
| 首頁可抓取 | 首頁 HTTP 可抓取 | 8 | 先確認任何搜尋服務拿得到首頁 |
| 未檢查 noindex | meta robots 與 X-Robots-Tag | 8 | noindex 會直接限制搜尋收錄 |
| 未檢查 Googlebot | Googlebot 首頁權限 | 6 | 保護既有 Google 搜尋可見度 |
| 只關注 GPTBot | OAI-SearchBot 首頁權限 | 4 | 直接關係 ChatGPT 搜尋摘要與引用 |
| 未檢查 Claude 搜尋 bot | Claude-SearchBot 首頁權限 | 4 | 直接關係 Claude 搜尋索引可見度 |
| 未實際抓 sitemap | 有效 sitemap、首頁收錄、robots 宣告 | 13 | 協助搜尋服務發現重要頁面 |
| 未檢查 canonical | canonical | 2 | 避免網址版本分散收錄訊號 |
| title 8 分 | title 5 分 | 5 | 仍重要，但不應單項過度加分 |
| description 6 分 | meta description 3 分 | 3 | 提供摘要但不保證排名 |
| H1 6 分 | H1 4 分 | 4 | 讓頁面主題對人與機器都清楚 |
| 未檢查 OG 完整性 | og:title 與 og:description | 2 | 分享摘要訊號，不當成排名主訊號 |
| 任一 JSON-LD 即 6 分 | 可解析 + 類型符合頁面 | 4 | 格式錯誤或類型不合不應得滿分 |
| 只看渲染後文字量 | 文字量、原始 HTML、渲染落差 | 16 | 防止 SPA 畫面有字但爬蟲拿到空殼 |
| 未檢查圖片替代文字 | 圖片 alt 覆蓋率 | 2 | 替圖片提供可讀文字說明 |
| 未檢查 heading 層級 | H1-H6 結構 | 2 | 清楚層級降低內容理解成本 |
| GEO 關鍵字最多 16 分 | FAQ、案例、比較、證據、服務清楚度 | 15 | 分開呈現每項可引用內容訊號 |
| 高權威網域直接加 18 分 | 移除網域白名單加分 | 0 | 品牌知名度不等於頁面技術品質 |
| Brave 結果直接加分 | 只作外部佐證，不計核心分 | 0 | 避免 API 波動造成分數漂移 |

## 分數結構

| 類別 | 分數 |
|---|---:|
| 抓取與收錄 | 30 |
| 網址發現能力 | 15 |
| 語意與 metadata | 20 |
| 內容可讀性 | 20 |
| 內容可引用性 | 15 |
| 合計 | 100 |

嚴重問題另設分數上限：首頁抓不到最高 25 分、`noindex` 或 Googlebot 被全站阻擋最高 35 分、頁面幾乎沒有文字最高 42 分。這能避免完整 metadata 掩蓋致命抓取問題。

## 三個邊界案例

| 案例 | V2 預期 | 判斷 |
|---|---:|---|
| 只有一張圖片的咖啡廳 | 42 分以下 | 合理；能開啟不代表 AI 能理解店家 |
| JavaScript SPA 民宿 | 70–94 分 | 合理；渲染後內容可得分，但原始空殼會扣分 |
| 完整文章但 `Disallow: /` | 最高 35 分 | 合理；內容再完整也不能掩蓋全站封鎖 |

## 爬蟲用途邊界

- `OAI-SearchBot`：ChatGPT 搜尋摘要與引用可見性訊號，列入 4 分。
- `Claude-SearchBot`：Claude 搜尋索引可見性訊號，列入 4 分。
- `GPTBot`、`ClaudeBot`：模型訓練政策選擇，只顯示、不計分。
- `Google-Extended`：Gemini 訓練與部分 grounding 控制；不影響 Google Search 收錄或排名，只顯示、不計分。

官方依據：

- OpenAI Publishers and Developers FAQ: https://help.openai.com/en/articles/12627856-publishers-and-developers-faq
- Anthropic crawler controls: https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- Google common crawlers: https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers
- Google JavaScript SEO: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Google sitemap overview: https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview

## 商家看得懂的修正語氣

- 標題缺少：請網站設計師在首頁 `<head>` 補上 `<title>`，並在畫面主要內容放一個 H1；兩者直接寫出店名、服務與地區。
- SPA 空殼：請網站設計師把主要文字直接放進伺服器回傳的 HTML，或加上 SSR／預先渲染，不要等 JavaScript 執行後才出現。
- 全站封鎖：請先檢查根目錄 `robots.txt` 是否有誤設的 `Disallow: /`；若網站本來就不公開，維持現狀即可。
- AI 搜尋 bot：只在希望出現在對應 AI 搜尋時開放 `OAI-SearchBot` 或 `Claude-SearchBot`；不必連訓練用途 bot 一起開放。
