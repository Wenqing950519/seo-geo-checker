# Idea Check：GeoCheck 半 Agent＋Dashboard Workspace

研究日期：2026-09-07。此文件依 `C:\Users\eason\Documents\skill\idea-check` 完整框架完成，是對「半 Agent＋dashboard」路線的重新檢查；不修改 GeoCheck 正式產品定位、商業模式、研究優先序或任何決策紀錄。

## A. Executive verdict

**Verdict：先驗證；信心中等。**

這條路在產品上比純 dashboard 更合理：dashboard 保存可觀測事實，Agent 把事實轉成有證據、可拒絕、可回查的決策工作。可是「AI Visibility dashboard 加 Agent」已被 Ahrefs、Trustable、aeoh 與 Visibility.so 等公開產品採用；Agent 不是差異化，更不是護城河。GeoCheck 只有在某個窄工作中，能比「既有 SEO suite + 聊天 Agent + 試算表」更可靠地回答 *該不該做、為什麼、下次怎麼驗證*，才有投入理由。

**投資論點 I：**把現有的版本化題目、原始答案、來源驗證與 `unknown` 規則做成 Agent 的硬限制，可能形成較可信的 AI 搜尋決策系統，而不是又一個泛用內容 Agent。

**反方論點 F/I：**Ahrefs 的 Ask Ahrefs 已能讀整個 workspace、跑 API、比較競品與解釋 mention spike；Trustable 也公開宣稱其 Agent 讀掃描歷史、建立任務。若 GeoCheck 的 Agent 只會摘要 dashboard 或建議寫內容，六個月內即可被複製，且沒有理由離開既有 suite。[Ahrefs](https://ahrefs.com/blog/new-features-may-2026/)、[Trustable Agent](https://www.trustablelabs.com/ai-agent)

**最小會改變 verdict 的新證據：**至少三名非熟人、屬於同一窄 ICP 的使用者，在看到同一份報告後，願意提供資料並在第二輪仍使用「Explain → Decide → Verify」流程；其中至少兩人選擇一個行動、留到下一輪看驗證結果。這仍不等於已驗證付費，但足以把「Agent 是否有工作流價值」從假設提升為初步成立。

### 本次檢查的點子論點

> 對於 **管理多個網站、需要定期向客戶或團隊說明 AI 搜尋變化的獨立 SEO/GEO 顧問與小型 in-house SEO/growth 團隊** `[假設：非官方確認 ICP]`，當 **例行監測出現提及、引用、競品或 Google 訊號變化** 時，他們需要完成 **判斷哪一個變化值得查、該採取什麼行動、日後是否有變化**；目前使用 **SEO/GEO dashboard、GSC／GA4、試算表與泛用聊天工具**，但要自行拼接資料、解釋不確定性並留存決策原因。本產品透過 **Project workspace、受限工具的 evidence-first Agent、可重跑 GeoBooks 與決策歷史**，提供 **可引用證據的優先行動與下輪驗證**，未來按 **活躍 Project／監測額度** 收費 `[假設：尚未確認付款者與收費]`。

範圍刻意排除：自動寫文、自動改站、自動發布、宣稱 AI 提及造成轉換。它保留 GeoCheck 已確認的研究／產品邊界：Agent 可以提出診斷與待確認行動，但不把推論升格為因果或代替人執行。

## B. Evidence ledger

| ID | 主張 | 證據摘要 | 類型 | 支持／反駁 | 可信度 | 來源與日期 |
|---|---|---|---|---|---|---|
| E1 | GeoCheck 有可供 Agent 使用的可追溯資料基底 | 現行單站使用4個非品牌題目；保留答案採用、可驗證第一方引用、provider、有效分母與`unknown` | F：repo 現況 | 支持技術起點；不足以支持多輪商業決策 | 高 | [CURRENT_STATE](../CURRENT_STATE.md)，2026-09-06 |
| E2 | 純 dashboard 的商業需求尚未被證明 | charter 明確記載產品使用者與商業模式未驗證、尚無第一手訪談 | F：repo 決策／現況 | 反駁直接投入完整 SaaS | 高 | [PROJECT_CHARTER](../PROJECT_CHARTER.md)，目前版本 |
| E3 | Ploy 的互動模型可作為產品結構參考 | Ploybooks 把已成功的對話流程泛化為可重跑、可排程、可觸發的 workflow，並要求先 review | F：官方產品文件 | 支持 Workspace + Agent + playbook 的交互模式；不證明客戶需要 GeoCheck | 中 | [Ploybooks](https://docs.ploy.ai/ploybooks)，本次讀取 2026-09-07 |
| E4 | dashboard＋workspace-aware Agent 已非獨特能力 | Ask Ahrefs 公開說明其 Agent 讀目前頁面與整個 workspace，跑 API／工具／filter 來比較競品或解釋 mention spike | F：官方產品公告 | 強反證：Agent chat layer 容易被既有 suite 吸收 | 高 | [Ahrefs](https://ahrefs.com/blog/new-features-may-2026/)，2026-06-26 |
| E5 | 直接競品已賣 data-grounded Agent 與任務 | Trustable 宣稱 Agent 載入掃描、歷史、prompt response與benchmark，建立 dashboard 任務；Starter £49 起 | F：供應商自述／pricing | 反駁「證據型 Agent」本身是空白；不驗證其成效或客戶數 | 中 | [Agent](https://www.trustablelabs.com/ai-agent)、[pricing](https://www.trustablelabs.com/pricing)，本次讀取 2026-09-07 |
| E6 | Agentic SEO workspace 也已有供給 | Visibility.so 宣稱 agents 可研究、寫作、優化、建連結，並把機會派給人或 agent | F：供應商自述 | 反駁多 Agent／任務系統作為 moat；亦顯示市場噪音很高 | 中 | [Visibility.so](https://visibility.so/pricing/)，本次讀取 2026-09-07 |
| E7 | 「agent跑30日並生成actions」不是新定位 | aeoh 官網列出 AI Visibility Agents、Recommendation Funnels，以及相對 dashboard 的 action-path 訴求 | F：供應商自述 | 反駁「從監測走向 action」本身的獨特性 | 中 | [aeoh](https://www.aeoh.ai/en)，本次讀取 2026-09-07 |
| E8 | 顧問／實作者仍需拼接資料與人工判讀 | 公開討論中的一名實作者描述把 API、server log、GA/GSC 接進自選 Agent；另一討論提及月報與持續 API 維護 | T：社群陳述 | 可作 workflow 假說來源；不代表市場比例或付款意願 | 低 | [r/aeo](https://www.reddit.com/r/aeo/comments/1vkyqx9/what_are_you_actually_using_to_audit_your_aeoai/)、[r/AI Search Optimization](https://www.reddit.com/r/AI_SearchOptimization/comments/1ujyt7z/is_anyone_here_actually_running_an_ai/)，2026-08／07 |
| E9 | GSC 整合有技術與成本約束 | Google 對 Search Analytics 與 URL Inspection 設有 per-site／user／project 的 quota，且重複查詢會增加負載 | F：官方 API 文件 | 支持先做有限、快取、事件驅動工具；反駁無限 Agent 探索 | 高 | [Google API limits](https://developers.google.com/webmaster-tools/limits?hl=en)，更新 2025-08-28 |
| E10 | 既有競品與大型 suite 已有基本 monitoring、agent或整合能力 | 上一輪研究確認 Ahrefs demand proxy、Otterly GSC prompt workflow、Peec agency workflow與Hogiah在地入口 | F/O：官方資料與DOM觀察 | 支持市場與替代存在；反駁「功能少所以藍海」 | 中 | [前一輪來源登錄](competitive-falsification-2026-09-07/SOURCES.md)，2026-09-07 |

## C. Reality check

### 已知與未知

**事實：**目前 GeoCheck 可安全地量測有限題組下的 AI 答案採用與第一方來源證據，並保留不確定性。**未知：**目標使用者是否需要一個 Agent 協助判斷、這件事多久發生一次、誰為它付費、以及使用者是否會在第二輪回來驗證結果。

**最強需求訊號：**已有多個付費或公開產品把 AI monitoring、資料整合與行動建議包裝成產品，且存在實作者手動把資料放進 Agent 的 workaround（E4–E8）。這支持「工作可能存在」。

**最強反證：**沒有任何與 GeoCheck ICP 對應的付款、重複使用或資料授權證據；而 Ahrefs／Trustable／Visibility.so 已直接處理「dashboard + Agent + action」的敘事。這代表工作存在，並不代表 GeoCheck 有需求缺口。

### 誰、在何時、為何要用？

候選首批客群不是「所有商家」。最窄且較能理解資料限制的是 **一人到小團隊的 SEO/GEO 顧問，或管理少量網站的 in-house SEO/growth generalist**。這是產品假設，與 charter 中尚未驗證的「中小企業主本人」並存，不能偷偷取代正式 ICP。

合理 trigger 是：月度客戶報告、重要頁面上線／下線、品牌被競品取代、引用來源變化、或 GSC／GA4 出現異常。此類 trigger 多半是**每週或每月**，而非每天；daily scan 不等於 daily value。若使用者只有一次性好奇心，直接用免費 audit、Ahrefs、ChatGPT＋表格已足夠。

核心 JTBD 不是「看更多 AI 分數」，而是：

> 「在我需要向客戶或團隊交代時，幫我用可信證據判斷本期該處理什麼、哪些訊號先別理，並保存理由讓下次能回看。」

這個 JTBD 的可觀察痛點仍待取得。不得由創辦人的困擾或競品文案推定客戶有同等急迫性。

## D. Competitive landscape

| 替代方案 | 類型 | 客群／JTBD | 價格或成本 | 優勢 | 弱點／限制 | 對本點子的含義 |
|---|---|---|---|---|---|---|
| Ahrefs Brand Radar + Ask Ahrefs | 直接／suite bundle | 在既有 SEO workspace 裡查 AI visibility、比較競品、解釋變化 | Brand Radar與既有方案分層；詳細見前輪研究 | 資料、suite、API、workspace Agent、distribution | 對小台灣網站的語境與可審核行動適配未證 | GeoCheck不能以「Agent讀dashboard」競爭；須贏在窄決策的證據紀律 |
| Trustable | 直接 | 掃描、歷史趨勢、Agent建議、任務與優化 | 供應商頁顯示 free／£49／£199／£499 | 直接說 data-grounded Agent、任務、監測與多平台 | 成效、資料與所有「industry leading」主張未獨立驗證 | 產品敘事高度重疊；避免複製其單一複合分數與自動優化承諾 |
| aeoh | 直接 | 把 customer prompts 的觀察轉成 actions／recommendation path | 本次未確認價格 | 以 30-day visibility agent 和 action path 作定位 | 功能細節、使用行為、付款U | 「不是dashboard、而是action」已有人說；GeoCheck要提出更窄、更可檢查的差異 |
| Visibility.so | 鄰近 direct | SEO 專案管理，把機會分配給人與 agents | 官網 early-access 顯示年繳折後$83/月起 | 任務、agent、project管理、AI visibility合併 | 廣泛而複雜，可能不適合只想解讀少量證據的使用者 | GeoCheck不該搶全套 agent team；可把「少而可信」變成優勢 |
| Ploy | 鄰近模式／平台 | Workspace中以 Agent 執行網站、分析、整合與排程工作 | 本次未確認可比 pricing | 對話→已驗證流程→可排程 Ploybook 的交互模型 | 做的是整體 marketing OS，不是 AI visibility measurement | 借結構，不借廣度：GeoBook應先只讀、可重跑、有人審核 |
| Otterly／Peec／Hogiah | 直接 monitoring／agency workflow | prompt sourcing、追蹤、報告、內容或 agency交付 | 已在前輪確認多種月費／額度 | 現成監控與GSC／agency流程 | Agent決策歷史／方法可追溯的深度不一，非已證明缺口 | 可當資料來源／替代品；不要重建全套引擎與內容供給 |
| ChatGPT／Claude + spreadsheet + API／MCP | 手動／間接 | 將既有匯出資料交給泛用 Agent 解釋 | 帳號、API與人工時間 | 幾乎零遷移、使用者已有習慣 | context遺失、證據與版本難治理、難自動驗證 | GeoCheck必須讓資料可信、可回跑、可審核，而非只比聊天品質 |
| GSC／GA4 | 平台／第一方資料 | 搜尋和網站事件解讀 | 標準版／API通常免費但有設定與quota成本 | 第一方網站與Google資料 | 不包含完整跨平台AI prompt或答案證據 | 應成為輸入與驗證，不是要取代的競品 |
| 不作為 | 最強替代 | 等月報、看自然流量、偶爾手查AI | 零工具費 | 不改流程、沒有誤判風險 | 可能錯過變化，但後果未量化 | 若不處理六個月也沒有可感代價，訂閱不成立 |

**真正競爭基準：**不是另一套 AI dashboard，而是「既有資料上的泛用 Agent 是否已經足夠」。GeoCheck 的可能 wedge 只能是：**有限而嚴格的 evidence graph，讓 Agent 不可任意擴寫、必須引用 observation、必須說明分母與`unknown`、並把建議綁定後續驗證。**這目前是設計假說，不是已證實 10 倍優勢。

## E. Commercial engine

| 項目 | 判斷 |
|---|---|
| Customer / user | 候選為獨立顧問與小型 in-house SEO/growth；正式 ICP未確認。使用者、champion、付款者可能同一人，也可能分開。 |
| Pain | I：手動拼資料、月報解釋與判斷雜訊可能耗時；未有第一方工時或錯失成本。 |
| Frequency | I：事件／週／月較合理；沒有證據支持每日登入或每日Agent對話。 |
| Willingness to pay | U：已有類別價格，不代表為Agent另付費。Agent token/訊息數不是客戶想買的價值單位。 |
| Switching cost | 初期低：若只有chat與圖表，匯出即可搬走。只有決策歷史、已批准的規則、報告鏈與團隊流程被反覆使用後才可能提高。 |
| Distribution | 現況低證據。自媒體可做self-serve入口，但尚未證實可帶來合格Project或資料授權；不能把內容發布數視為acquisition。 |
| Acquisition | 最可行假設是網址免費診斷→單一Agent任務preview→自願提交資料／試用Project；不是enterprise sales。該漏斗仍待測。 |
| Retention | 只有「重要變化→Agent解釋→決策→下次驗證」反覆成立才有；單次scan或無變化通知都不足。 |
| Expansion | 先從一Project的歷史與GeoBooks擴到多Project／團隊review；先驗證單一Project留存，否則multi-client只是表面擴張。 |

**建議的未來收費單位 H：**每個「活躍、可重跑的 Project」，包含有限監測與證據儲存；跨額度的觀測成本才作透明加購。不要按 Agent 對話句數收費，因為那會抑制用戶追問、也把價值誤導成文字量。這不是定價決策，需先有使用與成本資料。

**單位經濟 U：**目前無 token、Perplexity／其他 provider、儲存、人工review、support或獲客成本。尤其Agent會增加反覆查詢與長context成本；GSC也有query／inspection quota。因此任何月費或毛利宣稱都為時過早。[Google limits](https://developers.google.com/webmaster-tools/limits?hl=en)

## F. Strategy and adoption

### JTBD 的切換力量

- **現況推力：**使用者必須在多個 dashboard、報表和AI答案間自己拼解釋；此為合理假說，尚未由訪談確認。
- **新解法拉力：**一句問話得到附證據、附信心、附下一輪驗證的決策卡；只有當它少於現有手工時間且更可信時才成立。
- **焦慮：**Agent可能錯判、誤把隨機答案當趨勢、暴露 GSC／GA4 資料，或產生又一個難看的聊天記錄。
- **慣性：**既有Ahrefs／Semrush／GA4／ChatGPT已被採用；使用者不會為了新介面遷移。

### Rumelt kernel

**Diagnosis：**目前AI visibility工具大量供給監測分數與泛用建議，但使用者若要從變化走到「有根據的處理或不處理」仍要手動整合證據；同時產品同質化使功能追趕沒有防禦性。

**Guiding policy：**不建全能 growth Agent，不以自動內容執行取勝。集中把 GeoCheck 變成一個可審計的「Evidence → Diagnose → Decide → Verify」workspace。

**Coherent actions：**

1. 將 Project 的實體、官方網域、query version、location、engine、run、raw answer、citation、validity、分母與決策建立成可追溯關係。
2. 只提供有固定輸入／輸出的初始 GeoBooks，例如「解釋本期變化」、「調查一個引用流失」、「準備月度review」；每次輸出都帶 evidence ID、信心與`unknown`。
3. 使用者可接受、拒絕、延後或標記需要人工確認；Agent不得直接發文、改網站或把相關說成因果。
4. 僅在有 material change 或排定review時提醒；「沒有變化」保持安靜，避免用scan頻率製造使用感。
5. 在取得外部重複使用前，維持一個主Agent與受限工具；不要把 capabilities 誤建成多Agent組織。

### ERRC

| Eliminate | Reduce | Raise | Create |
|---|---|---|---|
| 無來源的一般SEO建議、對外自動發布 | 無意義每日提醒、引擎／分數競賽、聊天幻覺空間 | 原始證據、entity對齊、版本、信心與人工否決權 | Evidence graph、Decision ledger、GeoBooks、驗證等待中的行動狀態 |

### Beachhead 與採用順序

首批應選會理解資料限制、願意容忍不完整Agent的 power user，而不是需要「保證帶來客戶」的商家：一人顧問或兼管SEO的growth generalist。這仍是待測的 beachhead。主流客戶需要的 whole product 包含多引擎穩定性、可被信任的輸入、權限治理、GSC／GA4連線、team workflow、支援與可靠成效證明；不應先做。

## G. Second-order scenarios

| 情境 | 可能性 | 影響 | 領先指標 | 可逆性 | 對策 |
|---|---|---|---|---|---|
| Ahrefs／Semrush把Agent做深並bundle | 高 | 高：一般Agent完全商品化 | 既有suite推出workspace agent或action playbook | 低 | 不以Agent UI為賣點；綁定版本化證據、決策記憶與窄GeoBook |
| 平台限制AI觀測或提高成本 | 中高 | 高：監測資料缺口、毛利不穩 | platform登入／政策／API／價格改動、failed run升高 | 中 | provider abstraction、raw run記錄、低頻／事件式排程、`unknown`而非假資料 |
| 模型成本降到很低 | 高 | 中：聊天與摘要更商品化 | 競品免費Agent、open source templates擴散 | 低 | 投資在資料治理與workflow，不是prompt花樣 |
| Agent做出錯誤或越權建議 | 中 | 高：研究信任與品牌受損 | citation mismatch、使用者否決率、unsupported claim QA失敗 | 高 | read-only先行、每張卡列證據／信心／限制、人工批准、可回退規則版本 |
| 成功後吸引多產業／多客戶需求 | 中 | 中高：範圍爆炸、support與資料品質崩壞 | 客製GeoBook、資料schema例外、人工處理時間上升 | 中 | 將vertical／client context隔離；只有重複驗證的case才升級為通用規則 |
| 指標被當目標（Goodhart） | 中 | 高：使用者追分卻傷害研究有效度 | 選題被改得只求高分、忽略有效分母與unknown | 中 | Agent輸出原始觀測與限制；行動成功不以單一score定義 |

## H. Adversarial partner memo

### Feature、product、business，還是公司？

**今天：feature。**把Agent加在現有單站 dashboard 旁邊，只是摘要功能。**可能成為product：**當 Project 包含證據、待辦、決策、驗證與可重跑 playbook，且使用者持續回來處理同一個工作。**business：未知。**需要證明付款、低成本獲客與留存。**venture-scale company：目前沒有證據。**不要因 agentic narrative 跳過這四個層級。

### 10倍優勢與護城河檢驗

目前沒有10倍優勢。相對 dashboard 的可能優勢是「少掉人工解釋時間且不犧牲可追溯性」，但尚未量測。相對泛用 Agent 的可能優勢是資料結構、受限工具與工作流，而不是模型能力。

- **Network effect：不成立。**一名客戶的使用不會直接提升其他客戶的價值。
- **Data flywheel：尚未成立。**只有在使用者明確授權、資料可合法留存、資料確實改善特定GeoBook、改善導致更多使用，且競品難取得等價資料時才成立。研究樣本與客戶資料不可默認混用。
- **Switching cost：早期不成立。**聊天紀錄與圖表可匯出。決策歷史若進入例行review才有弱到中等的workflow cost。
- **Distribution advantage：不成立。**創辦人目前沒有既有BD或渠道。自媒體是待測的acquisition hypothesis，不是moat。
- **Workflow ownership：候選。**若每個月客戶都在GeoCheck決定、批准、追蹤與回顧，才可能成為 system of record。

**最大回報情境 H：**用一個可公開檢查的、證據型 Agent 取得小型SEO實作者信任，成為其AI搜尋review的system of record，再從單Project延伸到多client／team review。

**即使產品做得很好仍會失敗的原因：**現有suite把相同問題解到「足夠好」，而目標客戶不認為每月AI visibility變化足以改變任何高價值決策。這會使產品停留在好看的報告層，沒有留存。

## I. Evidence-adjusted scorecard

| 維度 | 分數 0–5 | 證據強度 | 判斷理由 |
|---|---:|---|---|
| 痛點與急迫性 | 2 | 低 | 工作合理，但沒有目標客群的最近一次行為／成本。 |
| 問題頻率與價值實現 | 2 | 低 | 月／週review合理，daily value未證。 |
| 已證實需求／付款意願 | 1 | 低 | 類別有競品付費頁，GeoCheck與此ICP無付款或承諾。 |
| 替代方案缺口與差異化 | 1 | 中 | 已有workspace Agent與AI visibility agent；窄evidence-first決策流程尚未證。 |
| Distribution與acquisition | 1 | 低 | 自媒體是計畫，沒有qualified inbound或可重複通路。 |
| Retention與expansion | 2 | 低 | 決策／驗證迴圈有理，尚無第二輪行為。 |
| 單位經濟／交付可行性 | 2 | 低 | 有限工具、快取可控；Agent和provider成本／support未知。 |
| 平台、法規與依賴風險 | 2 | 中 | API quota與平台變動真實存在；可透過限制、快取與abstain緩解，不能消除。 |
| 護城河與可防禦性 | 1 | 中 | Agent UI可複製；未形成獨特資料、通路或workflow ownership。 |
| 團隊／執行適配 | 3 | 中 | 現有研究治理與證據產品適配強；創辦人明言BD／人脈弱，需驗證自媒體self-serve。 |

**Hard constraints：**需求／付款、distribution與moat均低分，不能由技術適配的3分沖淡。最低成本的下一步是驗證「外部使用者是否完成一個decision loop」，不是建完整Agent platform。

## J. Fatal assumptions

| 排名 | 假設 | 類型 | 錯誤時的影響 | 現有證據 | 可推翻的觀察 |
|---:|---|---|---|---|---|
| 1 | 目標使用者會因有證據的Agent判斷而回來做第二輪決策 | 需求／留存 | 沒有訂閱理由，Agent只是一次性摘要 | 合理敘事，無第一方行為 | 外部使用者看報告後不點「追查／加入待辦／下輪驗證」，或不回來看第二輪 |
| 2 | GeoCheck的Agent會比Ahrefs／泛用聊天工具更可信、更省時 | 差異化 | 直接被bundle與手工替代 | 現有`unknown`／citation規則是技術優勢候選 | 盲測中使用者無法分辨或偏好既有工具，且無法指出GeoCheck多帶來什麼決策 |
| 3 | 自媒體可觸達有資料權限的目標用戶，且能形成self-serve acquisition | 通路 | 沒BD時無法取得驗證或收入 | 尚無渠道證據 | 足夠合格流量下，沒有外部Project、資料授權或回訪；或進來者都是學生／同行而非使用者 |
| 4 | 有限題組和觀測資料足以支撐高品質Agent行動卡 | 產品／技術 | Agent只能產泛用內容，或過度解讀雜訊 | 現有四題與`unknown`治理；跨時間／跨engine穩定性未完全證 | 固定測試集裡出現無證據建議、誤讀unknown，或高比例只能回答「資料不足」 |
| 5 | provider與GSC資料可在可接受成本／權限下維持 | 平台／成本 | 無法按承諾監測或毛利失控 | Google quota已知；其他provider依賴未完全驗證 | 成本超過預設上限、連續失敗、或平台條款改變導致資料不可取 |

## K. Validation plan

下列門檻為**本次驗證建議**，不是正式產品KPI或已批准商業策略。它們刻意不要求主動BD；可透過公開案例、內容CTA與self-serve頁面取得訊號。每一項都先於完整Agent平台開發。

### 實驗 1：Evidence Agent 的正確性閘門

- **假設：**在固定輸入下，Agent 能產出只依賴已存證據、正確處理`unknown`、且可追溯的決策卡。
- **風險類型：**產品／技術／信任。
- **受眾與樣本：**20個內部 fixture；至少涵蓋有效提及、未提及、官方引用、第三方引用、provider失敗、少於2個有效run、相同題目跨run變化。這不測市場。
- **最小測試：**先用受限工具與固定輸出格式跑「解釋變化」；每一個事實句都必須指向 evidence ID，建議必須標信心與限制。
- **承諾等級：**內部評測，沒有外部需求含義。
- **時限與成本上限：**5天；新增模型／provider成本不超過 TWD 500。
- **成功門檻：**20個 case 均不把`unknown`當0、不杜撰來源；至少18個case的人為判定結果與預設答案一致。通過後才做外部preview。
- **失敗門檻：**任一無證據事實、錯誤處理`unknown`，或超過2個重大判斷錯誤；先縮工具／schema，不新增聊天功能。
- **防假陽性：**fixture需包含刻意相似但不相同的品牌／來源，以及可用資料不足的case；不只測容易成功的正例。
- **決策更新：**通過只提高技術可行性分，不提高需求或moat分。

### 實驗 2：公開案例的「問下一步」行為

- **假設：**看過可追溯案例的目標使用者，會主動要求Agent解釋自己的變化，而不是只看一次分數。
- **風險類型：**需求／通路。
- **受眾與樣本：**同一語言市場的獨立SEO／內容實作者；發布3個公開、可檢查案例與一個只讀preview，明示適用對象與限制。排除朋友、學生作為成功樣本。
- **最小測試：**CTA不是「加入waitlist」，而是「提交網址後選一個具體問題：為何被忽略？哪個引用變了？這期先查什麼？」預覽只回答一個 bounded task，不建帳號系統。
- **承諾等級：**外部使用者完成網址提交＋選擇問題；更強訊號是下載／查看證據與再次開啟同一Project。
- **時限與成本上限：**14天；內容製作與付費分發為0，provider成本不超過 TWD 1,000。
- **成功門檻：**在至少150個符合目標內容的落地頁 sessions 中，取得8個非熟人外部提交，其中3個完成「查看證據或建立下輪提醒」行為。
- **失敗門檻：**符合流量門檻後少於2個外部提交；停止把Agent建置當主問題，先改內容受眾／問題入口。若流量本身不足，僅判定distribution未驗證，不判定需求不存在。
- **防假陽性：**分開記錄raw impressions、landing sessions、提交、查看證據、回訪；不把按讚、同行稱讚或機器流量計入。
- **決策更新：**成功提高需求／distribution至初步成立；仍不等於WTP。

### 實驗 3：30日 Decision Loop 預售

- **假設：**有一部分使用者願意為「一Project、固定監測、兩次Agent decision review」付出金錢或至少提供高成本資料承諾。
- **風險類型：**付款／留存／資料權限。
- **受眾與樣本：**實驗2中自行完成preview的外部使用者；不主動向不相關受眾推銷。範圍是30天、單一Project、read-only，清楚說明不是成效保證。
- **最小測試：**提供兩種等價承諾：固定價格的可退款預售，或授權上傳最小GSC CSV並選擇一項待驗證決策。實驗價格需在上線前凍結；它是需求測試，不是正式定價建議。
- **承諾等級：**付款最高；資料授權＋設定下一輪回看次之；email waitlist不計入。
- **時限與成本上限：**21天；最多服務3個Project；總provider成本不超過 TWD 2,000，人工時間每Project不超過2小時。
- **成功門檻：**至少2個付費預售，或1個付費預售＋2個資料授權者在第二輪回來檢視同一個決策。通過後才考慮最小Project workspace。
- **失敗門檻：**有至少8個qualified preview使用者後，沒有付款也沒有第二輪資料承諾；停止「Agent monitor訂閱」假設，保留一次性研究／portfolio用途。
- **防假陽性：**退款條件與範圍公開；不把創辦人手工額外服務、朋友折扣或免費試用算作產品需求；記錄每個拒絕理由。
- **決策更新：**通過才把商業化／retention從1–2提升為3的候選；仍需更多cohort才能稱有條件投入。

## L. Final recommendation

**現在不要把 roadmap 寫成「做一個 Ploy for GEO」。**那會把產品做成昂貴的橫向 growth OS，而Ploy、Ahrefs與各種 agentic SEO 工具已經有更大資料、通路與功能面。

可以把 roadmap 改成一條狹窄、可驗證的產品假設：

> **GeoCheck 的 dashboard 是證據層；Geo Agent 是受限的決策層；GeoBooks 是經人驗證後才可重跑的工作流程；Decision ledger 使下一輪驗證有上下文。**

下一個 decision gate 不是「Agent聊得像不像人」，而是實驗1通過後，是否有外部使用者完成實驗2的具體追查行為；再看實驗3是否形成付款或第二輪資料承諾。若缺少這些行為，停止訂閱型 Agent Workspace 路線，保留 GeoCheck 作為研究與能力展示工具，這與既有「研究白皮書 > 能力展示 > 商業化」優先序一致。

### 建議記入學習紀錄的概念

Agent 化不是把 LLM 放到 dashboard 上。它要有：受限資料範圍、可檢查工具行為、固定輸出結構、人工批准權、可重跑流程與結果回查。缺少其中任一項時，多半只是對報表的文字摘要；有了它們，也仍需外部使用與付款證據才可能成為產品或護城河。
