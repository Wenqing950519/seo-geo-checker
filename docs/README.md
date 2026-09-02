---
type: index
project: GeoCheck
tags:
  - geocheck
  - index
---

# GeoCheck docs — 專案共同事實來源

這個資料夾是 GeoCheck 的**共同事實來源（single source of truth）**。
Agent（Codex / Claude Code）在重大任務前必須讀取此處；不得只依賴對話或自動記憶。

## 角色分工

| 角色 | 負責 |
|---|---|
| **Obsidian** | 你的閱讀、思考與書寫（本資料夾即 vault） |
| **Git** | 版本紀錄與可追溯性 |
| `AGENTS.md` / `CLAUDE.md` | 約束 Agent 行為 |
| `docs/` | 專案的共同事實來源 |

## 文件

| 文件 | 內容 | 狀態 |
|---|---|---|
| [[PROJECT_CHARTER]] | 產品定義、目標使用者、研究問題、商業模式 | ⚠️ **多處 TODO 待你填寫** |
| [[CURRENT_STATE]] | 營運現況、服務狀態、實測分數 | ✅ 2026-09-02 |
| [[RESEARCH_STANDARD]] | 研究最高規範（Mandatory v1.0.0） | ✅ 完整 |
| [[DECISION_LOG]] | 正式決策的唯一憑據 | ⚠️ D-001～003 待確認 |
| [[LEARNING_LOG]] | 你理解了什麼、還沒理解什麼 | 🔄 持續 |

## 使用規則

1. **文件衝突時停止重大變更**，指出衝突，不得自行挑方便的版本。
2. `RESEARCH_STANDARD.md` 與其他文件衝突時，**以它為準**。
3. `RESEARCH_STANDARD.md` 與 `attachments/GEO_RESEARCH.md.docx` 衝突時，**以 .docx 正本為準**。
4. 未記入 `DECISION_LOG.md` 的方向，**不算正式決策**。

## 專案根目錄的相關文件

這些不在 docs/ 內（保留原位以免破壞既有引用）：

- `AI_TRUST_INDEX_V1.md` — 產品現行演算法規格 1.0.0
- `ALGORITHM_V3.md` — 歷史演算法規格 3.0.0（追溯用）
- `ALGORITHM_V2.md` — 前版規格（追溯用）
- `GEOCheck_Technical_Whitepaper_V3_2026-07-16.docx` — 技術白皮書
- `business_docs/` — BRD / MRD / PRD
- `.agents/skills/geo-whitepaper-research/SKILL.md` — 白皮書研究流程
