# GeoCheck 文件索引

目前狀態以 CURRENT_STATE 為準，正式方向以 DECISION_LOG 為準；策略提案、歷史規格與研究證據各自保留，不互相冒充。

| 區域 | 閱讀入口 | 用途 |
|---|---|---|
| 治理 | [PROJECT_CHARTER](PROJECT_CHARTER.md)、[RESEARCH_STANDARD](RESEARCH_STANDARD.md)、[DECISION_LOG](DECISION_LOG.md)、[LEARNING_LOG](LEARNING_LOG.md) | 目標、方法約束、正式決策與學習 |
| 現況／操作 | [CURRENT_STATE](CURRENT_STATE.md)、[部署驗收](DEPLOYMENT_RELEASE_CHECKLIST.md)、[服務操作](../services/api/OPERATIONS.md) | 區分本機與線上驗證日期 |
| 架構／契約 | [ARCHITECTURE](ARCHITECTURE.md)、[PRODUCT_BOUNDARY](PRODUCT_BOUNDARY.md)、[API_CONTRACT](API_CONTRACT.md)、[TASKS](TASKS.md) | 目前架構與尚未完成的平台提案 |
| 產品規則 | [AI_TRUST_INDEX_V1](AI_TRUST_INDEX_V1.md)、[ANALYTICS_TRACKING](ANALYTICS_TRACKING.md) | 現行計分與事件定義 |
| 專題資料 | [路線對照](strategy/ROADMAP_ALIGNMENT.md)、[整理紀錄](maintenance/REPOSITORY_CLEANUP.md) | strategy 是提案；research／whitepaper 是研究；archive 是歷史 |

`docs/` 同時是 Obsidian vault，共用設定保持。`attachments/GEO_RESEARCH.md.docx` 仍是研究標準正本，沒有搬移。研究原始資料與工具在 repository 的 `research/`，不放本目錄根部。

舊 BRD／MRD／PRD 位於 `archive/business/`；舊 Word 規格位於 `archive/specifications/`；ALGORITHM V2／V3 位於 `archive/algorithms/`。P1 工作文件位於 `research/methodology/`。過往 locator 不回溯改寫，請以 [搬移表](maintenance/layout-migration-2026-09-08.json) 查 from／to。

本次重整授權見 D-026。B API、SDK、Monitoring、Account／Project 均不能只因有文件或目錄就標為已實作。