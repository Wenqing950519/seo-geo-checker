# GEOCheck Technical Whitepaper V3 (mechanically extracted)

Paragraphs: 171; Tables: 20

技術白皮書
GEOCheck
可解釋的 AI 搜尋能見度健檢架構
Evidence-first crawling analysis, deterministic scoring, and honest model assistance
核心主張 總分由可驗證的技術與內容訊號決定；語言模型只負責解釋，不負責決定分數。
GEOCheck / lisheng.cv
# 文件導讀
本白皮書說明 GEOCheck V3.0 的當前技術實作：它如何取得網站證據、如何把證據轉成 100 分評分、如何區分搜尋爬蟲與模型訓練爬蟲，以及外部 AI 服務失效時如何維持可用。文件同時揭露仍未完成的生產化能力，不把規劃項目描述成已上線功能。
閱讀方式 產品與合作夥伴可先讀摘要、架構與信任邊界；工程與審查者可續讀評分規格、測試與附錄。
## 目錄
執行摘要
問題定義與設計原則
當前系統範圍與技術架構
抓取與證據蒐集流程
100 分確定性評分模型
爬蟲治理與內容政策邊界
語言模型角色與本地降級
可解釋輸出與商家建議
驗證、壓力測試與品質門檻
安全性、可靠性與資料處理
已知限制與演進路線
附錄：規則、輸出與官方依據
# 執行摘要
傳統網站健檢常把 metadata、內容數量與搜尋結果混成單一分數；生成式搜尋又加入了不同用途的爬蟲、JavaScript 渲染差異，以及引用機制不透明等問題。若讓語言模型直接決定分數，同一網站可能因模型輸出波動而獲得不同結果，分數也難以被商家或工程師追溯。
GEOCheck V3.0 改採 evidence-first 架構：先取得首頁、HTTP 標頭、robots.txt、sitemap、HTML metadata、JSON-LD 與可讀文字，再由 25 項明確規則計分。外部搜尋與語言模型只負責補充脈絡與翻譯技術結果，不得修改核心分數。
系統承諾 每一分都應能回到一個觀測值；每一項未知都應維持未知；每一則建議都應說明商家可以請誰、修改哪個位置。
# 問題定義與設計原則
## 生成式搜尋健檢的四個失真來源
把「robots.txt 存在」當成高分。檔案存在不代表允許重要爬蟲；檔案不存在通常也不等於封鎖。
把訓練爬蟲與搜尋爬蟲混為一談。阻擋 GPTBot 或 ClaudeBot 是內容政策選擇，不應自動等於搜尋不可見。
只檢查瀏覽器畫面。SPA 可能在人眼看來完整，但伺服器回傳的 HTML 只有空殼。
把模型判斷當成客觀分數。模型適合整理語意與建議，不適合作為不可追溯的評分引擎。
## V3.0 設計原則
# 當前系統範圍與技術架構
GEOCheck 目前是一個 Node.js 單體式原型服務。伺服器提供首頁、健檢 API、報告頁與 Markdown 匯出；首頁抓取以原生 fetch 為主，在偵測到疑似 app shell 或 HTTP 抓取失敗時，使用 Playwright 執行瀏覽器渲染。Perplexity Sonar 為可選的外部佐證，Gemini 3.1 Flash-Lite 負責語意分析；兩者都不應影響核心 100 分。
圖 1 GEOCheck V3.0 當前技術架構與信任邊界
部署狀態邊界 本白皮書已驗證目前工作區的本地 API 與測試；未在本次工作中確認公開站 geocheck.lisheng.cv 已同步部署相同程式版本。
# 抓取與證據蒐集流程
## 首頁雙階段抓取
先以 HTTP fetch 取得首頁，允許重新導向，保存最終 URL、HTTP status、Content-Type 與 X-Robots-Tag。
解析原始 HTML 的 title、description、H1、canonical、robots meta、Open Graph、JSON-LD、圖片 alt 與 heading 層級。
若原始文字少於 500 字，且同時存在外部 script 與 app/root/next/nuxt 容器，視為疑似 client-rendered app shell。
以 Playwright 渲染頁面，保存渲染後 HTML、文字量、initialTextLength 與 renderGain。
瀏覽器渲染失敗時保留 HTTP 結果與 renderError；HTTP 本身失敗且符合條件時，瀏覽器作為 fallback。
判斷重點 不是看到 JavaScript 就扣分，而是衡量主要內容是否只在 JavaScript 執行後才出現。
## 公開技術檔案
系統從最終站點根目錄取得 robots.txt、sitemap.xml 與 llms.txt。robots 解析器依 user-agent 群組與最長匹配規則判斷首頁路徑；sitemap 會驗證 XML 容器、URL 數量及首頁是否列入。
# 100 分確定性評分模型
評分引擎採加法式基礎分，再套用嚴重問題上限。模型分數、品牌白名單與 Perplexity 搜尋結果不進入核心總分。每項規則回傳 id、weight、points、status、evidence 與 50 字內的 reason_zh。
## 抓取與收錄：30 分
## 網址發現與語意：35 分
## 內容可讀性：20 分
## 內容可引用性：15 分
目前版本以首頁文字中的語彙訊號作為輕量 proxy；FAQ、案例、比較、證據與服務清楚度各 3 分。這是可解釋但仍偏簡化的規則，不等同於模型實際引用機率。
限制 關鍵字命中只表示頁面出現可引用內容的表面訊號，不能證明內容正確、獨特或一定被 AI 引用。
## 嚴重問題分數上限
final_score = min(raw_rule_score, applicable_cap) label = Strong >= 85 | Decent >= 70 | Needs Work >= 45 | Critical < 45
# 爬蟲治理與內容政策邊界
V3.0 不使用「是否允許所有 AI bot」作為成熟度指標。搜尋可見度與模型訓練授權是不同決策，網站擁有者可以允許搜尋 bot，同時拒絕訓練 bot。
政策範例 商家可允許 OAI-SearchBot 與 Claude-SearchBot，以保留 AI 搜尋可見性；是否允許 GPTBot 與 ClaudeBot 則由內容授權政策決定。
User-agent: OAI-SearchBot Allow: / User-agent: GPTBot Disallow: /
# 語言模型角色與本地降級
## 模型可以做什麼
根據已取得的首頁文字與技術證據，描述可能的品牌分類、受眾與使用情境。
整理技術問題對商家的影響，並把修復方式改寫成繁體中文白話建議。
提出 awareness、consideration、decision 三個階段的 GEO 問題。
標註 limitations 與 confidence；缺乏證據時必須使用 unknown。
## 模型不能做什麼
不得修改 score.value、權重或分數上限。
不得宣稱特定 AI 排序或引用機制已被完整公開。
不得把 llms.txt、Schema 或允許訓練 bot 描述成排名保證。
不知道程式碼位置時不得捏造行號。
## 確定性降級
若 Gemini 3.1 Flash-Lite 發生設定錯誤、API 連線失敗或 JSON 解析失敗，外層協調器會重新取得首頁與技術訊號，產生 local-deterministic-fallback 報告。客觀分數與三項優先行動仍可回傳；定位分類設為 unknown，信心設為 low，並在 limitations 說明模型不可用。
# 可解釋輸出與商家建議
每項規則保留六個欄位：規則 ID、權重、實得分、pass/partial/fail、觀測證據與短理由。報告同時回傳五類 breakdown、raw score、applied cap 與 caps，讓前端或顧問可以說明分數如何形成。
{ "id": "initial_html_text", "weight": 4, "points": 0, "status": "fail", "evidence": "原始 HTML 可讀文字 40 字", "reason_zh": "多數爬蟲未必執行完整 JavaScript" }
## 白話建議生成規則
禁止事項 系統只能指出可定位的檔案或 HTML 區域；沒有原始碼行號時，不可寫成「請修改第 X 行」。
# 驗證、壓力測試與品質門檻
目前自動測試使用 Node.js assert，涵蓋 metadata 屬性順序、JSON-LD 解析、圖片 alt、SPA app-shell 判定、robots user-agent 規則、總權重 100，以及三個邊界案例。
測試解讀 SPA 案例 89 分表示內容本身成熟，但仍存在抓取相容性風險；它不是「完全無問題」的同義詞。
## 當前測試未涵蓋
真實多頁站點的 sitemap 漂移、孤兒頁與 canonical 衝突。
不同 bot 對複雜 wildcard、query string 與大小寫的完整 robots 規格相容性。
WAF、CDN、地區限制與真實 user-agent 的端到端差異。
Search Console、Bing Webmaster Tools 與實際 AI 引用的長期對照資料。
多語系、hreflang、Article modified time、產品與評論 Schema 的深層驗證。
# 安全性、可靠性與資料處理
## 已實作控制
## 生產化前必須處理
高優先風險 normalizeUrl 目前只限制 http/https，尚未阻擋 localhost、私有 IP、link-local、DNS rebinding 與雲端 metadata endpoint；公開服務需先加入 SSRF 防護。
以共享儲存（例如 Redis）取代單程序記憶體 rate limit，避免多實例各自計數。
對 DNS 解析結果做私有網段與保留位址封鎖，並在每次 redirect 後重新驗證。
限制 sitemap 宣告的跨網域抓取，並加入最大重新導向、回應大小與 MIME 驗證。
定義報告保存期限、刪除政策、日誌去識別化與 API key 秘密管理。
為外部供應商加入 circuit breaker、觀測性指標與成本上限。
# 已知限制與演進路線
## 當前已知限制
## 建議演進順序
V3.0 - 修正 unknown 三態計分、加入 SSRF 防護，並把前端報告呈現完整 breakdown 與 25 項證據。
V2.2 - 從首頁擴展到 sitemap 代表性抽樣，檢查 title 重複、canonical、noindex、狀態碼與內部連結。
V2.3 - 加入 Schema 屬性驗證、hreflang、多語系與更新時間一致性。
V2.4 - 建立可重跑的真實 AI 搜尋測試，分開觀測品牌提及、推薦位置、引用 URL、情緒與競品比較。
V3.0 - 以 Search Console、Bing、伺服器 log 與長期 AI 引用資料校準權重；保留版本化、回測與變更理由。
## 停止條件與治理
權重不應因單一客戶、單次搜尋或模型輸出而調整。任何變更至少需要：明確失真案例、可重現測試、對 Google SEO 無負面影響、50 字內邏輯理由、版本號與回測結果。若沒有足夠證據證明調整優於現況，應維持現狀。
# 結論
GEOCheck V3.0 已從「模型主觀分數加少量校準」轉向「可驗證證據決定分數、模型負責解釋」的架構。這個轉變不代表系統已經能預測任何 AI 是否一定引用網站，而是先建立一個可被商家理解、可被工程師重現、可被未來資料校準的技術基線。
當前版本最重要的價值，是把搜尋可見度、內容政策與模型推論拆開：網站可以保留對訓練資料的選擇權，同時維持搜尋可見性；模型可以提供語意幫助，但不能讓不可解釋的輸出改寫分數。下一階段的成熟度將取決於生產安全、多頁覆蓋與真實長期結果的校準，而不是繼續增加無法驗證的 AI 偏好規則。
# 附錄 A：API 輸出契約摘要
# 附錄 B：官方依據
1. OpenAI Publishers and Developers FAQ - OAI-SearchBot 與 GPTBot 的用途區分。OpenAI 官方文件
2. Anthropic crawler controls - ClaudeBot、Claude-User、Claude-SearchBot 與 robots.txt。Anthropic 官方文件
3. Google common crawlers - Googlebot、Google-Extended 與產品影響。Google crawler 官方文件
4. Google JavaScript SEO basics - 抓取、渲染、索引與 SPA 建議。Google JavaScript SEO 官方文件
5. Google sitemap overview - sitemap 的用途與適用範圍。Google sitemap 官方文件
6. Google robots meta specifications - meta robots 與 X-Robots-Tag。Google robots meta 官方文件
7. Schema.org - 通用結構化資料詞彙。Schema.org 官方詞彙
# 附錄 C：程式與測試證據
文件版本聲明 本白皮書描述 2026-07-13 工作區中的當前實作。後續演算法、爬蟲官方文件或部署版本變更時，應更新版本號、基準日期與差異紀錄。
2026-07-16 實作狀態更新（技術白皮書）
本頁覆蓋本文件中較早的供應商名稱、版本敘述與待驗證假設；以 2026-07-16 的程式碼、測試與供應商連線檢查為準。任何未公開或未驗證的 AI 引用行為一律標示為未知。
供應商分工：Perplexity Sonar 已驗證為公開脈絡補充；Gemini 3.1 Flash-Lite 僅在部署區域通過連線後才執行語意解讀。兩者都不得改寫核心分數。成本台帳為 JSONL 持久化快照；非持久化主機需移至資料庫或持久化磁碟。
上線前條件：部署平台必須設定 GEMINI_API_KEY、PERPLEXITY_API_KEY、ADMIN_PATH_TOKEN、ADMIN_TOKEN；Gemini 請求需位於支援區域或改用 Vertex AI。成本單價為預估參數，須以供應商帳單校正。
GeoCheck 技術白皮書 V3.0
更新日期：2026-07-16
# V3 量測架構
GEO 主分數由 Perplexity 搜尋觀測 50%、內容可引用性 30%、必要技術存取 20% 組成。
每個網站固定使用 3 次 Perplexity：1 次精確實體驗證與 2 次非品牌探索。
Gemini Flash-Lite 每站使用 1 次，只標準化基本資訊、產業、網站結構與內容特徵；不參與計分。
Perplexity 證據不足時 GEO 分數為未知，不以站內準備度或 Gemini 判讀補分。
# 白皮書研究模式
研究 Skill 與正式網站共同匯入 mock-api/lib/geo-measurement.js，避免權重與查詢邏輯漂移。
批次執行要求 Perplexity 與 Gemini 兩個獨立硬上限；超過任一上限時，第一個付費呼叫前即停止。
輸出包含 JSONL、CSV、統計摘要、方法檔、查詢觀測、來源網址、模型、失敗狀態與資料集 SHA-256。
Gemini 研究 schema 不含建議、行動、改寫、改善或預期成效欄位。
# 最終驗證與限制
2026-07-16 實測：壽司郎 GEO 65、站內準備度 63；Hunterest GEO 41、站內準備度 87。
結果證明站內結構完整不再自動換成高 GEO 分；外部實體、品牌提及與官網引用證據才是主差異。
量測只代表指定 Perplexity 模型、固定查詢集與收集期間，不代表所有 AI 引擎的普遍排名。
最終資料集 SHA-256：83d50e17a6962342d5e1baf7c44ea3e97fb40bda0c4ff2ba7703b8304010cd6c。
# 執行與安全
本機 Gemini 若因出口地區遭拒，研究腳本可改走 Render 上的受保護代理 POST /api/internal/research-profile。
代理必須帶 X-Admin-Token，未授權請求回傳 401；API key 不傳回前端或資料集。
npm.cmd test 會驗證演算法邊界、網站與 Skill 綁定、禁止建議欄位與代理密碼契約。
## Table 1

文件欄位 | 內容
版本 | 3.0 / Perplexity-first GEO Whitepaper
基準日期 | 2026 年 7 月 13 日
產品 | geocheck.lisheng.cv
文件狀態 | 以目前程式碼與本地驗證為準；公開站部署同步尚未在本次工作確認

## Table 2

面向 | 當前狀態
核心計分 | 25 項規則、五大類、滿分 100
嚴重問題 | 首頁抓取、noindex、Googlebot 封鎖與極低文字量會觸發分數上限
SPA 處理 | 比較原始 HTML 與瀏覽器渲染結果，識別 app shell
AI 依賴 | 模型只做定位與解釋；失效時切換本地確定性報告
測試證據 | 圖片型首頁 34、SPA 民宿 89、全站封鎖案例 35
當前成熟度 | 可運作 MVP / local verified；仍需站內爬取、SSRF 防護與分散式限流

## Table 3

原則 | 工程含義
證據先於推論 | 先取得可重現的 HTTP、HTML 與公開技術檔案，再做結論。
分數與敘事分離 | 規則引擎決定分數；模型只整理定位、風險與白話建議。
搜尋與訓練分流 | 只把搜尋用途 bot 納入搜尋能見度分數。
Google SEO 不可犧牲 | 任何 AI 搜尋優化不得鼓勵封鎖 Googlebot 或誤用 noindex。
致命問題不可被平均 | 高品質內容不能抵消 Disallow: / 或 noindex。
對商家可執行 | 不捏造程式碼行號；指向 robots.txt、<head>、伺服器標頭或內容區塊。

## Table 4

元件 | 責任
mock-api/server.js | HTTP 路由、報告暫存、輸出頁、rate limit
html-v2.js | HTTP 首頁抓取、metadata 解析、SPA 判定與瀏覽器 fallback
technical-signals.js | robots、sitemap、llms.txt 與 bot 權限判定
scoring-v2*.js | 25 項規則、部分得分、分類加總與分數上限
real-lite-audit*.js | 協調技術訊號、模型解釋、確定性修復建議與降級
providers/*.js | Perplexity Sonar 與 Gemini 3.1 Flash-Lite API 連線、重試與錯誤正規化

## Table 5

資源 | 檢查內容 | 評分角色
robots.txt | 讀取 allow/disallow、Sitemap 與各 bot 首頁權限 | 部分計分
sitemap.xml | 驗證 XML、首頁 URL 與宣告位置 | 最高 13 分
llms.txt | 紀錄是否存在 | 實驗性；0 分
meta robots | 偵測 noindex | 8 分與 35 分上限
X-Robots-Tag | 偵測 HTTP 層 noindex | 8 分與 35 分上限

## Table 6

類別 | 涵蓋訊號 | 權重
抓取與收錄 | 首頁、noindex、Googlebot、OAI-SearchBot、Claude-SearchBot | 30 分
網址發現能力 | sitemap、首頁列入、robots 宣告、canonical | 15 分
語意與 metadata | title、description、H1、OG、Schema 有效與適配 | 20 分
內容可讀性 | 文字量、原始 HTML、渲染差異、圖片 alt、heading | 20 分
內容可引用性 | FAQ、案例、比較、證據、服務清楚度 | 15 分

## Table 7

規則 ID | 分數 | 通過條件 | 理由
homepage_fetch | 8 | 首頁正常取得 | 任何分析的前置條件
indexable | 8 | 未發現 noindex | 保護搜尋收錄資格
googlebot_access | 6 | Googlebot 未被封鎖 | 不犧牲傳統搜尋
oai_search_access | 4 | OAI-SearchBot 未被封鎖 | ChatGPT 搜尋可見性
claude_search_access | 4 | Claude-SearchBot 未被封鎖 | Claude 搜尋可見性

## Table 8

規則 ID | 分數 | 通過條件
sitemap_valid | 8 | 可解析的 urlset 或 sitemapindex
homepage_in_sitemap | 3 | 首頁出現在 sitemap
sitemap_declared | 2 | robots.txt 有 Sitemap 宣告
canonical | 2 | 首頁有 canonical
title | 5 | 有非空 title
description | 3 | 有 meta description
h1 | 4 | 有 H1
open_graph | 2 | og:title 與 og:description 齊全
valid_schema | 3 | 至少一段 JSON-LD 可解析
relevant_schema | 3 | 類型屬於 Organization、LocalBusiness、Service、Product、Article、FAQPage、WebSite 或 Person

## Table 9

規則 ID | 分數 | 通過或部分得分條件
readable_text | 8 | >=1,000 字得 8；>=300 字得 5；否則 0
initial_html_text | 4 | 原始 HTML 可讀文字 >=200 字
render_consistency | 4 | 渲染增量 / 初始文字 <=1.5
image_alt | 2 | >=80% 得 2；>=50% 得 1；否則 0
heading_structure | 2 | 包含 H1，且 heading 不跳超過一級

## Table 10

規則 | 文字訊號 | 分數
faq | FAQ、Q&A、常見問題、問答、問題 | 3
cases | case study、案例、客戶、成功、成果、實績 | 3
comparisons | 比較、vs、替代、競品、方案差異 | 3
proof | 數據、研究、報告、白皮書、引用、來源、證明 | 3
service_clarity | 服務、方案、價格、收費、流程、適合、對象 | 3

## Table 11

觸發條件 | 最高分 | 設計理由
首頁無法抓取 | 25 | 沒有原始內容時，不允許 metadata 或搜尋訊號把分數推高
首頁 noindex | 35 | 頁面可能不進入搜尋索引
Googlebot 被封鎖 | 35 | 避免 AI 優化掩蓋傳統搜尋致命錯誤
可讀文字 <100 字 | 42 | 能開啟但幾乎沒有可理解內容

## Table 12

User-agent | 主要用途 | 計分 | 類型
Googlebot | Google Search 抓取與索引 | 6 分 | 搜尋
OAI-SearchBot | ChatGPT 搜尋摘要與引用 | 4 分 | 搜尋
Claude-SearchBot | Claude 搜尋索引品質 | 4 分 | 搜尋
GPTBot | OpenAI 潛在模型訓練 | 0 分；只顯示 | 政策
ClaudeBot | Anthropic 模型訓練 | 0 分；只顯示 | 政策
Google-Extended | Gemini 訓練與部分 grounding 控制 | 0 分；只顯示 | 政策

## Table 13

執行狀態 | 回傳內容 | 信任處理
正常模式 | 規則分數 + Perplexity 佐證 + Gemini 3.1 Flash-Lite 語意解釋 | 完整
Perplexity 不可用 | 規則分數 + Gemini 3.1 Flash-Lite；搜尋佐證略過或降級 | 核心分數不受影響
Gemini 3.1 Flash-Lite 不可用 | 規則分數 + 本地確定性建議 | 定位 unknown / low
首頁不可抓取 | fetch-limited 報告 | 未取得項目維持未知

## Table 14

觸發情況 | 商家版建議
缺少 title / H1 | 請網站設計師在首頁 <head> 補 title，並在主要內容放一個 H1；直接寫店名、服務與地區。
SPA 空殼 | 把主要文字放進伺服器回傳的 HTML，或加入 SSR／預先渲染。
Disallow: / 或 noindex | 先確認是否為刻意不公開；若是誤設，再修改 robots.txt、meta 或 X-Robots-Tag。
AI 搜尋 bot 被擋 | 只調整 OAI-SearchBot 或 Claude-SearchBot；不必連訓練 bot 一起開放。
Schema 缺漏 | 依店家類型加入可驗證的 LocalBusiness 或 Organization，且內容要與頁面一致。

## Table 15

案例 | 分數 | 標籤 | 判斷
只放一張圖片的咖啡廳 | 34 | Critical | 可抓取不等於可理解；極低文字量觸發 42 分上限
JavaScript SPA 民宿 | 89 | Strong | 渲染後內容完整，但原始 HTML 與一致性規則失分
完整文章 + Disallow: / | 35 | Critical | 高內容分不能抵消全站封鎖

## Table 16

控制 | 當前設定
請求大小 | JSON request body 超過 1 MB 會中止
抓取逾時 | 首頁 20 秒、技術資源 10 秒、瀏覽器 35 秒、模型 35 秒
並發限制 | 預設同時最多 2 個 audit
IP rate limit | 預設 10 分鐘 10 次
URL cooldown | 同 URL 預設 30 分鐘
模型重試 | 低溫度、最多 2 次，錯誤正規化
輸出限制 | 首頁文字最多 8,000 字；技術資源最多 1 MB

## Table 17

限制 | 現況 | 優先級
首頁範圍 | 只分析首頁；尚未形成站內代表性抽樣或完整 crawl graph | 高
robots unknown 計分 | robots 401/403 會標記 unknown，但計分層目前仍以未確認封鎖處理 | 高
SSRF 防護 | 尚未阻擋私有網路與 metadata endpoint | 高
rate limit | 單程序記憶體；不適用多實例部署 | 中
Schema 深度 | 只驗證 JSON 可解析與類型，不驗證 required/recommended properties | 中
內容品質 | 可引用性以關鍵字 proxy 判定，尚未評估證據真實性與獨特性 | 中
標題品質 | 目前只檢查有無，未檢查重複、長度、品牌與地區描述 | 中
更新訊號 | 尚未檢查 article:modified_time、dateModified 與 sitemap lastmod 一致性 | 低
公開部署 | 本次未確認 geocheck.lisheng.cv 已部署 V2 程式 | 高

## Table 18

欄位 | 內容
algorithmVersion | 2.0
homepage | metadata、textLength、initialTextLength、renderGain、fetchMethod、statusCode
technical | robots、sitemap、llms.txt 與六種 bot 狀態
search | Perplexity 可選佐證或 fallback reason
audit.score | value、label、raw_score、applied_cap、caps、breakdown、rules
audit.positioning | 模型定位、受眾、使用情境、風險、confidence
audit.priority_actions | 固定三項 P1-P3 商家行動
audit.limitations_zh | 資料範圍、政策與未知行為說明

## Table 19

檔案 | 證據角色
ALGORITHM_V2.md | 規則、權重、邊界案例與官方來源摘要
mock-api/lib/html-v2.js | HTML/metadata 解析與 SPA 雙階段抓取
mock-api/lib/technical-signals.js | robots、sitemap 與 bot 權限
mock-api/lib/scoring-v2-core.js | 訊號收集、25 項規則與分數上限
mock-api/lib/scoring-v2.js | Schema 權重修正與 100 分封裝
mock-api/lib/real-lite-audit-v2-core.js | 模型提示、確定性建議與報告組裝
mock-api/lib/real-lite-audit.js | 模型供應商失效時的本地降級
mock-api/tests/algorithm-v2.test.js | 權重、robots、metadata 與三個邊界案例

## Table 20

項目 | 目前狀態 | 判定依據
規則評分與爬蟲 | 已驗證 | 核心分數由多頁抓取、技術訊號與確定性規則決定；自動測試通過。
Perplexity Sonar | 已啟用 | 真實供應商連線成功；用於網站公開脈絡與來源探索，不改寫核心分數。
Gemini 3.1 Flash-Lite | 部署待驗證 | 程式與設定已接通，但目前執行位置收到 HTTP 400：User location is not supported for the API use。
模型失敗降級 | 已驗證 | Gemini 不可用時回傳本地確定性報告，AI 定位標記為未驗證。
成本與私有後台 | 已驗證 | 已記錄 token、延遲、狀態與預估成本；私有路徑加密碼雙層保護。
