---
type: learning-log
project: GeoCheck
last_updated: 2026-07-25
tags:
  - geocheck
  - learning
---

# GeoCheck Learning Log

> 依 `AGENTS.md` Learning Protocol 與 Anti-Dependency Rule：
> 本檔的目的不是記錄「做了什麼」（那是 git 與 `DECISION_LOG.md` 的工作），
> 而是記錄**你理解了什麼**，以及**還沒理解什麼**。

## 使用方式

每次重要任務結束後，Agent 應建議一則記錄；由你判斷是否真的理解了再寫入。

```markdown
### YYYY-MM-DD 主題

- **情境**：
- **核心概念**：（用自己的話寫，不要複製 Agent 的說法）
- **我能解釋到什麼程度**：能／部分／還不能
- **仍需人工驗證**：
- **下次遇到類似問題我會怎麼做**：
```

## Anti-Dependency 自我檢查

依 Contract，你應該能在沒有 Agent 的情況下說明以下項目。定期自評：

| 項目 | 我能解釋嗎？ | 最後檢查 |
|---|---|---|
| GeoCheck 主要架構（mock-api 各模組職責） | 〔待自評〕 | — |
| V3 演算法為何是 50/30/20 | 〔待自評〕 | — |
| 為何 Perplexity 缺結果要標 unknown 而非 0 | 〔待自評〕 | — |
| 資料流：query planner → provider → measurement → 分數 | 〔待自評〕 | — |
| 測試怎麼跑、涵蓋什麼、不涵蓋什麼 | 〔待自評〕 | — |
| GEO 分數的限制與不可宣稱的範圍 | 〔待自評〕 | — |
| usage ledger 為何要與 GEO score 分離 | 〔待自評〕 | — |

> 若某項標記為「還不能」，依 Anti-Dependency Rule，下次相關任務應**先補足理解**，而不是繼續堆疊功能。

---

## 記錄

### 2026-07-25 導入 Agent Contract 與 docs/ 事實來源

- **情境**：專案原本沒有 AGENTS.md / CLAUDE.md，研究與決策規範散落在 docx 與對話中。
- **核心概念**：
  - **約束要能被讀到才有效**——Contract 引用的文件若不存在，約束等於失效。
  - **正式決策需要載體**——沒有 DECISION_LOG，「決定過的事」只存在於記憶與對話，無法追溯。
  - **版控範圍決定可追溯性**——被 gitignore 的資料無法支撐「可追溯至資料與版本」的主張。
- **我能解釋到什麼程度**：〔待自評〕
- **仍需人工驗證**：
  - `PROJECT_CHARTER.md` 全部 TODO 欄位
  - `DECISION_LOG.md` 中 D-001～D-003 的理由與狀態
  - research-input/ 與 research-output/ 被 gitignore 是否為刻意決定
- **下次遇到類似問題我會怎麼做**：〔待填〕
