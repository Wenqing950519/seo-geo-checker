# 政府來源取得與完整性紀錄

版本：v1.0  
查核日期：2026-07-18  
用途：2026 台北市信義區餐飲 AI 搜尋能見度研究 Stage 2

## 可用主來源

- 資料集：衛生福利部食品藥物管理署「食品業者登錄資料集」。
- 官方說明頁：https://data.gov.tw/dataset/8938
- 官方 JSON 端點：https://data.fda.gov.tw/data/opendata/export/97/json
- 官方 OpenAPI 規格端點：https://data.fda.gov.tw/data/dataset/oas/classification/8d4ca1bf-ae1d-4280-849e-2fa2947a9cb2
- 官方詮釋資料更新時間：2026-07-03 09:13；資料集更新頻率為每月。
- 本地壓縮檔：`food-business-registry-2026-07-18.json.zip`
- 壓縮檔大小：19,110,234 bytes
- 壓縮檔 SHA-256：`D530E024A26E9AD5B6A55B931BA4FF2716AAFFA65701D4C8767973BC6E3114D4`
- 解壓檔：`food-business-registry-json-2026-07-18/97_5.json`
- 解壓檔大小：190,217,905 bytes
- 解壓檔 SHA-256：`19D059158D5F8AE8C53A3DBC322FC0D6E6312145CE12756A26DEB56ED0E1DF2E`
- ZIP 檢查：通過；可列出並完整解壓 `97_5.json`。
- JSON 串流解析：824,696 筆，0 筆解析失敗。

## 信義區餐飲場所篩選

- 篩選規則：`業者地址` 符合「臺北市信義區」或「台北市信義區」，且 `登錄項目` 等於「餐飲場所」。
- 信義區全部登錄項目：10,550 筆。
- 信義區餐飲場所：3,723 筆。
- 不同食品業者登錄字號：3,723。
- 不同地址：2,721。
- 輸出：`research-output/tfda-xinyi-dining-2026-07-18/`。
- 篩選 JSONL SHA-256：`7CC392A1E4C10E5291C7AA4E91FE36712630A5E9D93DBA935108537E1166A93C`
- 篩選 CSV SHA-256：`2A240418FE7CD3109381846EB72C2EBA0950C430A3FA6D2AE2B559611FF88FB3`

此資料集證明登錄資料中存在指定名稱／地址／登錄項目的紀錄，不等同於研究日仍營業、提供內用，亦不能單憑登記名稱自動對應候選品牌。候選配對仍須用官方店頁、場域頁或近期訂位來源人工確認。

## 失敗與不可用來源

| 檔案 | 大小 | SHA-256 | 狀態與處理 |
|---|---:|---|---|
| `food-business-registry-2026-07-18.incomplete.zip` | 3,391,488 | `E2FE28240681DD584C874AEBFAB98131FCBBBE78AD5DAC45A35413CDCE7DE243` | CSV 端點第一次下載；缺少 ZIP 中央目錄，不使用。 |
| `food-business-registry-2026-07-18.incomplete-curl.zip` | 15,482,880 | `9A3F7DC1008CB9513B59D4DBC287E8A514E7CC127F7F31DEF1070B61026B2F47` | CSV 端點第二次下載；壓縮資料於 deflate 串流中斷，不使用。 |
| `gcis-restaurant-business-registration-2026-07-18.incomplete.csv` | 9,908,230 | `544A7B2A8483F6CF87AEF285EE785856B2CF5ADA72B6F6CC8EFAD21DF380DE7C` | 經濟部餐廳餐館商業登記備援下載中途斷線；官方伺服器不支援 Range 續傳，不使用。 |

## OpenAPI 規格

- 本地檔：`food-openapi.json`
- SHA-256：`DB613C80F1DE3BDD86B98E37BB19C7F5E4F8A89FC644B604EBD45C9D370C2F44`
- 規格確認資料集 8938 的 JSON、CSV、XML 路徑皆為完整檔案下載，未提供查詢參數；因此本研究先封存完整 JSON，再以固定規則建立衍生樣本框。
