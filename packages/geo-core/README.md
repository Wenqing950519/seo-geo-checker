# geo-core

目前是內部 CommonJS 模組，未發布套件。`evidence/` 做品牌、來源與回答判讀；`site-analyzer/` 做已取得訊號的分析；`scoring/` 保留版本化規則；`query-generator/geo-probes.js` 保存題庫規格工具。

核心不呼叫網路、DB、provider 或讀 env。真正生成題目的 `query-planner.js` 仍位於 `services/api/application`，之後才按 ARCHITECTURE 拆出純選題。crawler 位於 `packages/crawler`，A 報告位於 `apps/web/report`。目前來源判讀仍保留 Perplexity 相容語義；這次未改分母、unknown、65/35 或覆蓋不足封頂。
