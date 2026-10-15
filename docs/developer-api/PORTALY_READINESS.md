# Platform Portaly 送審準備與儲值點數

查核日期：2026-10-15（Asia/Taipei）。狀態：儲值與條款四頁已部署並驗證正式站（2026-10-15）；**尚未註冊送審、寄信、上架或收款**，付款維持關閉。

金流改用 Portaly（真實引擎）取代 [ECPAY_READINESS.md](ECPAY_READINESS.md) 的綠界路線，決策見 `home/docs/DECISION_LOG.md` LSL-D-003。D-053 的個人申請、預付優先、未用可退、無效期政策沿用。

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

- [ ] 到 <https://portaly.cc/signup?registerType=payment> 註冊，Email 建議用與網站客服一致的 `zzz.lisheng@gmail.com`
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
> LS-Labs Platform｜zzz.lisheng@gmail.com

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
