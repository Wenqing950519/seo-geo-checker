# Platform Portaly 送審準備與儲值點數

查核日期：2026-10-17（Asia/Taipei）。狀態：儲值與條款四頁已部署並驗證正式站（2026-10-15）；Test Key 串接已部署、方案已啟用並通過 callback 驗收（2026-10-17，見下方「Test 模式部署」）；觀測扣點程式已在 main，但 `DEVELOPER_API_BILLING` 未開啟。**正式收款維持關閉**（仍為 Test 金鑰）；金流審核與儲值商品接受條件尚未驗證。

金流改用 Portaly（真實引擎）取代 [ECPAY_READINESS.md](ECPAY_READINESS.md) 的綠界路線，決策見 `home/docs/DECISION_LOG.md` LSL-D-003。D-053 的個人申請、預付優先、未用可退、無效期政策沿用。

## Test API 初始設定（2026-10-16）

依工作區 `.agents/skills/portaly-payment/SKILL.md` v0.18.1 與隨附 `references/api-contract.md` 設定，使用本機 Test Key 呼叫 `https://portaly.ai`。`GET /api/creator-subscription/config` 與 `/plans` 均回傳 200；版本回報亦為 200。API Key 與 Callback Secret 僅放在受 Git 忽略保護的 `geocheck/.env`，不記錄內容。

- 商家：沿用「LS-Labs Platform」與既有 Logo，補上 `appBaseUrl: https://platform.lslabs.tw`，設定 `locale: zh-TW`。
- 方案：先查詢確認無既有方案，再建立「LS-Labs Platform 點數儲值」。方案 ID 為 `qywC12Oif0GAOlYbo8o9`，`merchantPlanId: lslabs-platform-credits`，`billingPeriod: one-time`、`pricingType: dynamic`、`currency: TWD`、`status: inactive`、`collectPhone: false`；已用單一方案 GET 讀回驗證，中文品名與描述正常。非機密方案 ID 另存本機 `PORTALY_PLAN_ID`。
- 動態金額：建立與讀回成功，確認 API 支援此方案類型，取代下方 2026-10-15「未見動態金額」的文件觀察。NT$100–10,000 與整數限制目前只寫入商品描述，尚須由未來建立 checkout session 的後端強制檢查，不能視為 Portaly 已替本案限制金額。
- 驗簽工具：`node .agents/skills/portaly-payment/scripts/check_callback_vectors.mjs --runtime webcrypto` 通過 7 組向量與反例。這只驗證 Skill 隨附 WebCrypto adapter；本案尚無 callback receiver，填入的 Callback Secret 尚未由真實回呼驗證。

商家設定與方案在 Test／Live 間共用，因此方案維持 `inactive`，尚未建立 checkout session、啟用方案或收款。點數帳本、結帳、callback、退款與對帳仍待另案實作；Portaly 是否接受本案儲值點數、交易上限及部分退款條件仍待書面答覆。

## Portaly 已查證事實

來源：[Portaly Payment](https://portaly.cc/payment)、[串接教學](https://portaly.cc/blog/portaly-payment-tutorial)（2026-10-05）、[收款前檢查清單](https://portaly.cc/blog/blog-portaly-payment-verification-checklist)（2026-10-05）、[使用條款](https://portaly.cc/terms)。2026-10-15 以瀏覽器讀取。

| 項目 | 內容 |
|---|---|
| 計費模式 | 只列 one-time、monthly、yearly 三種；未見動態金額或用量計費 |
| 串接方式 | 後端建立 checkout session → 導向 Portaly 結帳頁 → 收 callback 更新資料庫 |
| 金鑰 | `pcs_test_` 與 `pcs_live_` 開頭，各配一組 `PORTALY_CALLBACK_SECRET`；審核通過前只能取得 Test Key |
| 審核 | 人工審核 7–15 個工作天；商品要公開上架，品名、定價、描述完整；附可實際運作的產品網址；基本資料、身分證明、銀行帳戶要清楚正確 |
| 常見退件 | 「頁面內容或商品項目不完整」 |
| 手續費 | 基本方案月費 0、抽成 12%；頂級方案 NT$219／月、抽成 6% |
| 撥款 | 每月 15 日結算上月款項，15–20 日申請提領，25–30 日撥款 |
| 發票 | 使用條款寫明由真實引擎處理款項並開立發票給消費者 |
| 單筆上限 | 使用條款寫明會設定單筆交易金額上限，未公開數字 |
| **遞延性服務** | 使用條款寫明：非一次性給付或具遞延性的商品，若經判斷可能影響相對人權益重大，**保留終止部分權利**。儲值點數正是遞延性服務，必須在送審前取得書面確認 |
| 退款費用 | 爭議退款衍生的手續費由賣家負擔。本案退款政策「不扣退款費」，此成本由營運者吸收 |
| 客服 | 教學 FAQ 與頁尾為 `service@portaly.cc`；`/payment` 頁尾另列 `support@portaly.cc` |

## 本次已完成

Platform 四頁正本在 `apps/web/public/platform/`：

| 頁面 | 變更 |
|---|---|
| [pricing.html](../../apps/web/public/platform/pricing.html) | 改為「儲值與計費說明」：1 點＝NT$1；自訂金額儲值（單筆 NT$100–10,000，無固定方案、無加贈、無自動儲值）；四引擎全成扣 8 點、失敗不扣；計算範例、Portaly 結帳、發票、餘額查詢 |
| [terms.html](../../apps/web/public/platform/terms.html) | 新增 `#points` 點數規則：僅限本平台、不得轉讓、不得兌換現金、付費點數無使用期限、贈送點數另標期限且不退、扣點順序、停用返還、查詢、性質 |
| [refund.html](../../apps/web/public/platform/refund.html) | 改為付費點數退款：1 點退 NT$1、不扣手續費、計算範例（儲值 1,000、用 296、退 704）、十五日返還 |
| [privacy.html](../../apps/web/public/platform/privacy.html) | 新增 Portaly 付款資料處理揭露 |

四頁維持「尚未開放付款」、無購買表單或按鈕，符合 `PRODUCT.md` 第 4 條。`tests/platform-legal.test.mjs` 新增兩項測試鎖住方案與點數規則。

### 成本重估與定價（2026-10-15 使用者確認：8 點／次、自訂金額 NT$100–10,000，LSL-D-003）

資料：三次 20 輪受控 benchmark（`evidence/controlled-benchmark-*.jsonl`），每家最多 2 次搜尋、輸出上限 1,024（Claude 2,048）、不重試。2026-10-14 兩次是現行模型（gpt-6-luna、gemini-3.5-flash-lite、sonar、claude-haiku-5-5）。成本為官方牌價估算；Google 搜尋取「全部計費」上緣。算法：每輪四家 `provider_reported_usd`，沒有則 `estimated_max_usd`，加總後乘當次匯率。

| 每家平均（2026-10-14 v2） | USD／次 | 主要來源 |
|---|---:|---|
| OpenAI gpt-6-luna | 0.0215 | 搜尋 $0.010 × 2，token 約 $0.002 |
| Google gemini-3.5-flash-lite | 0.0286（上緣） | 搜尋 $0.014 × 2；共用每月 5,000 次免費額度內則接近 0 |
| Perplexity sonar | 0.0045 | 請求費 $0.005 為主 |
| Anthropic claude-haiku-5-5 | 0.0186 | token 與搜尋 |

| 指標 | 09-09（舊模型） | 10-14 v1 | 10-14 v2 |
|---|---:|---:|---:|
| 四家全成 | 20／20 | 17／20 | 17／20 |
| 每輪平均（TWD） | 2.67 | 2.33 | 2.35 |
| 每輪 P95／最高（TWD） | 3.49／3.69 | 2.87／2.87 | 2.91／3.43 |
| **每次成功觀測實付成本**（總花費 ÷ 成功輪） | 2.67 | 2.74 | **2.76** |

**判讀（Inference）**：

1. 成本約八成是搜尋固定費，不是 token。每次觀測成本由「每家搜尋次數上限」決定，與題目長短關係小，所以按「次」扣點比照 Anthropic 按 token 計價更貼近成本結構。
2. 失敗不扣點，把每次成功成本從 2.35 推高到 2.76（15% 失敗率）。Claude `citation_missing` 未解決前，這是持續成本。
3. 正式環境可能重試、客戶題目可能更長、匯率會動，另加 20% 緩衝：**一般估 TWD 3.3**；以最高單輪加失敗攤提：**最壞估 TWD 4.0**。
4. Google 免費額度若可用，每次約省 TWD 0.9；不列入定價。

**實收**：Portaly 基本方案抽 12%；保守假設售價內含 5% 營業稅也由實收負擔（待 Email 確認）。實收 ≈ 售價 × 0.88 ÷ 1.05 ≈ 售價 × 0.838。

| 每次扣點 | 實收（TWD） | 一般成本 3.3 下毛利 | 最壞成本 4.0 下毛利 |
|---:|---:|---:|---:|
| 6 點 | 5.03 | 34% | 20% |
| **8 點（已確認）** | **6.70** | **51%** | **40%** |
| 10 點 | 8.38 | 61% | 52% |

**採 8 點（NT$8）／次**：最壞情況仍約四成毛利，比先前草案 10 點便宜兩成。未含 Render 等固定主機費、客服時間，以及退款時可能拿不回的 Portaly 抽成；月營收超過約 NT$3,650 改頂級方案（6%）後，8 點實收約 7.16。

**儲值方式（參考 Anthropic Console）**：Anthropic 讓使用者自填金額買 credits，另有可選自動儲值（餘額低於門檻自動補到指定金額）；credits 一年到期、不可退款（[官方說明](https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-api-usage)，2026-10-15 讀取）。本案採自訂金額，但：

- 不做自動儲值：需綁卡扣不定金額，Portaly 只列單次與月／年訂閱，D-053 也定不自動儲值。
- 不採一年到期、不可退：Anthropic 對象是企業；本案個人賣家可能面對消費者，D-053 已確認無效期、未用可退。
- 單筆最低 NT$100：可做 12 次觀測，夠試用；更低時抽成與退款處理不划算。
- 單筆最高 NT$10,000：Portaly 單筆上限未公開，待 Email 確認後調整。
- **若 Portaly 不支援動態金額**：退回少數固定金額商品（例如 NT$100、500、2,000），頁面改為「選擇儲值金額」，規則不變。

## 人工步驟清單

### 1. 註冊 Portaly（使用者本人）

- [ ] 到 <https://portaly.cc/signup?registerType=payment> 註冊，Email 用網站公開客服信箱 `me@lslabs.tw`（Cloudflare 轉寄至主 Gmail）
- [ ] 身分證正反面（清晰、未遮擋、檔名可辨識）
- [ ] 本人同名新台幣銀行帳戶存摺封面
- [ ] 基本資料姓名、地址與網站「營運者與聯絡方式」一致（林立勝、新北市新莊區地址）
- [ ] 選方案：交易量小先用基本方案（0 月費、12%）；月營收超過約 NT$3,650 時頂級方案（NT$219＋6%）較划算

### 2. 先寄信確認，再上架送審

- [ ] 寄出下方 Email，等書面回覆
- [ ] 若 Portaly 回覆不接受儲值點數：**停止送審**，回來重新評估（改按量後付或換金流），不要以其他名目上架
- [ ] 若回覆有單筆上限、需履約保障或其他條件：記到本檔，再決定是否修改方案

### 3. 部署儲值方案頁（需使用者另行授權）

- [x] 定價已確認（8 點／次、自訂金額 NT$100–10,000，LSL-D-003）
- [x] 2026-10-15 已提交、推送並部署（見文末「正式發布與驗收」）；原步驟：授權後提交、推送並部署 Developer Worker（流程同 ECPAY_READINESS「正式發布與驗收」），驗證 `https://platform.lslabs.tw/pricing`、`/terms#points`、`/refund`、`/privacy` 免登入可讀

### 4. Portaly 後台上架商品（使用者本人）

Portaly 要求商品公開上架才能送審。依 Email 答覆選一種：

- **支援動態金額**：依 Portaly 指示建立一個 one-time 商品「LS-Labs Platform 點數儲值」，金額於結帳時帶入（NT$100–10,000）。
- **不支援**：建立三個 one-time 商品：儲值 NT$100（100 點）、NT$500（500 點）、NT$2,000（2,000 點），網站改為「選擇儲值金額」。

商品描述（共用）：

> 預付點數，1 點＝新台幣 1 元，用於 LS-Labs Platform 生成式搜尋回答與引用觀測 API。四個引擎全部完成扣 8 點，失敗不扣點。點數僅限本平台、不得轉讓或兌換現金；付費點數無使用期限，未使用可退款。規則：https://platform.lslabs.tw/terms#points

- [ ] 產品網址填 `https://platform.lslabs.tw/`，退款政策填 `https://platform.lslabs.tw/refund`
- [ ] 送出金流驗證；7–15 個工作天未回覆，寄 `service@portaly.cc`，標題「客服詢問」，附帳號網址、姓名、註冊 email、申請日期

### 5. 審核通過後（另案實作，未開始）

- 取得 `pcs_test_` Key 先跑 Test 模式；金鑰只放 Worker secret，不進 Git
- 實作點數帳本：checkout session 建單、callback 驗簽與冪等入帳、扣點、退款、餘額／明細查詢
- 現有 `developer-platform-store.js` 的配額不是點數帳本，不能直接當餘額
- Test 模式完整跑通前，網站不得移除「尚未開放付款」

## Email 草稿（尚未寄送）

**收件者**：service@portaly.cc
**主旨**：Portaly Payment 串接前詢問：API 服務儲值點數與動態金額

> Portaly 您好：
>
> 我是林立勝，正準備以個人身分申請 Portaly Payment，為自己營運的開發者 API 服務「LS-Labs Platform」（https://platform.lslabs.tw/）收款。送審前想先確認以下幾點，避免上架方式不符規定：
>
> 1. **儲值點數是否可上架**
>    我們規劃販售預付點數（1 點＝新台幣 1 元），使用者每完成一次 API 觀測扣 8 點，失敗不扣點。點數僅能用於本平台自己的服務，不可轉讓、不可兌換現金、不能支付其他商家；付費點數沒有使用期限，未使用的部分可隨時申請退款（按 1 點 1 元返還，不扣手續費）。
>    貴司使用條款提到具遞延性的商品可能受限，想確認這種「自家服務專用的預付點數」是否可以用 one-time 商品上架？是否需要提供履約保障或其他文件？
>
> 2. **動態金額**
>    我們希望讓使用者自訂儲值金額（新台幣整數，單筆 NT$100 至 NT$10,000），由我們的系統在建立 checkout session 時帶入金額，而不是事先建立每個金額的商品。請問 Portaly Payment 是否支援？若不支援，是否有建議做法（例如一個商品搭配購買數量）？
>
> 3. **單筆上限與退款**
>    請問單筆交易金額上限是多少，NT$10,000 是否可行？部分退款（例如儲值 NT$1,000、已使用 NT$296，退還 NT$704）能否透過後台或 API 辦理？退款時原交易的抽成是否一併退回？已開立的發票如何處理？
>
> 4. **發票與稅**
>    我目前沒有營業登記。由貴司開立發票給消費者時，網站上標示的價格應寫含稅價嗎？營業稅是否會從撥款中另外扣除？
>
> 5. **送審頁面**
>    審核通過前，網站的儲值說明頁會公開計價與條款，但標示「尚未開放付款」、不放購買按鈕。這樣是否符合送審要求，還是需要放上可連到 Portaly 商品頁的按鈕？
>
> 相關頁面：
> - 儲值與計費說明：https://platform.lslabs.tw/pricing
> - 點數規則：https://platform.lslabs.tw/terms#points
> - 退款政策：https://platform.lslabs.tw/refund
>
> 謝謝！
>
> 林立勝
> LS-Labs Platform｜me@lslabs.tw

信中三個網址已於 2026-10-15 部署，可直接寄出。

## 尚未驗證

- Portaly 是否接受儲值點數、動態金額、單筆上限、部分退款 API：待 Email 回覆
- Portaly callback 實際欄位：未取得文件，`privacy.html` 只寫「例如」
- 履約保障是否適用：ECPAY_READINESS 的法規分析仍適用，未取得主管機關或 Portaly 答覆
- 稅籍：月網路銷售額達 NT$5 萬須辦稅籍登記（財政部，114-01-01 起），與 Portaly 開發票是兩件事

## 正式發布與驗收（2026-10-15）

使用者授權「提交並部署 Platform 儲值與條款四頁，部署後驗證正式站」。geocheck 提交 `dead736` 只含四頁、`platform-legal` 測試與本檔等文件，其他未提交的 provider／benchmark 變更未納入。推送 origin/main 後由 Cloudflare Workers Builds 自動建置；新版本 `8c4a4f0a-0e12-4602-ab46-30716dfa3a02`（2026-10-15T03:31:56Z）為 100% 流量，前一版 `9bcdf5b5-3d9a-48d4-b5b2-0ce74a656468` 可供必要時回復。未修改 D1、secret 或環境變數，未開啟結帳。

驗收 15 項通過：四頁各含無斜線、尾斜線、`.html` 的 GET 200 且內文與 `dead736` 正本 SHA-256 一致、HEAD 200 無內文（12 項）；Platform 首頁、`/docs`、`/console` 200（3 項）。正式頁含「扣 8 點」「最低 NT$100」「最高 NT$10,000」「尚未開放付款」、條款含 `#points`「不得轉讓」「兌換現金」，無購買表單、舊 330 月費或藍新字樣。375px 手機寬度無水平溢出（scrollWidth 375，表格右緣 355）。部署前完整 geocheck `npm test` 與 home 124 項測試通過。

home 的 LSL-D-003 決策紀錄只在本機提交 `5ddc421`，未推送；使用者尚未提交的 LSL-D-002 草稿未納入。

## 公開聯絡信箱改為 me@lslabs.tw（2026-10-15）

使用者完成 `me@lslabs.tw` 收寄設定（`work/2026-10-15-email-setup/`），要求網站全面停用 `zzz.lisheng@gmail.com`。geocheck 公開頁共 18 處改為 `me@lslabs.tw`：Platform 四頁、Platform 首頁、Console（原 `dev@lslabs.tw` 未確認可收信，一併改）、GeoCheck 首頁與舊 pricing／terms／refund。home 主站原已使用 `me@lslabs.tw`。`platform-legal` 測試新增全站掃描，任何公開 HTML 出現舊信箱即失敗。寄給 Portaly 的信請從 `me@lslabs.tw` 寄出，或至少在信中留此地址；Gmail 寄件身分尚未加入 `me`，需用 Resend SMTP 設定。

## 信箱更換正式站驗收（2026-10-17）

提交 `25e2ca6` 推送 main 後由 Workers Builds 與 Pages 自動部署。2026-10-17 逐頁檢查 10 頁：Platform `/pricing`、`/terms`、`/privacy`、`/refund`、`/`、`/console`，GeoCheck `/`、`/pricing`、`/terms`、`/refund`，均 HTTP 200，舊信箱與 `dev@lslabs.tw` 出現 0 次，新信箱每頁 1–4 處。

## Test 模式串接（2026-10-17，分支 `platform/portaly-points`，未部署）

使用者選擇「先用 Test Key 開工」。實作在獨立 worktree 分支，未動另一工作階段尚未提交的 MCP 檔案。依 portaly-ai/portaly-skills `portaly-payment-integration` v0.15.0（commit `4c3ef19`）的 API 契約。

| 元件 | 位置 | 行為 |
|---|---|---|
| Portaly client | `services/api/payments/portaly-client.js` | 模式由金鑰前綴決定；方案於執行時讀取 `GET /plans?status=active`；建立 checkout session |
| Callback 驗簽 | `services/api/payments/portaly-callback-signature.js` | 移植官方 WebCrypto adapter（MIT），以官方 7 組 production-derived 向量驗證 |
| 點數帳本 | migration `0007_portaly_points.sql`、`services/api/storage/developer-points-d1-store.js` | 訂單、帳本、callback 事件三表；餘額＝帳本加總，依 test／live 分開 |
| 服務 | `services/api/application/developer-points-service.js` | 只提供 active、one-time、TWD 方案；動態方案強制 NT$100–10,000 整數；固定方案不傳自算金額 |
| 路由 | `developer-api-http.js`、`worker.js` | `GET /v1/console/points`、`GET /v1/console/points/plans`、`POST /v1/console/points/checkout`（需登入）；`POST /v1/payments/portaly/callback`（僅 `platform.lslabs.tw` HTTPS、64 KiB 上限） |
| Console | `developers-console.html` | 「點數儲值」區塊預設隱藏，API 可用才顯示；測試模式另標示；只導向 `https://portaly.ai/` |

入帳規則：簽章正確、時間戳 ±5 分鐘、header 事件與內文一致，且 callback 的金額、幣別、方案、模式都與本平台建立的訂單相符，才寫入一筆 `purchase`。同一 session 重送只入帳一次；不符者標為 `review` 不入帳；失敗事件標為 `failed`，之後的完成通知不會重新開啟訂單。瀏覽器返回頁不入帳。

開關：Worker 未設 `PORTALY_API_KEY`、`PORTALY_CALLBACK_SECRET` 時整個點數服務不存在（callback 回 503）；另需 `PORTALY_CHECKOUT_ENABLED=true` 才能讀方案與結帳。

驗證：新增 `tests/developer-points.test.js`（以 SQLite 模擬 D1，Portaly 為 stub）與 `tests/platform-points-http.test.mjs`；完整 `npm test` 通過，含 Worker 打包。另以本機 Test Key 唯讀呼叫真實 API：模式判定為 test，`status=active` 方案 0 個，全部方案只有停用中的動態方案 `qywC12Oif0GAOlYbo8o9`。未建立 checkout session、未啟用方案、未部署、未套用遠端 migration。

尚未完成：

- 觀測扣點（每次四引擎全成扣 8 點、失敗不扣）尚未接到工作結算；目前仍是原本的輪數配額。
- Portaly 發起的退款（`payment.refunded`）只會被忽略，尚未扣回點數。
- 端到端 Test 付款需要：啟用方案、遠端 D1 套用 migration 0007、Worker 設定三個 secret／變數並部署，再由使用者用結帳頁顯示的測試卡付款。

## Test 模式部署（2026-10-17）

使用者確認沿用已建好的動態金額方案（NT$100–10,000），不另建固定方案，並授權啟用方案、遠端套用 migration、設定 Worker secret 與部署。

| 步驟 | 結果 |
|---|---|
| 遠端 D1 | `geocheck-developer-api` 套用 `0007_portaly_points.sql`；讀回 `developer_point_orders`、`developer_point_ledger`、`developer_portaly_events` 三表存在 |
| Worker secret | `PORTALY_API_KEY`（`pcs_test_` 測試金鑰）、`PORTALY_CALLBACK_SECRET`、`PORTALY_CHECKOUT_ENABLED=true`，由本機 `.env` 以 stdin 上傳，未顯示內容 |
| 部署 | 分支提交 `3057247` fast-forward 推送 main，Workers Builds 版本 `92ec150b-7a28-43b6-a94c-5e994739d41a`（2026-10-17T05:48:31Z）100% 流量；secret 上傳產生的中間版本為 `b210a8d1`、`34a12a27` |
| Portaly 方案 | `qywC12Oif0GAOlYbo8o9` 以 `PUT /plans/{id}` 改為 `active`；讀回為 dynamic、one-time、TWD、`collectPhone: false` |

正式站驗收：未簽章 callback 回 401 `invalid_signature`；GET 回 405；`api.geocheck.lisheng.cv` 回 404；70 KB 內文回 413；未登入的 `/v1/console/points` 回 401；`/healthz` 為 ok；Console 頁含預設隱藏的 `points-panel`。以真實 callback secret 簽署一筆不存在 session（`smoke_unknown_20261017`）的完成事件，回 200 `unknown_session`，確認驗簽與 D1 寫入可用且不入帳。

另直接以 API 建立 NT$100 測試 session（`G8WXvjzp3XBMdVvIQxNi`，未付款、30 分鐘過期），確認 Portaly 接受動態金額。**Portaly 也接受 NT$99.5**，所以整數與 NT$100–10,000 限制只靠本平台後端把關（已有測試）。這兩筆 smoke session 沒有本平台訂單，若被付款只會記為 `unknown_session`。

尚未驗證：使用者登入 Console 後的儲值區塊顯示、透過本平台建立的 checkout、測試卡付款、真實 `checkout.completed` 回呼入帳與餘額顯示。方案在 Test／Live 共用，審核通過、換上 Live 金鑰前，正式付款不會發生；換金鑰前須先接上觀測扣點。

## 觀測扣點（2026-10-17，分支提交，未部署）

使用者決定：點數計費開啟後**全部改扣點、取消免費試用額度**（不再先用每天 3 輪）。以獨立開關 `DEVELOPER_API_BILLING=points` 啟用，與 `PORTALY_CHECKOUT_ENABLED`（開放儲值）分開；`wrangler.jsonc` 不設此變數，部署不會自動切換。

| 時點 | 帳本 |
|---|---|
| 受理觀測 | 同一個 D1 batch 內，餘額（該模式帳本加總）≥ 8 才建立工作，並寫入 `charge −8`（reference＝job_id）；不足回 402 `points_insufficient`，不建立工作 |
| 四引擎全成 | 保留扣點 |
| 部分引擎失敗、執行拋錯、租約逾時 | 工作轉為 `failed` 後寫入 `adjustment +8`；`UNIQUE(kind, reference)` 確保只退一次 |

點數模式不需要 Console 試用開通，也不建立配額視窗或保留；客戶受理總開關與供應商支出上限照常生效。測試點數只能付測試模式的觀測，反之亦然。只有 D1 store 支援；本機 SQLite store 遇到點數模式會拒絕啟動，避免在沒扣點的狀態下照跑。

順帶修正：D1 store 原本沒有匯出 `failJob`，服務在執行中拋錯時會呼叫失敗，工作只能等租約逾時才結束。已補上匯出，扣點測試覆蓋此路徑。

驗證：新增 `tests/developer-points-billing.test.js`（D1 以真實 SQLite 模擬）涵蓋：無試用開通即可扣點、冪等重送不重複扣、成功保留、不足拒絕且不建工作、部分失敗退回、`failJob` 與逾時退回且只退一次、test／live 分離、受理總開關、錯誤設定拒絕啟動。完整 `npm test` 通過。

尚未完成：

- Console 仍顯示試用輪數與「開通方案」視窗；點數模式下應改顯示點數餘額與扣點紀錄。
- `/v1/usage` 與 `/v1/console/usage` 在點數模式仍讀試用額度。
- 開啟 `DEVELOPER_API_BILLING=points` 後，沒有點數的帳戶（含受邀測試者）將無法建立觀測；目前正式站用的是 Test 金鑰，因此只有測試點數可用。
- 贈點活動頁（使用者 2026-10-17 提出）：已於分支 `platform/promo-points` 實作，見下節。

## 贈送點數活動（2026-10-17，分支 `platform/promo-points`，未部署）

依 `/terms#points` 既有規則：贈點在發放時標示使用期限、到期失效、不得退款；扣點先扣即將到期的贈點，再扣付費點數。

| 項目 | 位置 | 說明 |
|---|---|---|
| 資料表 | migration `0008_promotional_points.sql` | `developer_point_grants`（每筆領取一列，含 `remaining_points`、`expires_at`；`UNIQUE(tenant_id, mode, promotion_id)` 保證每帳戶每活動一次）與 `developer_point_grant_uses`（每個工作從每筆贈點扣了多少、是否已退回）。0007 未改 |
| 帳本語意 | `developer_point_ledger` | 仍只記付費點數，帳本加總＝可退款餘額；贈點不寫入帳本 |
| 受理扣點 | `developer-platform-d1-store.js` 的 `pointChargeStatements` | 同一 batch：付費＋未到期贈點 ≥ 8 才建工作；依 `expires_at` 先後逐筆扣贈點，不足部分才寫 `charge`（只記付費部分，為 0 時不寫） |
| 失敗退回 | `pointReleaseStatements` | 付費部分照舊寫 `adjustment`；贈點部分退回原贈點並標 `released_at`，只退一次。已到期的贈點退回後仍然失效 |
| 餘額 | `GET /v1/console/points` | `balance_points`＝付費＋未到期贈點；另有 `paid_points`、`promo_points`、`refundable_points`（只含付費）、`promo_grants`（標題、剩餘、到期日） |
| 活動設定 | Worker 變數 `DEVELOPER_POINT_PROMOTIONS`（JSON 陣列） | 每個活動：`id`、`title`、`points`、`starts_at`、`ends_at`（領取期間），到期用 `valid_days`（自領取起算）或 `points_expire_at`（固定日期），兩者都設取較早者；`capacity`（實際名額上限，依 test／live 分開計）可不設；`display_limit` 只是頁面顯示「限量 N 份」，不會擋領取。設定格式錯誤時記錄 `point_promotions_invalid` 並關閉所有活動，不影響其他功能。未設定＝沒有活動 |
| 領取 API | `GET /v1/console/points/promotions`、`POST /v1/console/points/promotions/{id}/claim` | 需 Console 管理 session；tenant 只取自 session。錯誤碼：`promotion_not_found` 404、`promotion_not_started`／`promotion_ended`／`promotion_full`／`promotion_already_claimed` 409 |
| 活動頁 | `apps/web/public/platform/promotions.html`，Worker 以 `/promotions` 提供 | `noindex,nofollow`，不加入 sitemap；Console 點數區塊有連結 |

使用者 2026-10-17 決定：贈點使用期限暫訂到 2027-01-31（台北時間）結束；名額不設上限，頁面寫「限量 100 份」。點數由 Agent 評估，**建議**如下，尚未寫入 `wrangler.jsonc`（寫入並合併 main 就等於開辦活動）：

```json
[{"id":"launch-2026","title":"上線體驗贈點","points":40,"points_expire_at":"2027-01-31T16:00:00Z","display_limit":100,"starts_at":"<開辦時間>","ends_at":"2026-12-31T16:00:00Z"}]
```

**建議 40 點的依據（Inference，來自上方成本重估）**：40 點＝5 次完整觀測，約一組題目跨四引擎試 5 題；低於最低儲值 NT$100（12 次），不會取代購買。成本以一般估 NT$3.3、最壞 NT$4.0／次計，每位領取者約 NT$17–20；100 人全用完約 NT$1,650–2,000。領取期間建議到 2026-12-31，讓最後領取的人仍有一個月可用。

**要注意**：

- 名額不設上限時，實際領取可能超過 100，「限量 100 份」就與實況不符。`GET /v1/console/points/promotions` 回傳 `claimed_count` 可隨時查；接近 100 時可改設 `capacity: 100`。
- 客戶端供應商支出上限由贈點觀測與付費觀測共用。原本每日 NT$60、每月 NT$600，100 人用完贈點約 NT$1,650 以上會先撞到月上限並擋到付費客戶（`cost_budget_exhausted`）。使用者 2026-10-17 同意調為**每日 NT$200、每月 NT$2,500**（`wrangler.jsonc`，本分支），合併 main 並部署後生效。內部通道上限（日 500／月 3,000）不變。
- 贈點只在 `DEVELOPER_API_BILLING=points` 開啟後才能用來付觀測；開啟後免費試用輪數同時取消。

驗證：新增 `tests/developer-points-promotions.test.js`（兩個 D1 store 共用真實 SQLite）：領取一次、重複領取 409（含並發）、資料庫唯一鍵、名額、未開始／已結束／不存在、設定驗證、先扣最早到期贈點再扣付費、失敗依來源退回且只退一次、到期不可用且不列入餘額、退款不含贈點、test／live 分離。`tests/platform-points-http.test.mjs` 加上路由（需 session、tenant 取自 session）、活動頁與 Console 區塊檢查。完整 `npm test` 通過。本機以 scratchpad 預覽伺服器（真實點數服務＋SQLite）確認活動頁可領取、重複領取被拒、Console 顯示付費／贈點與到期日。

部署前必須：

1. 遠端 D1 `geocheck-developer-api` 先套用 `0008_promotional_points.sql`，再讓程式進 main。未套用就部署，Console 點數查詢會因缺表失敗（點數區塊隱藏）。
2. `/terms#points` 第 4 點寫「本平台目前不發放免費或贈送點數」，開辦活動前需更新條款文字（本分支未改法律文字）。

## 事故：推送 main 覆蓋 MCP 研究通道（2026-10-17，已修復）

**原因**：MCP 研究通道（LSL-D-004）與 10/16 provider 修補是直接用 wrangler 從工作樹部署（Worker `31584707`），程式從未進入 main。本分支 `3057247` 推上 main 時，Workers Builds 以 main 建置並部署 `92ec150b`（05:48:31Z），`/mcp` 自此回 404，Grok Bot 研究通道中斷約 17 分鐘（至 06:05:10Z）。

**修復**（使用者指示「先嘗試修復，不行再回滾」）：從本機保存的 `31584707` 部署 source map（`tmp/provider-response-repair/worker.mjs.map`）逐字取回第一方模組。與 main 實際差異只有 5 個檔案（MCP 改動與 10/16 修補），加上新增的 `developer-mcp-research.js`、`research-mcp.mjs`、migration `0006`（遠端早已套用）與 MCP 相依套件，提交為 `33fe5e3`（分支 `restore/mcp-31584707`），再合併進點數分支（`d30eaf0`）。worker 與 D1 store 的三處衝突都是雙方各自新增，全部保留。MCP 既有的兩組測試（研究服務、HTTP／協定／Worker 路由）在合併後通過，並加入 `npm test`。推送 main 後 Workers Builds 部署 `24953694-0f2b-44aa-ac8b-600cefb22cfe`（06:05:10Z）。

**驗收**：匿名 `/mcp` 回 401（研究憑證）；以研究 token 唯讀檢查 initialize、`tools/list`（`create_measurement`、`get_measurement`、`get_usage`）、`get_usage` 均 200，歷史 succeeded 9／failed 9 與事故前一致；未提交量測。Portaly callback 未簽章 401、GET 405；未登入點數端點 401；`/healthz` ok；Platform 七頁與 GeoCheck 首頁 200；首頁顯示模型仍為 `claude-haiku-4.5`，未帶上 LSL-D-002 的 Haiku 5.5。未回滾。

**之後必須遵守**：main 現在就是正式 Worker 的原始碼。任何推送都會觸發 Workers Builds 部署 main，所以不要再從工作樹直接部署 Platform Worker；變更先進 main。主 checkout 裡 MCP 工作階段的未提交檔案與 main 內容重疊，提交前要先與 main 合併。
