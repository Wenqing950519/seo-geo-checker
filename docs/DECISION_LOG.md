---
type: decision-log
project: GeoCheck
last_updated: 2026-07-25
tags:
  - geocheck
  - decisions
---

# GeoCheck Decision Log

> [!important] 這是「正式決策」的唯一憑據
> 依 `AGENTS.md` Human Ownership 條款：**未記錄於本檔的重大方向，不得視為正式決策。**
> Agent 提出的建議在使用者確認並記入本檔之前，一律是「建議」而非「已確認決策」。

## 記錄格式

每筆決策使用以下欄位。**Status 只有使用者能標記為 `Confirmed`。**

```markdown
### D-XXX 決策標題

- **日期**：YYYY-MM-DD
- **狀態**：Proposed / Confirmed / Superseded
- **決策者**：
- **決策內容**：
- **理由與依據**：
- **考慮過的替代方案**：
- **影響範圍**：
- **可追溯來源**：（commit / 文件 / 研究批次 ID）
```

---

## 待補登的既有決策

> 以下是從既有文件與程式中**觀察到已生效**、但從未正式記錄理由的決策（狀態一律 `Proposed`，待使用者確認補齊理由）。
> 依 RESEARCH_STANDARD §12.2「權重不得任意設定」，D-001 尤其需要補上依據。

### D-001 演算法 V3 權重設定為 50/30/20

- **日期**：2026-07-16（依 `ALGORITHM_V3.md` 標示日期）
- **狀態**：**Proposed — 待使用者確認**
- **決策者**：〔待填〕
- **決策內容**：GEO = Perplexity 搜尋觀測 ×0.50 + 內容可引用度 ×0.30 + 網站技術基礎 ×0.20
- **理由與依據**：**TODO — 目前文件中未見權重的推導依據**
- **考慮過的替代方案**：V2.2.1-rules（見 `ALGORITHM_V2.md`）
- **影響範圍**：所有 GEO 分數、白皮書結論、對外報告
- **可追溯來源**：`ALGORITHM_V3.md`、批次 `v3-rules-smoke-2026-07-16`

### D-002 Perplexity 缺結果時 GEO 標記為 unknown 而非 0

- **日期**：2026-07-16
- **狀態**：**Proposed — 待使用者確認**
- **決策內容**：Perplexity 無法取得結果時，GEO 必須為 `unknown`，不得為 0
- **理由與依據**：缺乏證據 ≠ 表現差；符合 RESEARCH_STANDARD §1.1「無證據，不生成事實性文字」
- **影響範圍**：分數呈現、對外解讀
- **可追溯來源**：`ALGORITHM_V3.md`、`docs/CURRENT_STATE.md`

### D-003 Gemini 不得影響 GEO 分數

- **日期**：2026-07-16
- **狀態**：**Proposed — 待使用者確認**
- **決策內容**：Gemini Flash-Lite 僅供 profile/context 與候選題生成，不得改變 GEO score，也不可直接產生推薦結論
- **理由與依據**：**TODO — 推測與證據來源一致性有關，待確認**
- **影響範圍**：演算法效度、白皮書方法論
- **可追溯來源**：`ALGORITHM_V3.md`

---

## 正式決策

_（使用者確認後的決策記於此區）_
