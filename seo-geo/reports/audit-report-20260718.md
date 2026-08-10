# GEOCheck 完整 SEO/GEO 審計報告

- **網站**:https://geocheck.lisheng.cv(canonical:`/`)
- **日期**:2026-07-18(基準期,無上期可比)
- **方法**:活站抓取 + repo 原始碼(`mock-api/`)交叉驗證 + `audit_checks.py` 結構化檢查 + GEO 引用實測(6 題 × 2 輪 web search)
- **對應數據檔**:`seo-geo/data/audits/audit-20260718.json`、`seo-geo/data/geo/geo-20260718.json`

---

## 一、總結(顧問視角)

技術 SEO 基本盤其實不差:title/meta/H 階層/OG/JSON-LD(Organization、WebSite、Service、FAQPage)都齊。真正的問題集中在三件事:

1. **Cloudflare 正在替你把所有 AI 爬蟲擋在門外**(GPTBot、ClaudeBot、PerplexityBot、CCBot、Google-Extended 全部 `Disallow: /`)。一個賣 GEO 健檢的網站,自己對 AI 完全不可見,這是全案最嚴重、也最諷刺的一項。程式碼修不了,必須到 Cloudflare 後台關閉。
2. **正典訊號自相矛盾**:`/` 302 到 `/home`,但 canonical/og:url/schema 全指回 `/`,sitemap 又同時列兩個 URL。搜尋引擎收到的是一個繞圈的訊號。(已修)
3. **GEO 引用率 0%**:6 題核心問題 × 2 輪實測,GEOCheck 零引用、零提及;而每一題都有 5–9 個競品被引用。根因除了第 1 點,還有「全站只有一頁、沒有可被單獨引用的內容 URL、站外零聲量」。

## 二、GEO 引用實測(0/12)

| # | 問題 | 引用率 | 被引用的競品(節選) |
|---|------|--------|----------------------|
| q1 | GEO 是什麼?和 SEO 有什麼不同? | 0/2 | sonar-inc.com、yesharris.com、ahha.tw、frankknow.com |
| q2 | 如何讓網站更容易被 ChatGPT/Perplexity 引用? | 0/2 | ozchamp.com、cheerway.tw、koodata.com、jiaye.com.tw |
| q3 | 台灣有哪些 GEO 優化服務/顧問? | 0/2 | welly.tw、awoo.ai、enterimc.com、**geoweb.tw**(同類健檢工具,已進榜) |
| q4 | 有哪些免費工具檢測 AI 搜尋能見度? | 0/2 | **seo.whoops.com.tw、ansign.com.tw、seoseo.com.tw、geo.baiyuan.io**(全是同定位工具) |
| q5 | llms.txt 是什麼?有幫助嗎? | 0/2 | frankchiu.io、hkgseo.com、searchengineland.com |
| q6 | 為什麼 ChatGPT 沒提到我的品牌? | 0/2 | pixis.ai、trakkr.ai、amicited.com |

q4 是最痛的一題:題目與 GEOCheck 的定位 100% 重疊(免費、免註冊、AI 能見度健檢),同類工具至少 5 家進榜,GEOCheck 缺席。**市場已驗證這個需求有搜尋量,而且競品正在收割。**

樣本說明:每題 2 次、以 web search 為代理指標,結果波動低但樣本小;趨勢結論需等下期對照。

## 三、問題清單與處置狀態

| ID | 嚴重度 | 問題 | 狀態 |
|----|--------|------|------|
| A1 | critical | Cloudflare managed robots.txt 封鎖所有 AI 爬蟲、Content-Signal ai-train=no | ⚠️ **待你到 Cloudflare 後台關閉**(下方有步驟) |
| A2 | critical | `/` 302→`/home`,canonical 卻指回 `/`,sitemap 列兩個 URL | ✅ 已修:`/` 直接 200 出首頁,`/home` 301→`/`,sitemap 只留 `/` |
| A3 | critical | og:image / twitter:image 指向不存在的 `/og-image.png`(404) | ✅ 已修:產出 1200×630 品牌圖 + 靜態路由,並補 og:image 尺寸標籤 |
| A4 | warning | 302 應為 301 | ✅ 隨 A2 一併修正 |
| A5 | warning | sitemap lastmod 每天動態變動 | ✅ 已修:固定為實際內容更新日(`CONTENT_LASTMOD`) |
| A6 | warning | llms.txt 不存在(首頁行銷卻大力推薦 llms.txt) | ✅ 已修:新增 `/llms.txt` 路由,含品牌定義、頁面導覽、FAQ |
| A7 | warning | 404 回 JSON、無 HTML 頁 | ✅ 已修:非 `/api/` 路徑回品牌化 HTML 404(附回首頁 CTA) |
| A8 | info | 無 favicon | ✅ 已修:產出 favicon.png + 路由 + `<link rel=icon>` |
| A9 | info | 單頁架構,主題無獨立可引用 URL | 📋 建議(見第五節) |
| A10 | info | footer 隱私權政策/服務條款是空連結 `#` | 📋 建議:補頁面或先移除(涉及內容撰寫,留給你決定) |
| A11 | info | skill 的 audit_checks.py 不支援 @graph,誤報無 JSON-LD | 📝 已記錄(skill 目錄唯讀,無法代修) |

robots.txt 程式端也已強化:明確 `Allow` GPTBot、OAI-SearchBot、ClaudeBot、Claude-SearchBot、PerplexityBot、Google-Extended、CCBot,並在檔頭註明 Cloudflare 覆蓋風險。

## 四、工程改動明細(已驗證)

改動檔案:`mock-api/server.js`(約 +100 行)、`mock-api/public/home.html`(favicon link、og:image 尺寸)、新增 `mock-api/public/og-image.png`、`mock-api/public/favicon.png`。

本地驗證結果(`PORT=8791 node server.js`):

```
GET /              → 200 text/html(首頁,title 正常)
GET /home          → 301 → /
GET /llms.txt      → 200 text/plain(品牌定義 + 導覽)
GET /robots.txt    → 200(明確 Allow AI 爬蟲)
GET /sitemap.xml   → 200(僅 1 個 URL,lastmod 固定)
GET /og-image.png  → 200 image/png(63,856 bytes)
GET /favicon.ico   → 200 image/png
GET /no-such-page  → 404 text/html(品牌化 404 頁)
GET /api/no-such   → 404 JSON(API 行為不變)
GET /healthz       → 200 {"ok":true}
```

回歸測試:`npm test` 中 algorithm-v2、algorithm-trust、geo-assessment、skill-sync、research-profile-proxy、business-loop、robots-unknown、report-state、crawler-v2、provider-config、model-config 全數通過。usage-meter 之後的測試因沙箱禁止刪檔(EPERM)無法執行,與本次改動無關;healthz 已手動驗證。

### 部署後你要做的三件事

1. **Cloudflare 後台(最重要,5 分鐘)**:選擇 geocheck 網域 → 左側「AI Crawl Control」(或 Security → Bots)→ 關閉「Block AI bots」;同區檢查「robots.txt management(managed robots.txt)」設為關閉,讓 origin 的 robots.txt 生效。改完後開 `https://geocheck.lisheng.cv/robots.txt` 確認已無 `User-agent: GPTBot / Disallow: /`。
2. 部署本次 repo 改動,線上確認上表 10 條路由行為一致。
3. Google Search Console:重新提交 sitemap,並對 `/` 按「要求建立索引」。

## 五、策略建議(下期優先)

1. **把四張學習資源卡片升級成獨立文章頁**(`/blog/what-is-geo`、`/blog/llms-txt-guide`…):q1、q5 這類定義題是最容易先拿下的引用機會,單頁摺疊卡片永遠比不過競品的專文。每篇附 FAQPage schema、定義式開頭、具體數據。
2. **站外聲量從 0 開始建**:AI 引擎高度仰賴第三方佐證。可立即做的:把 GEOCheck 提交到工具目錄與「免費 AI 能見度工具」類文章的作者(q4 榜上那幾篇就是目標)、在 Threads/Medium 發布健檢方法論(你已有 tungowo 系列 skill 可直接產內容)。
3. **用自家白皮書當引用彈藥**:「信義區 140 家餐飲 AI 能見度」研究是全站最有 GEO 潛力的資產——具體數據 + 獨有調查,正是 AI 最愛引用的內容型態。建議整理成公開頁面而非只留在 docx。

## 六、下期審計

robots.txt 解封後約 2–4 週再跑一次 `geo-test` 對照引用率變化;`seo-audit` 可於部署後立即重跑驗證 diff。基準數據已落地,下次起報告將以差異為主。
