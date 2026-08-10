# 研究規則（細則）

> 本檔是 `CLAUDE.md` / `AGENTS.md` 的 Research Integrity 細則。
> **最高約束是 `docs/RESEARCH_STANDARD.md`（Mandatory, v1.0.0）**；本檔與之衝突時，以該文件為準。

## 開始研究任務前必讀

1. `docs/RESEARCH_STANDARD.md` — 研究最高規範
2. `docs/PROJECT_CHARTER.md` §4 — 研究問題與假設
3. `.agents/skills/geo-whitepaper-research/SKILL.md` — 白皮書研究流程

## 主張分級（每個陳述都必須可歸類）

| 級別 | 定義 | 可否進入正式草稿 |
|---|---|---|
| Verified fact | 有可核對來源與定位資訊 | ✅ |
| Observed result | 本專案實測產出，附 run ID | ✅（須標明條件） |
| Inference | 由前兩者推導 | ⚠️ 須標示為推論 |
| Assumption | 未驗證前提 | ⚠️ 須標示 |
| Hypothesis | 待驗證假設，編號 H-XXX | ⚠️ 須標示 |
| Opinion | 主觀判斷 | ❌ 不得作為結論依據 |

## 不可違反

- **無證據 → 停止生成該主張**，輸出「【資料缺口】」，不得用近似值、常識或語氣修飾代替
- **禁止先寫結論再補來源**；流程必須是 研究問題 → 來源蒐集 → 證據帳本 → 分析 → 結論 → 寫作
- 無法開啟原文／確認版本／定位數據時 → 標為「未驗證」且**禁止引用**
- 缺少證據要保留為 `unknown` / `null`，**不可當成 0 分**
- 來源探索結果只是線索，**不等於官方 ownership 證明**
- API/token 用量須記入獨立 usage ledger，**不得混入 GEO score**

## 付費測量前的核准清單

執行任何付費 API 測量前，必須確認以下皆已核准：

- [ ] 樣本清單與版本
- [ ] root domain 歸屬已驗證
- [ ] query set 版本與 `review_status=approved`
- [ ] 演算法版本
- [ ] 時間窗
- [ ] 人工審核狀態（`reviewed_by`、`reviewed_at`）
- [ ] 用量上限與預算

任一項未核准 → 標記 `blocked`，不得執行。

## 可追溯性要求

任何評分、排名、Benchmark 或對外結論，必須能追溯至：

- 資料檔案與版本
- 方法（`methodology.json`）
- 演算法版本
- run ID 與時間

> ⚠️ **現況警示**：`research-input/` 與 `research-output/` 目前被 `.gitignore` 排除，未納入版控。
> 在此狀態下，「可追溯至版本」只能依賴本機檔案。對外發布前須確認此限制是否可接受。
