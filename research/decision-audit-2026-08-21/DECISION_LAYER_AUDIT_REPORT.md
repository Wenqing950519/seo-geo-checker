# GeoCheck 決策層與演算法規格稽核報告

稽核日期：2026-08-21  
稽核對象：`PROJECT_CHARTER.md`、`DECISION_LOG.md`、`ALGORITHM_V3.md`、`CURRENT_STATE.md`、`RESEARCH_STANDARD.md`
支援材料：P1 construct notes、P1 human review、P1 claim audit、現行 `mock-api` scoring／measurement code

## 一、結論

這次驗證的對象是「決策層」，不是白皮書正文。決策層才是目前影響白皮書品質的上游來源。

本輪建立 25 個來源、30 段證據、19 個決策層主張：

| 判定 | 數量 | 解釋 |
|---|---:|---|
| 支持 | 11 | 決策文件、原始碼或方法文獻支持其限定表述 |
| 部分支持 | 3 | 方向可成立，但證據不足以支持強表述或完整效度 |
| 被反證 | 5 | 決策文件、規格、現行程式或 metadata 互相衝突 |

正式判定：**目前決策層尚未達到可直接支撐「正式定稿演算法」的狀態。** 研究方向大致清楚，但現行規格仍存在 provider 漂移、版本不唯一、決策狀態衝突、權重未校準與部署狀態未完成等問題。

這不表示專案方向錯誤；它表示應把目前成果標示為「已確認方向＋暫定實作」，不能把 V3.0.0 寫成已完成學術驗證的最終演算法。

## 二、學術角度的核心判斷

### 已成立的決策原則

1. **先定義構念，再設計分數。** Charter 已明確指出「可見度」尚未定義就開始計分。Messick 的 validity framework 將分數解釋的適切性、意義與用途視為必須由證據與理論支持的問題，因此這個 P2 順序是合理的。[Messick, Foundations of Validity](https://www.ets.org/research/policy_research_reports/publications/report/1993/hxne.html)

2. **可重現不等於有效。** National Academies 將 reproducibility 定義為使用相同資料、方法、程式與分析條件得到一致結果；同一報告也提醒，重現同一段錯誤計算不代表計算正確。這支持專案把「程式可重跑」與「AI 信任度是否測到預定構念」分開。[National Academies](https://www.nationalacademies.org/read/25303/chapter/3)

3. **研究結果必須保留不確定性與範圍。** Perplexity 單一平台、固定題組、固定日期的觀測不能外推所有答案引擎。這與 National Academies 對 generalizability 的區分一致。[National Academies](https://www.nationalacademies.org/read/25303/chapter/3)

4. **提及、推薦、引用、正確性與穩定性必須分開。** `RESEARCH_STANDARD.md` 的區分與 citation／attribution 研究方向一致；ALCE 與 AIS 都把 citation correctness、attribution 和獨立來源驗證視為不同問題。[ALCE](https://aclanthology.org/2023.emnlp-main.398/)、[AIS](https://aclanthology.org/2023.cl-4.2/)

5. **A4 只能做探索性關聯，不能寫成引用造成獲客。** Charter 和 Research Standard 已主動列出反向因果、混淆變數、代理指標與時間方向，這是正確的推論邊界。

### 不能由外部文獻替使用者決定的事項

以下屬於作者／產品決策，外部文獻不能替使用者拍板：研究白皮書優先於商業化、目標讀者拆分、產品是否保留單一總分、產品名稱「AI 信任度」、是否只先量測 Perplexity、首頁是否展示權重。外部文獻只能檢查這些選擇的可辯護性與限制，不能把它們變成「學術事實」。

## 三、五個必須處理的決策層矛盾

### P0-1：`ALGORITHM_V3.md` 的 provider 已過時

`ALGORITHM_V3.md` 仍以 Gemini 描述候選題生成、研究 profile 與白皮書預算；但 `DECISION_LOG.md` 的 D-013／D-014、`CURRENT_STATE.md` 與現行程式已改成 DeepSeek V4 Flash 為主，Perplexity 負責搜尋觀測。

這不是文字小錯，而是會改變白皮書方法章、成本、失敗處理、模型 metadata 與可重現性的規格漂移。

**判定：被反證。** V3 文件目前不能作為現行 provider 規格。

### P0-2：V3.0.0 不是唯一且完整的 scoring identity

目前程式同時暴露：

- `ALGORITHM_VERSION = 3.0.0`
- `SCORING_VERSION = 3.1.0`
- pipeline 另組合 query planner、parser、Perplexity 與 scoring 版本

此外，外層 20/30/50 在 `geo-assessment.js`，內層 `mentionRate × 40 + citationRate × 30 + authority × 0.3` 在 `perplexity-visibility.js`。`ALGORITHM_V3.md` 的正式計分表沒有完整列出內層公式。

**判定：**目前可驗證實作存在，但公開演算法規格不完整、版本身份不唯一。

### P0-3：D-002 的治理狀態與實作狀態衝突

D-002 仍標記為 `Proposed — 待使用者確認`，但 `ALGORITHM_V3.md`、`CURRENT_STATE.md` 與程式已把「Perplexity 缺證據＝unknown，不補 0」當成運作規則。

**判定：被反證。** 不是規則本身錯，而是「正式決策狀態」與「已生效實作」不一致。要嘛由使用者確認並更新狀態，要嘛將文件與程式降回暫定狀態。

### P0-4：D-019 已確認邊界，但「AI 信任度」演算法仍未定稿

D-019 已確認：

- 研究量測層分開保存來源層與品牌答案層訊號
- 產品總分命名為「AI 信任度」
- 不把它描述成模型內部實際信任

但 D-019 同時明確保留：變數、分母、權重、缺失值、封頂規則與效度驗證門檻待 P2 決定。

因此目前只能把「AI 信任度」視為產品命名與分層方向，不能當作已完成的分數公式或學術量表。

### P0-5：文件 metadata 已失去治理可信度

`CURRENT_STATE.md` front matter 的 `last_updated` 為 2026-08-10，正文更新日期為 2026-08-01；`DECISION_LOG.md` front matter 仍為 2026-08-10，但已包含 2026-08-21 的 D-019。

**判定：被反證。** 白皮書若引用這些文件，讀者無法只靠 metadata 判斷哪個版本是最新來源。發布前必須統一日期、版本與更正紀錄。

## 四、權重與模型效度判定

目前文件對權重的自我判斷是正確的：50/30/20 與 40/30/0.3 都是「未經校準的暫定值」，沒有文獻推導、訓練資料推導或外部效度證據。

因此可說：

> 根據目前模型的變數、公式與暫定權重，樣本得到某分數。

不能說：

> 這是品牌客觀的 AI 信任度、平台真實排序權重或最佳權重。

Messick 的 validity framework 也支持這個保守區分：可重算的分數不等於分數解釋已經被證明。

目前最需要補的不是再找一篇文章替 50/30/20 背書，而是完成 P2：

- 明確定義「AI 信任度」要表示哪一個可觀測構念
- 決定來源層與品牌答案層的變數、分子、分母
- 定義同題多引用、重複觀測與未知值處理
- 決定權重是規範性產品權重、資料校準權重，還是研究估計權重
- 建立與外部 outcome 或人工判定的效度檢驗
- 做敏感度分析，確認排名是否被任一暫定權重主導

## 五、可複現性與 provider 決策

### L2 的正確定位

Charter 將 L2 定義為第三方可取得原始資料，這可以作為本專案的發布門檻，但不能宣稱等同完整 reproducibility 或 replicability。National Academies 的區分是：

- reproducibility：相同資料、程式、方法與條件重算
- replicability：重新收集資料，檢查相同研究問題是否得到一致結果

因此 L2 是必要的資料可取得門檻，不是效度、正確性或跨樣本穩定性的證明。

### D-014 的 provider benchmark 只能算初步證據

`research-output/blind-deepseek-luna-2026-08-01T12-11-00/comparison.md` 顯示：同一 prompt、同一 schema、各一次 API call 的 blind comparison 中，兩個候選都未通過自動 contract；其中一個 token 較少、invalid query 較少。

這足以支持「當次測試中出現較低成本／較少 invalid query 的觀察」，不足以支持「DeepSeek 普遍較好」。D-014 可保留為使用者確認的 provider 選擇，但理由應改寫為「一次初步 benchmark 的觀察」，並補充多次、不同輸入、不同日期的比較。

### 部署狀態不能與 repository 狀態混寫

目前 repository 的 DeepSeek 設定與測試已完成，但 `CURRENT_STATE.md` 仍記載正式 API key 尚未完成部署驗證；Perplexity 則有成功量測紀錄。白皮書應分開記錄：`implementation_ready`、`deployment_verified`、`batch_verified`。

## 六、決策狀態總表

| 文件／決策 | 目前狀態 | 能否支撐正式白皮書 |
|---|---|---|
| PROJECT_CHARTER | `draft-partial`；P2 構念與權重尚未完成 | 可支撐研究方向與限制，不可支撐最終分數 |
| D-001 權重 | Proposed／未校準 | 不可作正式效度結論 |
| D-002 unknown vs 0 | 實作已採用，但治理上仍 Proposed | 需使用者正式確認或降回暫定 |
| D-006 研究主軸 | Confirmed | 可作研究問題來源 |
| D-012 分層架構 | 方向 Confirmed、細節 Proposed | 可作架構方向，不可作完整 schema |
| D-013／D-014 provider | Confirmed | 可作現行實作決策；D-014 benchmark 理由需降級表述 |
| D-019 AI 信任度 | 命名與分層 Confirmed；公式未定 | 可作產品命名，不可作最終量表 |
| ALGORITHM_V3.md | 版本名存在，但 provider／公式與現況漂移 | 不可直接作現行正式規格 |
| CURRENT_STATE.md | 有實測紀錄，但 metadata 舊且部署仍有待驗證 | 可作狀態紀錄，需更新後引用 |
| RESEARCH_STANDARD.md | 專案最高研究規範 | 可作出版稽核標準，不是演算法效度證明 |

## 七、正式定稿前必須完成的事項

### 必須由使用者拍板

1. `ALGORITHM_V3.md` 要被修正為現行 DeepSeek／AI 信任度架構，還是保留為 2026-07-16 歷史快照並另立 P2 新規格。
2. 是否正式確認 D-002：缺少搜尋證據時顯示 `unknown`，不等於 0。
3. AI 信任度的最終構念、變數、分母、權重、缺失值、封頂規則與效度門檻。
4. D-014 的 provider benchmark 是否接受為暫時選擇依據，或要求重新跑多輪盲測。

### 工程／研究上必須補齊

1. 建立單一版本表：document version、algorithm version、scoring version、pipeline version、query planner version、parser version、provider/model。
2. 將內層 40/30/0.3 公式納入正式規格，或明確標為舊版內部實作，不得讓白皮書只看到外層 50/30/20。
3. 更新 `CURRENT_STATE.md` 與 `DECISION_LOG.md` metadata，並記錄 D-019 之後的變更。
4. 對 D-014 provider 選擇補做重複 benchmark，提前定義 contract pass rate、invalid query rate、成本與延遲的判定規則。
5. 完成 P2 後再更新白皮書；在此之前，白皮書只能引用「暫定 V3 實作」與「待驗證 AI 信任度方向」。

## 八、可追溯產物

- [決策層正式稽核報告](./DECISION_LAYER_AUDIT_REPORT.md)
- [決策層 Evidence Ledger](./exports/EVIDENCE_LEDGER.md)
- [決策層 claims JSONL](./exports/claims.jsonl)
- [決策層 sources JSONL](./exports/sources.jsonl)
- [決策層 evidence JSONL](./exports/evidence.jsonl)
- [決策層 SQLite database](./research.db)
- [稽核建庫腳本](./seed_decision_evidence.py)

本輪沒有修改任何 production code，也沒有自行替使用者確認或改寫 D-002、D-019 等正式決策。
