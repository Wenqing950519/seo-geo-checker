# 基礎情報卡與網站訊息結構

日期 2026-09-07。定位／功能是官方宣稱，價格與單位詳見 [完整矩陣](MATRIX.md)。本文件補充訊息架構及實際抽查頁面的技術／SEO 結構。單頁未看到 JSON-LD ≠ 全站沒有 schema；存在 schema ≠ GEO 有效、被索引或取得高排名。未跑完整 crawl、Lighthouse、robots／sitemap／hreflang 全站驗證，不能把本表當完整 SEO audit。

| 類別／對象 | 定位、客群與功能摘要 | 定價入口／收費要點 | 官網訊息架構與 SEO/GEO 抽查 |
|---|---|---|---|
| Enterprise：Profound | 品牌與大型行銷團隊；visibility、panel prompt research、agent analytics、內容agents | [R01](https://www.tryprofound.com/pricing)：$99／399展示、enterprise；prompt、engine、seat、agent credits分層 | Pricing→功能／研究／University／客戶／demo；Next靜態資源可見；本次未確認完整JSON-LD類型 |
| Enterprise：Scrunch | 品牌／agency；monitor、site diagnostics、agent traffic、AXP delivery | [S01](https://scrunch.com/pricing)：Core250、enterprise；prompts／workspace／seats／audits | Product按任務分頁，另有agency／integration；pricing抽查沒有JSON-LD；頁面logo heading與內容heading並存，不能由此推斷搜尋傷害 |
| SaaS：Peec AI | SEO／agency；daily monitor、citation gaps、prompt research、actions | [P01](https://peec.ai/pricing)：月95／245／495；prompts、models、projects | Pricing→Use cases／agency／內容資源；marketing頁generator為Framer；pricing canonical正確指向該頁，抽查無JSON-LD；app是另一套資源 |
| SaaS：Otterly | solo到agency；prompt research、citation、GEO audit／recommendations | [O01](https://otterly.ai/pricing)：月29／189／489；prompts與engine add-ons | Features／Solutions／Resources／Pricing，加免費研究工具、industry benchmarks、agency入口；pricing有WebPage→SoftwareApplication及offers，canonical為pricing |
| SaaS：GeoGen | 多entity追蹤；visibility、競品、citation、LLM traffic | [E01](https://www.geogen.io/pricing)：年付月額EUR20／60／199／399；credits＋entity＋prompt | Pricing／docs／quickstart／API；Next資源；JSON-LD Org／WebPage graph；canonical使用不含www的geogen.io/pricing，非自動判定錯誤 |
| SaaS：AEO Mantis | 小型品牌／內容團隊；monitor→opportunity→article | [M01](https://www.aeomantis.com/zh-Hant/pricing)：一次free、20／50／100／200；quota跨brand共用 | 多語路由／pricing／about／plan signup；Next資源，Org／WebSite graph＋FAQPage；zh-Hant canonical；free與引擎數舊文案需以plan限制解讀 |
| SEO Suite：Ahrefs | SEO買家；大型品牌研究index、custom checks、demand與citation | [A01](https://ahrefs.com/brand-radar)：index與custom checks分售，suite含小額 | Brand Radar在既有suite中，連help／metrics／use cases；本次Brand Radar頁未見JSON-LD；有canonical；不是欠缺GEO能力的證據 |
| SEO Suite：Semrush | SEO／marketing／agency；AI toolkit與suite交叉使用 | [Q01](https://www.semrush.com/kb/1493-ai-visibility-toolkit)：99/domain＋prompt／seat加購 | KB將功能、limits、國家覆蓋與費用集中呈現；抽查KB頁無JSON-LD；未把KB結構推及整個marketing網站 |
| SEO Suite：Similarweb | 品牌／競爭情報；AI brand visibility與AI traffic | [V01](https://aisearch.similarweb.com/aeo/)：99起，具體quota未知 | AI Search子站，串連AI traffic／brand visibility／FAQ；抽查有Organization／BreadcrumbList／FAQ schema |
| Taiwan：Hogiah | 台灣品牌經營者；免費快查、監測、內容與教學 | [H02](https://www.hogiah.com/zh-TW/plans)：TWD1080／3280／12800；self-service單domain | 首頁→免費掃描→plans／auth，另學院、產業頁、blog、LINE；Next/Turbopack；WebSite、Breadcrumb、WebApplication、Org、FAQ等；offers幣別/口徑有多組，不能拿schema當單一價格正本 |
| Taiwan：awoo | 企業SEO客戶；GEO工具＋顧問與內容交付 | [T01](https://www.awoo.ai/zh-hant/geo-solution/)：詢價，單位未知 | solution＋news＋既有SEO案例→諮詢；WebPage／BreadcrumbList／WebSite；SEO案例不能充作已驗證GEO提升 |
| Taiwan：集客數據 | 需要策略與執行的企業；整合行銷服務 | [T02](https://inboundmarketing.com.tw/行銷顧問服務/)：詢價 | 顧問服務頁整合SEO／GEO／廣告；FAQ schema可見；不是自助SaaS漏斗，未發現公開可比quota |

## 替代方案情報卡

| 替代方案 | 使用方式／價值 | 成本與限制 | 來源類型 |
|---|---|---|---|
| ChatGPT＋Spreadsheet | 少量固定題＋人工保存答案／引用／客戶月報 | 所用帳號＋工時；沒有保證一致的抽樣、排程與歷史 | I：分析者構造的工作流，不是假裝存在的一家競品；未報未查的ChatGPT價格 |
| GSC | Google自己的搜尋與新生成式AI曝光資料 | 免費；Google限定，新公告未列原始AI query／conversion；新欄位API未知 | F：[Google公告](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports?hl=en) |
| GA4 | 可識別來源的網站session／事件，AI Assistant channel | 標準版免費；未點擊與來源缺漏不能補成0 | F：[channel docs](https://support.google.com/analytics/answer/9756891?hl=en) |
| Manual monitoring | 一次性研究或事件發生時檢查，顧問直接解讀 | 工時、選題偏差、引擎個人化與日期差；低頻任務可能比SaaS合理 | I：替代行為模型，不是已訪談的採用比例 |
| Open-source tracker | Optifeed的CLI/MCP／BYOK或OneGlanse自架UI追蹤 | 公開程式不等於零成本、正式SLA或所有引擎可無限免費用 | F：[Optifeed](https://github.com/optifeed/optifeed-radar)、[OneGlanse](https://github.com/aryamantodkar/oneglanse) README；未執行 |

替代方案不適用產品官網SEO／schema評分，故不以N/A當成缺點。GSC／GA4既可替代部分需求，也可能是GeoCheck的輸入資料；其存在不直接否定服務機會，但壓低僅整理圖表的價值。
