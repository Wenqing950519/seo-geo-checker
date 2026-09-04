# Cohort registry 規格

檔案：`candidate_cohort_registry_v1.csv`  
用途：以既有 140 家候選資料重整下半年追蹤研究的人工審核工作表。  
狀態：所有列均為 `candidate`／`pending_human_review`；不是最終樣本或 entity master。

## 狀態值

| 欄位 | 允許值 | 含義 |
| --- | --- | --- |
| `cohort_status` | `candidate`、`eligible`、`reserve`、`excluded` | 候選、合格、備援、排除。只有人工審核完成後才可離開 `candidate`。 |
| `eligibility_decision` | `pending_human_review`、`include`、`exclude`、`uncertain` | 店點是否符合地域、營業、內用與對外開放條件。 |
| `official_domain_status` | `pending`、`verified_first_party`、`not_available`、`ambiguous` | 網域是否已由原始頁面確認為第一方。 |
| `measurement_eligibility` | `pending`、`include`、`exclude` | 是否可進入網站量測 cohort；不能以缺網站或抓取失敗自動判為店點不合格。 |

## 人工審核最低要求

- 每一店點填寫 1 至 3 個可追溯證據 URL、審核者與日期。
- 對納入店點確認信義區地址、目前營業、實體內用與品牌／門市名稱。
- 對納入網站確認第一方官方歸屬；共用網域必須填寫該店可歸屬的 `owned_urls`。
- 排除項保留 `cohort_exclusion_reason`；不刪列、不用空白掩蓋不確定。
- 完成後另匯出 reviewed entity master；registry 不可直接取代它。
