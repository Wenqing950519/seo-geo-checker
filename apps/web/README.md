# GeoCheck Web A

`public/` 保存既有頁面與資源，`report/` 組裝 A 的報告資料，`analytics/` 管理 A 的 funnel。由 `services/api/server.js` 供應；HTTP route 與 HTML／Markdown renderer 尚在該 server，這次僅整理位置，不宣稱完成 controller／presenter 重構。

Project Dashboard 的後端 foundation 已位於 `services/api/`，前端客戶端位於 `apps/web/app/`：它以 Product A 的 Project membership、Tracking Run 與 `/app-api/v1` 延伸帳戶與歷史頁面。前端架構參照 Themap 專案採分頁獨立子資料夾設計（overview, performance, questions, citations, quality, evidence, auth），共用層於 shared/；完全遵循 DASHBOARD_UI_SPEC 與 FRONTEND_ACCEPTANCE 規範。這與 Developer Console 的 API key、用量管理不是同一個介面。首頁 Hero、文案、query／scoring 行為保持原樣。
