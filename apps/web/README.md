# GeoCheck Web A

`public/` 保存既有頁面與資源，`report/` 組裝 A 的報告資料，`analytics/` 管理 A 的 funnel。由 `services/api/server.js` 供應；HTTP route 與 HTML／Markdown renderer 尚在該 server，這次僅整理位置，不宣稱完成 controller／presenter 重構。

若後續依商業企劃新增 Project Dashboard，優先在此產品內延伸帳戶、Project 與歷史頁面。這與 Developer Console 的 API key、用量管理不是同一個介面。首頁 Hero、文案、query／scoring 行為保持原樣。
