---
name: seo-geo
description: >
  Run strategy-led SEO and GEO (Generative Engine Optimization) workflows:
  AI entity positioning, technical SEO audits, AI citation/source-visibility testing, content opportunity
  briefs, website health reports, and weekly reports. Use when the user mentions SEO, GEO, AI 引用,
  AI 搜尋可見度, 網站健檢, 技術檢查, 搜尋排名, sitemap, schema.org, llms.txt,
  關鍵字機會, 內容簡報, SEO 週報, geo-test, or asks how their site performs in
  Google or AI search engines such as ChatGPT, Perplexity, or Gemini.
---

# seo-geo: SEO/GEO 策略作業系統

這個 skill 不是只跑通用 checklist。它要把 SEO/GEO 結果放回使用者的品牌主張、ICP、
證據庫、競品敘事與商業優先級中判斷。沒有策略脈絡時,先補脈絡;不要把流量當成唯一目標。

| 模式 | 做什麼 | 觸發語例 |
|------|--------|----------|
| `ai-positioning` | 先確認 AI/搜尋引擎如何理解本站定位與品類 | 「AI 眼中我們是什麼」「先做網站定位」 |
| `seo-audit` | 技術 SEO 檢查 + 與上次 diff | 「跑 SEO 檢查」「網站健檢」 |
| `geo-test` | 追蹤 AI 回答/來源中是否出現本站 | 「AI 有沒有引用我們」「geo test」 |
| `content-brief` | 從 GSC/GEO 缺口產策略型內容簡報 | 「找關鍵字機會」「產內容簡報」 |
| `seo-report` | 彙整網站健檢、趨勢、風險、SEO 專家優化方向 | 「SEO 週報」「給我報告」「網站健檢報告」 |

使用者沒指定模式時,根據語意判斷;模糊時用一個問題確認。排程觸發時,prompt 會註明要跑哪個模式。

## 每次執行的第一步

Skill 安裝目錄是唯讀的,所有狀態都存在使用者工作資料夾(下稱 `<workdir>`)。

**多客戶/多網站歸檔(重要)**:一個 `<workdir>/seo-geo/` 下可同時管理多個網站,每個網站
一個用 `<Client>`(品牌名,如 `Hunterest`、`Artniverse`)命名的子資料夾。所有路徑解析如下:

- `<clientdir>` = `<workdir>/seo-geo/<Client>/` —— 該客戶的工作狀態(config、questions、references、data、drafts)。
- `<reportsdir>` = `<workdir>/seo-geo/reports/<Client>/` —— 該客戶的「輸出物」(報告)。
  報告與工作狀態刻意分開:`reports/` 底下每個客戶一個資料夾並列,方便交付與翻閱。
- 本文件後續所有相對路徑(`config.json`、`data/audits/...`、`drafts/...`)都相對於 `<clientdir>`;
  所有 `reports/...` 相對於 `<reportsdir>`。

執行步驟:

1. **解析是哪個客戶**。從使用者給的 URL 或品牌名對應到 `<Client>` 子夾。
   - 已存在 `<workdir>/seo-geo/<Client>/config.json` → 直接讀它,以 config 為準。
   - `seo-geo/` 下有多個客戶且使用者沒指明 → 用一個問題確認是哪一個,不要猜。
   - 找不到對應客戶 → 進入該客戶的首次初始化。
2. 找策略脈絡檔(在 `<clientdir>/references/`)。若缺少,先從本 skill 的 `references/` 模板複製過去,
   再請使用者補關鍵資訊;缺資料時可以先標 `TBD`,但輸出時必須揭露限制。
3. 之後每次執行都先讀該客戶的 config 與策略脈絡。config 沒有的欄位用 example 檔預設值補。

沒有工作資料夾時,請使用者選一個能跨 session 保存的資料夾。

首次初始化某客戶時要建立(以 `<Client>` = 品牌名):

```text
<workdir>/seo-geo/
├── <Client>/                 # 每個網站一個工作夾
│   ├── config.json
│   ├── questions.json
│   ├── references/
│   │   ├── strategy.md
│   │   ├── icp.md
│   │   ├── ai-positioning.md
│   │   ├── evidence-inventory.md
│   │   ├── scoring-rubric.md
│   │   ├── competitor-map.md
│   │   └── recommendation-examples.md
│   ├── data/audits/
│   ├── data/geo/
│   ├── data/changes.log
│   └── drafts/
└── reports/
    └── <Client>/             # 該網站的報告輸出,與其他客戶並列
```

> 單一客戶的舊版扁平結構(config/data/reports 直接放 `seo-geo/` 根目錄)仍可運作;
> 但只要有第二個網站加入,就把每個客戶各自收進 `<Client>/` 子夾並對齊,避免互相覆蓋。

`data/changes.log` 是因果歸因的基礎:使用者每次改網站、發布內容、調整定位,記一行
(日期 + 做了什麼 + 影響哪些頁/問題)。報告解讀任何變化前必須對照這個檔案;
沒有對應變更記錄的變化,歸因一律降級為推測。提醒使用者養成記錄習慣。

初始化時至少問:

- 網站 URL、sitemap、主要競品、語言/市場、是否推 Telegram。
- 這個品牌相信什麼、反對什麼、最想被 AI/Google 記住的一句話。
- 最有價值的客戶是誰、他們在什麼情境下搜尋或問 AI。
- 哪些主題即使有流量也不追,哪些主題即使難做也值得做。
- 有哪些可引用證據:原創數據、案例、研究、第三方報導、產品比較、客戶用語。

## 強制前置:AI 眼中定位

在首次執行、競品分析、content-brief、seo-report 前,先完成或更新 `ai-positioning`。
不要只使用使用者自認的競品或定位直接分析;先量測 AI/搜尋引擎目前把網站理解成什麼。

若無法取得真實 AI 產品結果,可用一般 web search 或搜尋摘要做 `source_visibility_proxy`,
但必須標示這不是 AI 回答結果。

`ai-positioning` 產出後,更新:

- `references/ai-positioning.md`:AI 對品牌/網站的品類、用途、受眾、核心主張、誤解與缺席場景。
- `references/competitor-map.md`:由 AI 結果推導出的競品與敘事戰場,並標記使用者提供競品與 AI 發現競品的差異。
- `questions.json`:補上 AI 定位過程中發現的高價值問題、品類詞、alternatives/best/how-to 類查詢。

## 策略脈絡規則

在 `geo-test`、`content-brief`、`seo-report` 前讀:

- `references/strategy.md`: 品牌立場、定位、禁止追逐的流量。
- `references/icp.md`: ICP、購買旅程、問題背後的商業意圖。
- `references/ai-positioning.md`: AI/搜尋引擎目前如何理解本站,以及定位落差。
- `references/evidence-inventory.md`: 可被 AI/搜尋引擎引用的事實素材。
- `references/scoring-rubric.md`: 機會排序公式與主觀權重。
- `references/competitor-map.md`: 競品敘事、強弱點、要挑戰/避開的戰場。
- `references/recommendation-examples.md`: 好/壞建議範例,用來校準輸出品質。

如果這些檔案缺資料,不要編造。用 `missing_context` 記錄缺口,並把「需要使用者補什麼」列在結尾。

## 模式 1: ai-positioning

目標是建立 AI/搜尋引擎對網站的「外部感知基線」,作為競品分析與報告判斷的前提。

1. 讀 `config.site`、`strategy.md`、`icp.md`。若缺少品牌名、base_url 或市場,先請使用者補。
2. 依 `config.positioning.queries` 或自行補足 8-15 題查詢,至少涵蓋:
   品牌名、品牌 + review/alternatives、品類詞、best/top 類、how-to/problem 類、目標客群 + 解法。
3. 對每題記錄 AI/search 結果中的:
   AI 對本站的描述、是否出現本站、出現頁面、一起出現的競品、引用來源、錯誤理解、缺席場景。
4. 將結果整理成:
   `perceived_category`、`perceived_audience`、`perceived_use_cases`、`recognized_strengths`,
   `misunderstandings`、`missing_scenes`、`ai_discovered_competitors`、`source_gaps`。
5. 更新 `references/ai-positioning.md` 與 `references/competitor-map.md`。
   競品分成「使用者提供」「AI 發現」「搜尋結果常同場」三類,不要混在一起。
6. 輸出定位診斷摘要:AI 目前怎麼看、跟品牌自我定位差在哪、下一步競品分析應該比誰。

## 模式 2: seo-audit

1. 透過 web fetch 工具抓 sitemap,依 `config.audit.max_pages`、`priority_paths`、`exclude_patterns`
   選出頁面。抓網頁一律用 web fetch 工具,不要用 curl 或 Python requests 直接發請求。
2. 逐頁抓取,將 HTML 原始碼存到暫存資料夾。
3. 執行:

   ```bash
   python scripts/audit_checks.py <html_dir> <output.json> --base-url <config.site.base_url>
   ```

   腳本只負責結構化檢查。robots.txt、llms.txt、內容品質、canonical 是否指向正確版本、
   schema 類型是否合適,讀 `references/audit-checklist.md` 人工判斷後合併進結果。
4. 存檔到 `data/audits/audit-YYYYMMDD.json`。若有上一次結果,執行
   `scripts/diff.py <prev> <curr>` 產出變化摘要。
5. 輸出問題時按「影響 × 修復成本 × 策略重要性」排序,不是只按技術嚴重度排序。

## 模式 3: geo-test

目標是追蹤本站在 AI 回答或 AI 搜尋來源中的可見度。只有實際 AI 產品/瀏覽器結果能稱為
AI 引用測試;若只能用一般 web search,要標為 `source_visibility_proxy`,不要宣稱是 AI 引用率。

1. 先確認 `ai-positioning` 已有近期結果。若沒有,先跑 `ai-positioning` 或標示本次 geo-test 缺少定位基線。
2. 讀 `questions.json` 與策略脈絡檔。若使用者指定 tag、id、journey_stage,依其篩選。
3. 每題依 `config.geo.providers` 測試。若 provider 無可用工具,請使用者提供匯出結果或改記為 proxy。
4. 每題重複 `config.geo.runs_per_question` 次。記錄測試日期、provider、prompt、來源 URL、截圖/匯出來源
   可得性與不確定性。
5. 每次實測記錄欄位見 `references/geo-checklist.md`:是否引用本站、引用排序、被引用頁面、
   競品是否被引用、是否只是品牌提及。
6. 彙整成 `data/geo/geo-YYYYMMDD.json`:整體引用率、各題引用率、競品對照、proxy 與 real run 分開統計。
7. 對持續未被引用的高價值問題,結合 `ai-positioning.md`、`evidence-inventory.md` 與 `competitor-map.md` 給出最多 3 個缺口:
   缺明確答案、缺可引用證據、缺第三方佐證、敘事被競品佔走,或目標頁不適合承接。
8. **競品贏因拆解**:對「競品被引用而本站沒有」的高價值題目,實際抓取競品被引用的頁面,
   依 `references/geo-checklist.md` 的贏因維度逐項對照,寫入 `competitor_win_analysis`。
   「競品比較強」不是分析;要答出強在哪一項、我們可複製的是什麼、不可複製的是什麼。

## 模式 4: content-brief

1. 取得 GSC 查詢數據:依 `config.content_brief.gsc_source`。有 connector 就用 connector;否則請使用者提供 CSV。
   拿不到數據就明說,不要憑空猜關鍵字。
2. 篩選機會關鍵字:曝光、排名、CTR 門檻來自 config。再用 `references/scoring-rubric.md`
   計算 `opportunity_score`。
3. 對照最近一次 ai-positioning 與 geo-test 中未被理解/未被引用的高價值問題。
   重疊主題優先,但避開 `strategy.md` 中明確不追的流量。
4. 每個機會產一份簡報存到 `drafts/`,單次最多 `max_briefs_per_run` 份。每份簡報必須包含:
   目標客群與旅程階段、商業價值、搜尋/AI 問題、內容角度、可引用證據、競品敘事缺口、
   建議頁面結構、FAQ/schema 建議、不要寫的角度。
5. 只產草稿與簡報,絕不直接發布或修改網站內容。人工審核是刻意保留的品質閘門。

## 模式 5: seo-report

1. 讀最近一期 ai-positioning,最近兩期 audit、geo 結果,以及 drafts/reports 狀態。
   若資料收集已達最低門檻(至少有定位診斷 + 技術檢查,或定位診斷 + GEO 測試),即可產出網站健檢報告。
2. 讀策略脈絡檔與 `references/report-template.md`。報告核心是 diff、趨勢與決策:
   AI 如何理解本站、哪些 SEO/GEO 問題真的影響商業目標、哪些需要使用者補證據或改定位。
3. 存到 `<reportsdir>/report-YYYYMMDD.md`(即 `<workdir>/seo-geo/reports/<Client>/report-YYYYMMDD.md`)。
4. 若 `config.report.telegram.enabled` 為 true,只推送摘要,不要推全文。推播失敗不影響報告產出。

## 輸出品質標準

- 每個建議都要有「資料依據 + 策略理由 + 下一步」。
- 不要輸出空泛建議,例如「加 FAQ」「補 schema」「提升內容品質」。要指出加在哪頁、回答哪個問題、
  使用哪個證據、為什麼值得做。
- 當資料不足時,列出最小補資料清單,不要假裝有結論。
- **樣本量誠實**:任何比率必須附樣本量,小樣本(<10 次)用次數表述(「3/9 次」)而非
  百分比小數——「33.3%」在 9 次測試裡是偽精確。單期變化在 ±1 次以內視為雜訊,
  不得寫進「本期重點」。
- **因果紀律**:引用與排名變化可能來自 AI 模型更新、隨機波動或內容改動,三者在數據上
  長得一模一樣。敘述上限是「與 X 變更同期出現,可能相關」;只有連續兩期以上同方向、
  且能對應 `data/changes.log` 的變更時,才可升級為「初步證據支持」。
  永遠不寫「因為我們做了 X,所以 Y 上升」。
- 趨勢至少要兩期以上才下判斷。proxy 測試要明確標示不確定性。
- 執行結束時給簡短摘要、產出檔案位置、下一個最值得補的策略資料。

## 檔案參照

| 檔案 | 何時讀 |
|------|--------|
| `references/audit-checklist.md` | seo-audit 第 3 步,檢查項目的單一真實來源 |
| `references/geo-checklist.md` | geo-test 記錄欄位與可引用性準則 |
| `references/report-template.md` | seo-report 產報告前 |
| `references/strategy.md` | 初始化、geo-test、content-brief、seo-report |
| `references/icp.md` | 初始化、geo-test、content-brief、seo-report |
| `references/ai-positioning.md` | ai-positioning、geo-test、content-brief、seo-report |
| `references/evidence-inventory.md` | geo-test 缺口分析與 content-brief |
| `references/scoring-rubric.md` | content-brief 與優先級排序 |
| `references/competitor-map.md` | geo-test 與 content-brief |
| `references/recommendation-examples.md` | 產出建議前校準品質 |
| `assets/config.example.json` | 首次初始化,或 config 缺欄位時查預設值 |
| `assets/questions.example.json` | 首次起草問題集時當格式範本 |
