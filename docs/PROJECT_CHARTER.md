---
type: project-charter
project: GeoCheck
status: draft-incomplete
owner: 〔待填〕
last_updated: 2026-07-25
tags:
  - geocheck
  - charter
---

# GeoCheck Project Charter

> [!warning] 本文件尚未完成 — 內容屬 Human Ownership
> 依 `AGENTS.md` / `CLAUDE.md` 的 Human Ownership 條款，以下標記 `TODO` 的欄位**必須由使用者本人決定**，Agent 不得代填。
> 在這些欄位完成前，任何依賴品牌定位、目標使用者、研究問題或商業模式的重大變更都應暫停。

## 1. 產品定義

**一句話定位**

> GeoCheck 量測的是「品牌在**指定 Perplexity 查詢集**下的可觀測 GEO 證據」，不是全網 AI 搜尋保證、不是傳統 SEO 排名、也不是主觀觀感分數。
>
> _（此句摘自 `docs/CURRENT_STATE.md` 的「對外說明」段落，屬 Observed／既有陳述。請確認是否升格為正式定位。）_ **TODO：確認或改寫**

**產品邊界 — 明確不做什麼**

- TODO：列出刻意排除的範圍

## 2. 目標使用者

**TODO：由使用者決定**

- 主要對象是誰？（例如：中小企業主／行銷負責人／SEO 顧問／餐飲業者）
- 他們現在用什麼替代方案？
- 什麼情境下會想起 GeoCheck？

## 3. 核心問題與證據

**要解決誰的什麼問題？**

- TODO

**有什麼證據證明這個問題存在？**（依 Research Integrity，須區分 Verified fact／Observed／Assumption）

- TODO

## 4. 研究問題與主要假設

> 研究執行規範見 `docs/RESEARCH_STANDARD.md`（Mandatory）。本節只定義**問題**，不定義方法。

**核心研究問題**

- TODO

**主要假設（H-XXX 編號，依 RESEARCH_STANDARD §3.2）**

- TODO

## 5. 評分框架的定義權

現行演算法 V3.0.0 權重（見 `ALGORITHM_V3.md`）：

| 構面 | 權重 |
|---|---:|
| Perplexity 搜尋觀測 | 50% |
| 內容可引用度 | 30% |
| 網站技術基礎 | 20% |

**TODO：確認這組權重的決定依據是否已記入 `docs/DECISION_LOG.md`。**
依 RESEARCH_STANDARD §12.2「權重不得任意設定」，此處須能追溯到理由。

## 6. 商業模式與優先級

**TODO：由使用者決定**

- 收費模式？
- 現階段最高優先的一件事？

## 7. 成功與失敗的定義

**成功**

- TODO

**失敗／應停損的訊號**

- TODO

## 8. 已知限制

- Perplexity 無結果時 GEO 為 `unknown`，非 0（見 `ALGORITHM_V3.md`）
- Gemini 直接出口受地區限制，須經 Render 代理（見 `docs/CURRENT_STATE.md`）
- TODO：補充其他限制

---

## 填寫指引

建議依 1 → 3 → 2 → 4 → 7 → 5 → 6 的順序思考：先講清楚產品是什麼、解決什麼問題，再回頭定義使用者與成功標準。
每完成一節，把關鍵決策同步記入 `docs/DECISION_LOG.md`。
