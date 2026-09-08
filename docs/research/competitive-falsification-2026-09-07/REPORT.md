# GeoCheck 競品證偽與產品路線建議

**建議：Modify。保留研究與可追溯觀測能力，暫不以「Reality-Calibrated AI Visibility」作為已成立的差異化，也不直接開發通用訂閱監測 SaaS。先驗證一個窄任務：讓同一垂直領域的小型 SEO/GEO 顧問，替既有客戶交付可採取行動、可回查證據的月度檢討。**這是研究建議，未更改 ICP、評分框架、商業模式或正式 roadmap 決策。

研究日：2026-09-07。現況依 repo 文件；價格／公開功能依當日官網 DOM 與官方文件。附件 brief 是待檢驗主張，不是證據。尚無客戶訪談、實際付費試用、留存 cohort 或匿名 API 請求攔截紀錄。技術階段僅完成公開頁面部分，詳細界線見 [TECHNICAL.md](TECHNICAL.md)。

## 交付索引

| 文件 | 內容 |
|---|---|
| [CARDS.md](CARDS.md) | 12個具名競品與5類替代方案的基礎卡、網站訊息架構／schema抽查 |
| [MATRIX.md](MATRIX.md)／[matrix.json](matrix.json) | GeoCheck＋17個競爭／替代對象，完整17維度；含可借鑒／避坑 |
| [TECHNICAL.md](TECHNICAL.md) | Hogiah、Peec、Profound公開DOM、路由、表單狀態及未知項 |
| [SOURCES.md](SOURCES.md) | 來源ID、方法、衝突、skill核查與證據限制 |

標記：**O**本次直接觀察，**F**官方規格／自述，**T**第三方，**I**推論，**H**待驗證假設，**U**未知。官方宣稱不是獨立成效驗證。後文「未找到」僅限本次檢查來源，不能推論全市場不存在。

## 決策的三條關鍵證據

| 證據 | 反駁什麼 | 對GeoCheck的影響 |
|---|---|---|
| **F：Ahrefs已將Google需求乘平台usage ratio，並用在AI impressions／SoV；ratio參考整體AI referral相對Google organic traffic。** [方法](https://help.ahrefs.com/en/articles/16755865-what-is-ai-adjusted-volume-and-how-is-it-calculated)、[metrics](https://help.ahrefs.com/en/articles/15501968-ai-visibility-metrics) | 「需求加權＋真實流量校準」沒人做 | 不能以這串字當護城河；必須明確說明超越其proxy的方法與客戶價值 |
| **O/F：Otterly有GSC→prompt工作流和agency交付；Mantis月費20美元起；Ahrefs既有付費suite含少量custom checks。** [Otterly工作流](https://otterly.ai/blog/otterlyai-public-api-claude-skill-launch/)、[Mantis](https://www.aeomantis.com/zh-Hant/pricing)、[Ahrefs](https://ahrefs.com/brand-radar) | 「補帳號＋project＋daily monitor＋建議就是機會」 | 入門監測、GSC匯入、agency報表與產文都已有替代；價低不代表品質一樣，但足以壓低基礎功能定價 |
| **F：Peec公司公告自報2025年11月已達$4M+ ARR、1,300+品牌／agency。** [公告](https://peec.ai/blog/we-raised-21m-series-a-to-help-brands-win-in-ai-search) | 「工具多但也許根本沒人付錢」 | 支持類別已有付費市場，故不建議直接Stop；不證明台灣小顧問會為GeoCheck續費，也不是審計或當前ARR |

最強反方是：大公司已有資料、功能與通路，小工具很容易被bundle。但它尚未證明每個垂直客戶的交付難題都已解決；因此是**有條件Modify，不是證明有勝率後的Continue**。若後述付費與資料實驗失敗，就停止通用訂閱方向；不要以「再補功能」延長未被證明的假設。

## 先校正產品基準與問題定義

**F，repo基準 G01/G02：**GeoCheck現行是四個非品牌 discovery prompts 的單次觀測，AI Trust Index為65%回答採用、35%可驗證第一方引用，未知結果有分母／有效樣本規則及版本化快取。這不是完整市場share、全使用者曝光估計或轉換歸因。Project→Data→Monitor→Action、免費帳號、GSC onboarding和新ICP是本次提案背景，不能算既有能力。

**I：**「輸入網址先Snapshot」可作獲客入口，但尚不能證明它會吸引願意買月報的顧問；它也可能主要帶來一次性好奇流量。先量測從snapshot到真實顧問工作交付的轉換，比把免費帳號插入漏斗更值得優先驗證。Hogiah已有免費網址入口，Peec／Profound則先走帳號入口，沒有證據顯示一種onboarding普遍更好。[Hogiah](https://www.hogiah.com/zh-TW)、[Peec app](https://app.peec.ai/)、[Profound welcome](https://app.tryprofound.com/welcome)

研究白皮書與產品評分仍須分開；建議的新需求資料不能直接寫入既有65/35公式，也不能用未review的產業清單發表排名。這遵循repo目前研究治理，不是本報告替使用者採納新評分定義。

## Q1：Demand-weighted AI Visibility已經有人做嗎？

**有。至少Ahrefs是直接反例；其他多家已處理選題需求，但不能全部說成同一種加權。** [A02](https://help.ahrefs.com/en/articles/16755865-what-is-ai-adjusted-volume-and-how-is-it-calculated)、[P01](https://peec.ai/pricing)、[O03](https://help.otterly.ai/relevant-prompts)、[R02](https://www.tryprofound.com/features/prompt-volumes)

| 層次 | 已取得的證據 | 不應混淆的事 |
|---|---|---|
| demand-informed選題 | Peec的volume級距／intent；Otterly intent volume；Profound panel需求；Semrush topic research | 題目旁顯示volume，不等於aggregate有加權 |
| demand-weighted指標 | Ahrefs AI-adjusted volume→estimated impressions／AI SoV | Google搜尋需求與平台ratio不是觀察到的每一個AI prompt曝光 |
| 個站outcome-calibrated estimate | 本次未找到公開、可複核、個站轉換校準公式與out-of-sample誤差 | 把GA4放在旁邊、做相關性圖或命名ROI，都不足以成立 |

**I：**GeoCheck若只把4題換成20題、加GSC impressions，再乘intent權重，最多是在已有路線上做實作。可能是好用功能，卻不是新類別。反過來，Ahrefs的proxy也不等於正確：平台整體平均無法保證台灣某垂直、特定意圖的相對需求。這是可以測試的模型限制，不是已證明GeoCheck會更準。

## Q2：GSC→Prompt→Intent→Visibility的路徑已存在嗎？

**存在公開工作流；未取得證據證明整條路徑必然是原生整合、數值意圖加權，或能讓客戶付更高價格。**Otterly官方提供GSC檔案與Claude／API協作：優先query、分類intent、改寫prompt，再查已追蹤題目的能見度。另有CSV匯入教學。[O02](https://otterly.ai/blog/otterlyai-public-api-claude-skill-launch/)、[O04](https://otterly.ai/blog/analyze-real-prompts-google-search-console/)

**I：**它反駁了「用GSC產prompt就是差異化」，但仍留下資料品質問題：GSC只看得到自己曾有曝光的範圍，會漏掉尚未進入的需求；Google用語不等於ChatGPT多輪對話；長query不保證來自AI。Otterly舊文章把長query近似成AI prompt的說法不能當ground truth。本次以Google官方新報表規格校正，而非照抄競品教學。[Google](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports?hl=en)

**U，premium WTP：**較高方案有更多功能與配額，無法辨識客戶究竟為哪一項加價。Peec ARR證明有人付產品費，不證明為intent weighting單獨付費。要成立差異化，需用同資料、同價格比較兩種交付，觀察買方決策與續費，而不是詢問「你覺得加權重要嗎」。

## Q3：有用AI referral／conversion校準visibility的競品嗎？

**部分有，必須分層回答。**Ahrefs已用跨站整體traffic ratio調整估計；Profound、Peec、Similarweb等提供或研究traffic與visibility的關係。**但本次未確認有哪一家公開驗證「個別客戶visibility→conversion」的可泛化模型。** [A02](https://help.ahrefs.com/en/articles/16755865-what-is-ai-adjusted-volume-and-how-is-it-calculated)、[R04](https://www.tryprofound.com/blog/the-ai-mention-effect)、[V02](https://www.similarweb.com/blog/updates/announcements/introducing-ai-brand-visibility/)

**F：**Google已公布Search／Discover的生成式AI曝光報表，8月31日更新註明全球推出；它提供Google第一方AI impressions，所以「完全沒有ground truth」已太強。但公告列的維度沒有完整AI query、跨平台對話或conversion。GA4也已列AI Assistant channel，不能再把所有AI流量都假設成一般Referral。[N01](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports?hl=en)、[N02](https://support.google.com/analytics/answer/9756891?hl=en)

| 可能障礙 | 本次證據與判斷 | 對設計的影響 |
|---|---|---|
| 看不到未點擊曝光 | F：GA4測網站事件；Profound研究需額外連接對話panel與瀏覽資料 | 沒有網站到訪，不等於沒有品牌曝光或影響 |
| source／attribution缺漏 | F：direct與不同scope的歸因規則；I：各平台／裝置缺漏不一 | 只能校準「可觀測到訪」，不能自稱全部AI觸達 |
| 小站轉換樣本少 | H：目標顧問的客戶是否足量未知 | 先查可用量再承諾預測；不能用平滑後的小數掩飾資料不足 |
| prompt不代表真實人口 | F：Scrunch自己將panel定位為方向性；Ahrefs使用proxy | 需求權重需記來源、覆蓋、更新時間及未涵蓋比例 |
| 沒有商業需求／技術不可行 | U：本次無證據支持任一絕對答案 | 不應用「別人沒做」倒推出市場不在乎或自己找到藍海 |

Profound的AI Mention Effect是較強的觀察性證據：有對話／瀏覽配對與placebo檢查，但並非隨機分派曝光，也不是購買實驗。文中UTM辨識比例不能改寫成「GA4漏掉同等比例」，因為GA4還可用referrer。這份研究支持慎重處理歸因，不支持GeoCheck直接宣稱因果ROI。[研究](https://www.tryprofound.com/blog/the-ai-mention-effect)

**建議術語 H：**試驗階段使用「以需求與可觀測成效輔助決策」，並分別展示sampled visibility、Google AI impressions、可識別AI sessions／key events。只有完成預先定義的留出驗證，才考慮用calibrated estimate；即使通過，也要說清楚校準的是哪一個outcome。

## Q4：Hogiah真正的優勢，以及不該跟什麼

**I：更值得警戒的是一條在地獲客與內容交付鏈，而非單純feature完整度；但目前沒有公開證據證明這條鏈已產生強留存。** [首頁](https://www.hogiah.com/zh-TW)、[方案](https://www.hogiah.com/zh-TW/plans)

| 面向 | 本次證據 | 判斷／未知 |
|---|---|---|
| founder／既有business | F：Leo Hu自述經營DearDear，曾帶20人技術團隊 | 能以真實營運場景示範是優勢候選；「曾帶20人」不是Hogiah現有20人工程團隊 |
| dataset／customer | F：官網展示自家品牌觀測數與提升 | 是供應商自述、單一自有案例；付費客戶數、資料代表性、第三方改善驗證U |
| distribution | O：LINE、academy、blog、產業頁、推薦佣金10–20% | 通路資產存在；CAC、渠道轉換及佣金方案實際貢獻U |
| Taiwan localization | O：繁中、台灣方案／地區、在地內容 | 對在地使用者減少摩擦；awoo／Mantis等也在服務繁中市場，非獨占 |
| pricing／retention mechanism | O：入門TWD1080、隔日監測、內容額度／報告；self-service均1domain | 定期產物可能形成使用理由；實際登入、續費、流失U；顧問多客戶方案是否合適待證 |

「Hogiah是GeoCheck SaaS完全體」**過度成立**。它已覆蓋大量原始構想，但GSC／Slack／Notion仍標coming soon，self-service是單domain，多客戶權限／white-label／API／SSO並未逐項驗證。另一方面，這些缺口也不能直接當成GeoCheck的市場空白，因為Peec與Otterly已有agency工作流。

**不應跟的方向 I：**不要比誰支援更多引擎、每月產更多文章、掃描更便宜，或用自己的單一案例宣稱普遍有效。GeoCheck有限人力也不適合複製整座在地行銷學院來正面爭奪通路。可借鑒的是「免費觀察如何接到下一件有價值的工作」及真實案例的可追溯呈現，而不是其未驗證成效數字。

## Q5：一至兩人的可行wedge是什麼？

**H：先做「一個垂直、少量既有顧問客戶的AI搜尋月度決策與驗收」，以服務驗證產品。**交付不是另一張score dashboard，而是回答：這期值得改哪個頁面／實體資訊？依據哪個需求與答案證據？做完什麼時候回看？沒有證據時，哪些工作應暫緩？這與目標顧問的客戶溝通任務相接，但需求仍須證明。

垂直領域不在本研究替使用者決定：優先選創辦人能接觸到至少數個顧問及合法授權資料的同類網站，而不是憑想像選餐飲／醫療。第一版接受CSV與既有tracker匯出，用少量、固定、可重現的sentinel prompts補缺口，人工review。一至兩人可以交付這個範圍；不代表已能規模化SaaS。

| 條件 | 為何可能成立 | 最強反證／失敗條件 |
|---|---|---|
| 不依賴龐大API預算 | H：主要整理授權的既有資料；限量補測 | 既有export不夠／品質差，需要大規模重跑時優勢消失 |
| 有明確價值 | H：縮短顧問報告與判斷時間，留下客戶可採用行動 | Otterly已有品牌化報告、Peec已有actions；若只美化摘要，一個feature patch即可取代 |
| 能累积優勢 | H：經允許保存同垂直的實體校正、需求分類、行動與後續結果 | 資料權利不足、客戶稀少、不反覆使用，或只有公開內容，就沒有moat |
| 不靠enterprise sales | H：直接接觸小顧問、按試點交付付費 | 顧問沒有權限／客戶不願分享資料；銷售與服務時間仍可能超過收入 |
| 能防feature patch | H：客戶關係＋持續review歷史＋特定領域品質控制共同形成切換成本 | 目前完全未成立；大廠agency channel加人工服務也能壓制 |

**判斷：目前沒有可被證明「競品不容易消除」的wedge。**上述是最可負擔的驗證候選，不是保證。研究方法公開不妨礙商業化，但公開方法本身不構成專有資產；私人客戶資料也不能因「建立moat」而未經同意再利用。

## 市場現實：存在市場，但留存理由尚未證明

**付費市場：有供應商收入自述支持，不只pricing頁。**Peec公告是本次較具體的收入證據；其他logo與testimonials最多支持有公開採用宣稱。未取得發票、audited revenue、淨收入留存或台灣買家調查，因此不能估TAM或GeoCheck可取得份額。[Peec公告](https://peec.ai/blog/we-raised-21m-series-a-to-help-brands-win-in-ai-search)

**階段 I：商業化已成立、功能快速擴張，基礎監測正面臨商品化；尚不足以宣稱整個市場已進入consolidation。**依據是收入自述、低價自助方案、開源替代與SEO suite內建。沒有同口徑歷年市場收入／市占，故「Rapid growth」只能作方向性分類，不報成已測量增長率；也沒有本次M&A／集中度證據支持整合期。[Mantis](https://www.aeomantis.com/zh-Hant/pricing)、[Ahrefs](https://ahrefs.com/brand-radar)、[Semrush](https://www.semrush.com/kb/1493-ai-visibility-toolkit)、[開源](https://github.com/aryamantodkar/oneglanse)

**Buyer I：SEO／內容行銷主管與agency owner最貼近公開方案與use cases；預算可能由SEO工具、研究／報表工時或顧問retainer移入。**尚未有採購訪談證明哪一種最大，不能把「可能的預算來源」寫成市場統計。Enterprise的品牌／情報部門與procurement是另一種銷售成本，不適合直接當學生創辦人的初期ICP。

**實際使用頻率 U：每日掃描不是每日使用。**Peec／Otterly daily、Hogiah隔日、Mantis跨weekly到daily只證明排程設計。報告閱讀、決策、內容修改、續費的頻率未取得。I：若顧問只在提案或每季稽核使用，按次服務可能比訂閱合理；若每月固定向客戶交付並回看行動，才有月度續費的機會。需用實際交付／採用／續費事件測，不以登入次數代替價值。[Peec](https://peec.ai/pricing)、[Otterly](https://help.otterly.ai/search-prompt-monitoring)

## 下一步三個實驗（建議門檻，尚未執行）

以下門檻是為限制投入所提的商業決策規則，不是已估算的統計power。不得把試點的正向相關直接發布為因果研究。

| 實驗 | 設計與主要觀察 | 通過／失敗與後續 |
|---|---|---|
| **E1：付費工作，而非功能訪談**，2–4週 | 接觸同一垂直8位合格顧問，要求回顧最近一次真實客戶月報。向有資料授權者提供相同範圍、固定價格的人工試點。價格由工時／直接成本與採購訪談決定，先凍結再提案；不先建帳號系統 | H門檻：至少3位實際付費，且確實提供資料／使用交付；只有稱讚、免費試用或「上線後再說」不算。無付費：停止SaaS建置，分析是問題／對象／價格哪個失敗 |
| **E2：加權是否改變有用決策**，4–8週 | 同一批資料產生未加權與需求輔助兩份排序，遮蔽名稱、交換呈現順序；顧問先選行動並記理由。記baseline與新流程工時、哪些行動被客戶採納；不要讓更漂亮版面混入效果 | H門檻：3個試點中至少2個反覆使用、報告工時中位數降30%、每client至少1項有證據支持的行動被採納，並有2位付第二期。否則不以加權作selling point；小樣本僅做產品判斷 |
| **E3：資料可校準性與預測增益**，8–12週，E1有資料才啟動 | 先查GSC新AI資料、GA4可識別AI events及時間覆蓋。凍結topic／prompt／模型版本，分開預測Google AI impressions或可識別AI sessions，不混成total reach。以時間留出，跨站資料夠再做site holdout；比較前期值、demand-only、未加權與加權。依資料量先定義誤差／power，禁止測後換目標 | 若樣本不足、主要值為缺漏、或沒有out-of-sample增益：不推出calibrated score。H投入門檻可設MAE改善≥10%且跨期間／站點方向穩定；不夠判斷時仍是U，不視為通過。不能由預測改善宣稱行動造成conversion |

試点投入建議 H：同時不超過3個顧問案；補測預算以`題數×引擎×執行次數×重複數×成功/失敗重試成本`實算並設上限，而非宣称API廉價。可先約束總觀測不超過每月600次，再依實際單價與訊號量決定是否更低；這個數量是成本護欄，不是足夠研究樣本的保證。不要為填quota而跑題。

## 六個月roadmap：只有過關才往下走

| 時間 | 交付與學到的事 | 進入下一步的門檻 |
|---|---|---|
| M1 | E1訪談／收費人工報告；建立來源／實體／題目版本與資料授權範圍 | 真實付費，不以註冊數替代 |
| M2 | E2兩種決策排序與第二次交付；計時、採用、續費 | 能反覆交付且節省時間；否則保留按次服務或停止 |
| M3 | 若通過，做最小Project＋匯入＋歷史報告；只自動化最耗時且重複的步驟 | 有可重複資料格式及客戶重用需求；不是先做完整OAuth／billing |
| M4–M5 | 跑E3；加入有限sentinel排程、變更提醒與行動驗收；有需求再逐一接GSC／GA4 | 對缺漏／低樣本可abstain；校準不通過仍可保留分開呈現的決策報告 |
| M6 | 檢查付費續訂、交付工時、直接毛利、獲客可重複性 | 有重複價值才轉窄SaaS；只有一次性價值走productized service；無付費／無成效則Stop該方向 |

建議未來onboarding H：網址snapshot→看到一個可核對的問題→選擇是否建立project保存→需要歷史資料時才授權匯入／連線。不要把「建立免費帳號→連GSC」當成已被證明的順序；E1/E2要觀察在哪一步產生價值與摩擦。這些建議需與現有白皮書優先級一起決策，不能默認把D-024改掉。

## 未來六個月絕對不要做（在上述門檻前）

1. **全引擎、全球prompt index、無限daily monitoring或自建consumer UI抓取基礎設施。**Ahrefs／Profound／開源已各自占有資料或成本路線；GeoCheck尚未證明多跑題能增值。
2. **Enterprise SSO、複雜API銷售、完整reseller／white-label平台、seat／credit混合計費。**先用簡單匯出交付驗證顧問需求；不以企業採購清單指揮開發。
3. **通用AI文章工廠、agent marketplace、全套SEO crawler。**Hogiah／Mantis／suite已有供給，與本次窄驗證不相干。
4. **單一「真實AI曝光／ROI」魔法分數及自動因果結論。**缺漏、分母、Google限定資料與小樣本尚未解決；不能把預測包裝成ground truth。
5. **跨所有產業的ranking portal與全功能dashboard。**可先完成既定研究，但不能把候選cohort當完整市場，也不要用漂亮圖表掩蓋未證明的付費工作。

## 如果我是競爭對手，六個月內如何讓GeoCheck失去購買理由？

**I／競爭情境，不是預測：**第一步把GSC匯入、intent tagging、少量監控與繁中報告放進既有方案，免費贈送給agency；這些元素已有公開實例，所以不需要從零發明。[Otterly](https://otterly.ai/blog/otterlyai-public-api-claude-skill-launch/)、[Ahrefs](https://ahrefs.com/brand-radar)

第二步用既有agency program／在地顧問關係提供模板、教育與轉售誘因，讓GeoCheck在功能比較之前就失去分銷入口。第三步複製其垂直report與「需求加權」文案，附上現成traffic資料；如果GeoCheck只有score與模板，使用者幾乎沒有切換理由。[Otterly agency方案](https://otterly.ai/pricing)、[Hogiah](https://www.hogiah.com/zh-TW)、[awoo](https://www.awoo.ai/zh-hant/geo-solution/)

防守也必須可證偽：客戶是否因累積的實體校正、被採用行動與review歷史而持續留下？若換到其他工具加一張表就能得到同等交付，則不存在足夠防禦性。不要把創辦人更努力或AI工具更便宜算成護城河。

## 對既有草稿與假設的更正

| 待更正說法 | 證據後的版本 |
|---|---|
| 競品只追自己輸入的prompt，沒有廣域／產業資料 | Ahrefs index、Profound panel、Otterly benchmark入口是反例；覆蓋品質仍需檢驗 |
| GSC看不到任何AI獨立資料 | 2026新生成式AI impressions公告已改變前提；不能推論有完整query與conversion |
| Hogiah全部功能已實現 | GSC等coming soon，多client／API未驗證；也不因此證明空白只剩GeoCheck |
| 規劃中的研究名單就是資料moat或市場全貌 | 計畫不是觀察；reviewed sample也不是完整population；商業再利用另需資料權利 |
| 研究方法對付費客戶零價值／一定有價值 | 兩種說法都缺WTP證據；E1/E2應判斷是否改善真實交付 |

這些修正未直接修改repo既有同日三份草稿，以避免把未採納研究意見當成正式方向。

## 本次完成、限制與建議學習紀錄

完成公開競品卡、18×17矩陣、五個核心問題、商業反證、條件式roadmap與三個實驗；沒有修改產品、評分或執行付費研究。API請求層仍未驗證；客戶採購、資料可得性、實際留存需人工／試點取得。

建議記入LEARNING_LOG的核心概念：**選題依據、加權指標、校準與因果歸因是四件不同的事；排程頻率也不是客戶使用頻率。**要證明新產品，比較的是它是否改善既有工作的結果，而非它是否能多做一張圖。本次僅提出此記錄建議，未自動改寫學習或決策紀錄。
