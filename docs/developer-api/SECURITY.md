# B API：防濫用與資安設計

版本0.2｜2026-09-08｜全部為待實作設計及驗收要求，不是安全稽核通過聲明。已確認額度依 D-030；其餘參數為建議值，正式啟用前見 [HANDOFF](HANDOFF.md) 待決表。

## 1. 信任邊界

客戶程式與帳戶瀏覽器 → 公開API → B受信任編排／私有store → 隔離爬蟲及四家供應商。使用者prompt、網站內容、模型回答與citation URL一律不可信。授權、費用、工作狀態與網路權限由程式決定，不交給模型。

私有程式碼不隨SDK出貨，也不代表提示詞永遠不可被推測。system prompt不得含金鑰、其他租戶資料或帳務權限；維護可公開版本號／hash，內部模板另保存以供重播。沒有對外開源授權或目前repo可見性的查證，不能宣稱現有repo已私有。

## 2. 首版風險與控制對照

| 風險 | 設計控制 | 驗收例 |
|---|---|---|
| 多帳號刷免費、故意失敗取免費部分結果 | 信箱驗證、邀請制試營運建議、帳戶+IP風險、獨立attempt上限、全域成本預留 | 第4個同窗成功請求不能啟動；反覆失敗也不能無限打 |
| 猜ID／跨租戶讀取 | 每個job/result/evidence/key查詢都以tenant scope執行；未知與非己有ID一致404 | A公開report URL、B GET／DELETE、cache、下載皆不能讀別人資料 |
| 金鑰外洩／越權 | 高熵隨機key只顯示一次、server存安全hash、scope、撤銷／輪替；管理員MFA與獨立權限 | 撤銷立即阻止新工作；一般key不能probe、改額度、讀成本或管理員資料 |
| 重送／競態重複扣量 | 原子reservation、tenant-scoped idempotency、唯一結算事件、worker fencing | 最後1輪同時20個POST，只有1個獲預留；重複投遞不二次扣輪 |
| 惡意URL讀內網 | 嚴格URL parser、DNS與連線位址驗證、egress隔離 | localhost、私網、metadata、IPv6映射、重導向與DNS rebinding都被拒 |
| 網頁注入或模型輸出攻擊 | 指令/資料分離、無shell／任意tool、固定schema、HTML跳脫、citation連結安全 | 惡意頁要求洩密／改帳務無效；輸出script不執行 |
| 無上限長文／搜尋／重試／併發 | request、token、搜尋次數、deadline、attempt、queue、日成本上限 | 限額前置；超時後不再開新attempt，未知帳款不視為0 |

## 3. 不綁卡試用的具體控制（建議）

帳戶需驗證信箱才可產生活key；驗證token單次、短效且只存hash，重寄限流，登入與註冊錯誤不揭露帳戶是否存在。首批建議人工發邀請到經驗證帳戶，讓營運者已有資金後才開live入口；不依賴支付卡當身分證明。

帳戶是輪數限制主體，換key不能重置。IP與第一方風險cookie只作風險訊號：學校／宿舍共用IP不能直接當同一個人永久封鎖。不做侵入式裝置指紋；遇可疑流量加驗證或人工處理。機器客戶的每次API呼叫不塞瀏覽器CAPTCHA；挑戰只放在註冊／異常帳戶處置。

| 參數 | 建議初值 | 說明 |
|---|---|---|
| 免費active job | 每帳戶1個，queued+running合計 | 防同時用掉未結算的最後一輪 |
| 免費接受工作數 | 每配額窗最多6個，含最終失敗 | 成功仍只扣最多3輪；attempt gate是成本限制，不是偷偷扣額度 |
| 付費active job | 每帳戶2個 | 不因Premium多買輪數就承諾無限併發 |
| B全域執行／排隊 | 2個執行、20個排隊 | 需要實測再增加，queue滿回503及Retry-After |
| POST限流 | 免費2次/分鐘；付費6次/分鐘／帳戶 | 獨立於輪數；拒絕請求也要限流 |
| GET輪詢 | 帳戶60次/分鐘；建議客戶至少2秒一次且退避 | GET不扣輪，但不是無限流量 |
| provider attempts | 每家最多2次，首次含在內；最多8次／一輪 | 只重試可重試的429／暫時5xx，遵守Retry-After與剩餘預算 |
| 工作deadline | 接受後180秒 | 排隊與執行合計；lease續期不延長總deadline |
| 付費異常失敗 | 連續3輪最終失敗，冷卻10分鐘並分類 | 若是系統性故障停B admission，避免懲罰個別使用者 |

網路timeout且不知上游結果時標ambiguous；沒有供應商idempotency／查狀態能力則不盲目重發，將該輪終結failed並保留成本預留對帳。租戶刪除帳戶或試用到期不能消除成本紀錄，也不能重新領試用；反濫用最小紀錄的保存期限與告知另核准。

429回retry時間与quota/attempt/cooldown類型；供應商未就緒或全域成本暫停回503。對外不暴露安全判斷細節或金鑰錯誤原文。整站停服務期間不宣称永久保障每天都能用3輪，試用中斷如何補時需先有公開規則。

## 4. 成本限制是財務控制，不只是API限流

同時使用兩本帳：客戶輪數與GeoCheck真實支出。工作開始先原子預留1輪、保守的工作成本與容量；每個外部attempt先檢查剩餘成本。failed還回客戶輪數，但保留已花／未知的上游成本。故障重試、planner、爬蟲、probe都不可繞過帳本。

預算建議：live模式預設關閉；日／月全域成本預算未填則不接受live工作。可審閱的試營運建議為免費日額TWD 60、月額TWD 600、單job內部估算上限TWD 12；以上不是儲值或支出授權。到80%減少新試用啟用，到100%停止新免費工作；付費也必須有獨立全域現金預算，不能從免費池或A帳務自動挪用。

預算包含已結算、在途預留與ambiguous金額；不能等帳單回來才算。模型內部搜尋若無法硬限制次數，須使用保守最大估價與上游帳戶支出限制；兩者仍無法限制時不對公開流量啟用。TWD 4只是平均試算，不能當最大成本reservation。先核對帳戶可用額度與必要最小儲值，再提出小額支出計畫；不承諾未用餘額可退款。

## 5. URL、Prompt與輸出

候選輸入上限：JSON body 32 KiB、prompt 4,000字元、URL 2,048字元、單頁HTML解壓後2 MiB、擷取10秒、最多3次重導向；只接受http/https及80/443埠，拒絕userinfo、IP literal與非公開位址。只在需要時讀取一頁，不跟sitemap、全文citation、不啟動browser或Python fallback。

解析DNS後檢查所有A/AAAA，拒絕非global位址；實际連線固定到已驗證位址並保留正確TLS hostname驗證，每次redirect重新檢查。處理IPv4/IPv6、mapped address、特殊數字表記及metadata，禁止自動proxy環境繞過。egress層隔離crawler與雲端metadata／DB／宿主機。若HTTP client無法證明檢查與實際連線一致，就不啟用任意URL模式。[OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)提供應用與網路層防護依據；這些限制為本服務候選實作。

擷取容器沒有provider secrets、內網路由或使用者cookie；不要求用戶上傳session、登入資料、機密文件。模型只使用必要輸入；私有SQL、其他tenant內容、key、費用權限不放進prompt。模型不可自行追加工具、呼叫內部URL或執行程式。規則分類／模型guardrail可輔助，不可取代程式授權。[OWASP Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)描述直接與間接注入及資料外洩風險；本案採最小工具權限與輸出驗證。

source.url只作資料：限制scheme、長度與可見文字；展示時跳脫，外連noopener/noreferrer，不自動把上游文字渲染成HTML或執行Markdown內嵌程式。額度、provider成功及扣款欄位只由可信後端產生，忽略模型同名欄位。

## 6. 身分、資料隔離與保存

API key只放客戶後端，不放前端localStorage、網址或分析事件。帳戶瀏覽器使用Secure/HttpOnly/SameSite session cookie；狀態變更有CSRF控制；CORS只允許明確來源但不能當認證。管理員入口獨立權限、MFA與稽核紀錄，probe不在公開API。secret依環境分開、最小權限、可撤銷輪替，不寫repo、log、錯誤或測試fixture。

tenant_id從已驗證身分推導，拒絕客戶自行指定owner、role、credits、engine_profiles、provider base_url。DB查詢參數化，物件存取須再驗tenant，私有bucket無公開listing；下載若採短期簽名，限制本人、單一物件與效期。A公開report store永不存B結果；跨tenant快取初版禁用。GET只讀既有結果，fresh重跑需新job及額度。

| 資料 | 建議保存 | 刪除／存取 |
|---|---|---|
| 客戶可讀結果（問題、答案、citation、分析） | 期限待D-034欄位表確認 | tenant私有的結構化store；不可把完整結果寫進log或跨tenant cache |
| 原始輸入、HTML、provider原文／工具trace | 期限待D-034欄位表確認 | 加密傳輸／靜態加密，獨立私有object store，受限營運存取，使用者可提前刪除 |
| 安全事件 | 期限待D-034欄位表確認 | 遮罩／截短IP與敏感值；不記完整prompt／URL querystring |
| 最小成本／扣量／idempotency紀錄 | 覆蓋工作與重送期限；最終期限待確認 | 不含原文；財務／法定保存期須另外確認，不宣稱合規已完成 |

key輪替／撤銷只使舊憑證與其授權快取失效，不刪除帳戶結果或重置額度。帳戶／內容刪除才依核准政策清除對應內容與cache；B內容始終不公開。備份建議最長30天滾動，到期刪除可恢復副本，restore先套用deletion tombstone，防止刪除內容復活。備份還原須演練且不能還原已花輪數造成重複使用。若為追蹤濫用保留最小hash紀錄，需明定目的、期限及申訴管道。

**保存政策尚有阻塞，不能直接實作上表：** D-034已確認要以內容類型與處理方式為先，但尚未定期限。P5需建立欄位級保存表，至少分開客戶可讀結果、使用者input、擷取HTML、provider原文／tool trace、citation、partial_results、帳務metadata與安全log，列出每類的主存放位置、加密、tenant讀取權、期限、提前刪除與備份淘汰。刪除必須涵蓋物件、快取與衍生副本；ledger不得藏原文。另分清線上刪除與備份最終淘汰日期，不能把204宣稱成全部備份立即抹除。

依D-035，雛型只有獨立D1的結果層：可持久化的是經大小限制的客戶結果JSON；HTML、完整上游原文、trace與cookie不落盤。結果本身仍可能含使用者問題、模型答案與引用，必須以tenant scope讀寫、不可進一般log或A的公開store。D1結果層不是raw evidence archive，因此雛型不能承諾可完整重播、稽核每一個上游細節或恢復已被捨棄的原文。

上線告知資料會傳至四家供應商；provider保留、訓練使用、跨境處理與可接受用途需按實際帳戶文件逐家查證。未核對不得承諾零保留或不訓練；機密或敏感資料暫不納入首版用途。合法儲存／轉供應商／對外回傳引用及搜尋內容的條款亦為人工上線審核事項。

## 7. 營運控制與事故處理

只設必要的成本／錯誤／安全紀錄與停機開關，不建客戶Monitoring產品。關鍵事件：配額拒絕、ambiguous attempt、queue到期、持久化失敗、provider熔斷、授權失敗、key撤銷。事件用request/job ID串接，log不含秘密與完整內容。

開關至少分B admission、B workers、free admission、各provider readiness；一家未就緒即停止新四家工作，不能悄悄以三家成功。停B不關A。上游異常時先停止新工作、保存已完成部分、按規則釋放客戶輪數、對帳未知成本，再受控恢复；避免自動probe造成費用風暴。

事故流程：凍結B新請求→撤銷受影響key／隔離資料→保留最小證據→判定影響tenant／成本→依適用通知義務與核准文案告知→完成重播與還原測試後恢復。不能刪帳本掩蓋差異。

上線前須指定實際事故負責人、可聯絡管道、值守時段與還原目標；目前不承諾24小時客服或SLA。還原時先維持B關閉，對帳備份後新增的扣量、在途成本、撤銷與刪除紀錄，完成前不接受新工作。只有備份檔存在不算還原驗收通過。預算同樣須跨worker原子預留；跨日／月的在途工作不得因重置計數而消失，實際超出估價或無法對帳時停止新admission，不把差額追扣客戶。

測試先用 mock HTTP 與受控 DNS，不掃描真實第三方內網。2026-09-09 已盤點並將既有 A provider-test、search-context、rate-limit-state 改為強制 admin token、禁止快取與跨站 CORS；這只修補可達性，不取代流量、執行時間與付費第三方呼叫的共同限額。資源限額依據 [OWASP API4:2023](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)。

來源取用日2026-09-08；上述OWASP來源用來支持威脅與控制類型，數值限制是本專案建議，並非OWASP認證或法規標準。
