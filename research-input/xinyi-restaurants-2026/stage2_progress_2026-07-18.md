# Stage 2 來源蒐集進度快照

版本：stage2-progress-v1.0  
日期：2026-07-18  
狀態：來源蒐集已形成可人工審核資料；正式樣本與 AI 量測尚未凍結

## 已完成

1. 方案 A 已登錄為作者核准方案：110 家店點樣本＋去重網站子樣本。
2. API 使用量規格已建立；正式 Perplexity／Gemini 批次會輸出逐事件與彙總 Token 檔。
3. TFDA「食品業者登錄資料集」JSON 完整快照已下載、驗證、解壓與雜湊。
4. 824,696 筆 TFDA 紀錄以串流方式讀取，0 筆解析失敗；依地址與登錄項目篩出信義區餐飲場所 3,723 筆。
5. 140 家候選已完成多輪來源發現、直接頁面文字核對、地址線索擷取與 TFDA 名稱／地址交叉。
6. 已建立 140 家人工審核表：`candidate_evidence_review_v0.3.csv`。
7. 已建立網站根網域候選表：50 家候選店對應 46 個去重根網域；其中 7 個為共用品牌或集團根網域，尚待範圍決定。

## 140 家人工審核狀態

| 審核狀態 | 家數 | 含義 |
|---|---:|---|
| ready_for_manual_eligibility_review | 41 | 有較高階頁面、地址／政府交叉及內用語句線索，可優先人工確認。 |
| higher_tier_page_observed_address_crosscheck_needed | 18 | 有品牌、場域或訂位頁，但地址或政府交叉仍不足。 |
| government_address_crosscheck_lead | 29 | 第三方頁地址可與 TFDA 地址交叉，但店家身分與現況仍需人工核對。 |
| government_name_lead_needs_store_identity_review | 5 | TFDA 登記名稱高度相似，但分店身分未定。 |
| third_party_page_lead_only | 36 | 目前只有第三方原頁線索，不足以判定正式資格。 |
| source_gap | 11 | 未取得足夠原頁來源；不等同不存在、歇業或不合格。 |

所有狀態都維持 `eligibility_decision = pending_human_review`。本表不可直接視為最終 110 家樣本。

## 政府資料快照

- 有效 JSON ZIP SHA-256：`D530E024A26E9AD5B6A55B931BA4FF2716AAFFA65701D4C8767973BC6E3114D4`
- 解壓 JSON SHA-256：`19D059158D5F8AE8C53A3DBC322FC0D6E6312145CE12756A26DEB56ED0E1DF2E`
- 信義區餐飲 JSONL SHA-256：`7CC392A1E4C10E5291C7AA4E91FE36712630A5E9D93DBA935108537E1166A93C`
- 信義區餐飲 CSV SHA-256：`2A240418FE7CD3109381846EB72C2EBA0950C430A3FA6D2AE2B559611FF88FB3`
- 完整來源、失敗下載與不可用檔案紀錄：`research-sources/tfda/source_acquisition_log.md`。

## 網站子樣本候選

- 直接品牌文字確認：50 家候選店。
- 去重根網域：46。
- 共用根網域：7。
- 候選表 SHA-256：`86ABE7E0F4ACD34AF24346874567E7C986D64C8347C2CA8FFECC1F6CFD041827`。
- 若 46 個根網域全數通過作者範圍與店點資格審核，暫估正式呼叫為 Perplexity 138 次、Gemini 46 次；此數字尚未凍結，不得執行。

## API 與 Token 使用量

- 研究來源蒐集 Brave 記錄嘗試：514；最新成功候選查詢：408；失敗／重試事件：106。
- Brave 不提供 token 欄位，故 input／output／total token 均記為 `null`，不自行估算。
- 公開頁面直接驗證／細節擷取為 HTTP 讀取，AI API 呼叫為 0。
- Perplexity 正式請求：0。
- Gemini 正式請求：0。
- AI input／output／total tokens：0。
- 完整使用量檔與 SHA-256：`api_usage_research_snapshot_2026-07-18.json`。

正式 AI 批次將使用固定 run ID，另輸出 `api-usage-events.jsonl`、`api-usage-summary.json`，並在 `methodology.json` 留存事件檔 SHA-256。Token 只用於成本與可復現性揭露，不進入能見度分數。

## 已修正的資料品質問題

- `xnfood.com.tw` 經直接頁面查核為食記網站，不是餐飲集團官網；8 筆候選已全部降級，不納入網站根網域候選。
- TFDA CSV 端點兩次下載皆為不完整 ZIP，已改用完整有效的官方 JSON 端點；損毀檔保留並明確標示 `incomplete`，不參與分析。
- 經濟部餐廳餐館商業登記備援檔下載中斷且不支援續傳，保留為 `incomplete`，不參與分析。

## 下一個治理閘門

依 `GEO_RESEARCH.md.docx`，AI 不得自行決定最終樣本。進入正式 Perplexity／Gemini 量測前，作者或指定人工審核者須：

1. 在 `candidate_evidence_review_v0.3.csv` 填寫 140 家的 `eligibility_decision`、`exclusion_reason_code` 與 `reviewer`。
2. 決定 7 個共用品牌／集團根網域是否納入網站子樣本，以及其可描述的實體範圍。
3. 核准最終 110 家店點、備援名單與去重網站輸入清單。
4. 凍結正式蒐集起訖日、網站輸入 SHA-256、Perplexity／Gemini 精確呼叫數與硬上限。

完成上述核准前，禁止開始付費 AI 證據批次，也不得形成餐廳能見度、排名、平台差異或優化建議結論。
