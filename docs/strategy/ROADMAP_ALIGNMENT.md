# 商業路線與程式位置對照

資料夾應同時支援 A、Developer API，以及 Project／Dashboard／Agent 工作流。依 D-040，Developer API 是共用量測基礎並可作外部技術產品；使用者體驗仍依「短測引流 → SaaS Dashboard → 診斷型 Agent」推進，不把公開 API 當成建立第二次使用的必經之路。

## 來源與狀態

本次閱讀使用者指定的 `C:/Users/eason/Downloads/GeoCheck_Business_Investment_Proposal_2026-09.md`，日期 2026-09-08。其 §7、§8、§10、§11 與附錄 B 描述 Account／Project、Dashboard、有限排程、second review 與 paid pilot；這裡只整理產品提案，不援引或重新認證其中市場、競品、價格與外部 API 主張。來源圖檔未納入本次整理。

該提案與 `MULTI_ENGINE_API_SERVICE_BRIEF.md` 的重心不同：前者先驗證 practitioner 重複使用，後者偏向開發者服務與多引擎。此處原有的「尚未選擇商業優先序」狀態已由 D-040 取代；兩條路線共用 Run／evidence 基礎，但 Dashboard／Agent 與外部 API 仍各自保留 UI、授權、計費及發布邊界。

## Now / Next / Later 的建議歸屬

| 階段 | 需求 | 位置與不必先做的事 |
|---|---|---|
| 現況整理 | A 的診斷、共用規則、抓取、provider、研究 | apps/web、packages、services/api、research；保持單一部署 |
| 下一個產品驗證 | Account／Project、保存 Run、最小 Dashboard、第二次 review | services/api 的 domain/storage + apps/web 的登入工作區；先證明 recurring job |
| workflow 成立後 | 有限排程、跨期比較、用量／成本可見與診斷型 Agent | Agent 只讀取 immutable evidence 並提供解釋／提醒，不直接改客戶網站 |
| 外部技術產品 | public API + SDK + developer console | services/api/v1 與 packages/sdk；Developer API 是共用基礎，console 不重做商家 Dashboard |
| 已選定、尚未實作 | 藍新 MPG／定期定額與相關付款流程 | 依 D-041 另做商務、資安、退款與上線驗收，不由策略文件推定完成 |

Project 是品牌／網站的持續狀態容器；Run 是一次觀測；Report 是觀測的呈現。應把 history 接到 Run，而不是反覆覆寫一份 report JSON。A、B 與 Monitoring 都可以使用同一 use case，但不同產品可以有不同 UI、授權與輸入政策。

## 去蕪存菁的判準

保留活躍實作與可追溯證據；將過期規格集中 archive；將仍待判斷的策略集中 strategy；維持一個 current-state 與 decision log。對沒有 consumer 的新功能先寫一段責任邊界，不安裝框架、不建空 class、不畫成已實作。

「目錄分層」解決找不到正本與路徑耦合；「產品取捨」仍需使用者決定。研究資料的版本多不等於重複垃圾，刪除依據必須是內容相同、沒有 provenance 依賴且明確決定不保留。
