# 2026 年 10 月白皮書數據紀錄：Wave 1

**已完成本月可執行的收數、完整回答補測與證據對帳；仍不足以宣稱 49 個網站或 63 家店點均已完整量測。** 可以作為年底白皮書的 10 月觀測檔案，正式比較與發布仍需處理實體歸屬、缺測與人工語意複核。

版本：`october-record-v0.2`；紀錄日：2026-10-15，Asia/Taipei。本地研究稿，未發布。原準備稿另存 `preparation/record-v0.1.md`，其中「尚未收數」等文字只代表當時狀態。摘要、原始證據與更正紀錄優先於舊敘事。

## 本月實際收集

沿用 eason 於 2026-09-09 核准的三題 `xinyi-dining-2026h2-v2.0`，維持原始 49 個網站輸入，未新增店點、修改題目或代填人工核准。研究單位為網站輸入 × 題目 × 波次；不是每家店點獨立分數，也不是整月連續觀測。

| 項目 | 本次驗證結果 | 可追溯資料 |
|---|---|---|
| 全體輸入 | 49：23 完成既有 pipeline、10 抓取失敗、16 實體對應未決 | `results.jsonl`、`results.csv` |
| 原始探索回答 | 147 個應有位置：69 有回答，其中 55 截斷、14 完整；其餘 78 unknown | `query-runs.csv` |
| 完整性補測 | 23 站 × 3 題，69/69 回答完整結束；保留另外 78 個 unknown 位置 | `completion-supplement/query-runs.csv` |
| 公開網頁證據 | 103 個 URL；87 份 HTTP 回應、16 筆連線失敗；回應中 63 個 HTTP 2xx | `site-evidence/fetch-events.jsonl`、`raw/` |
| 實際 AI 請求 | 原批次 115（Perplexity 92、DeepSeek 23）；補測 Perplexity 69；合計 184 | 兩批 `transport-ledger.csv` 及原始 transport 檔 |

原批次採集窗口為 **10/15 14:16:35–14:31:28**；補測為 **14:36:40–14:38:36**（台北時間）。原批次 Perplexity 上限 132、DeepSeek 上限 33，補測 Perplexity 上限 69、不重試；實際請求含失敗嘗試受硬上限約束，已逐筆對帳。

Perplexity 請求與回傳模型均為 `sonar`。DeepSeek 請求 `deepseek-v4-flash`、設定 release `0731`，實際回傳名稱為 `deepseek-flash`；不能只憑別名證明底層版本相同。DeepSeek 僅描述網站，不參與評分。供應商回報的 Perplexity 費用原批次 USD 0.3259、補測 USD 0.2326，合計 **USD 0.5585**；23 筆 DeepSeek 未回報費用，整體成本仍為 unknown，不能將缺值視為免費。

## 截斷修復與解讀邊界

原批次沿用程式的 `max_tokens=260`，55/69 探索回答回傳 `finish_reason=length`。原 parser 仍接受這些回答，因此原始分數僅為可追溯的 pipeline 結果，不是已通過完整性檢查的能見度結論。

補測對全部 23 個成功站點的三題重收，包含原本完整的 14 筆，避免只挑截斷樣本；唯一 payload 差異是 `max_tokens=4096`，已逐一驗證。69 筆均回傳 `stop` 且被分類為 answered；69 個 response ID 及回答雜湊各不相同，但不代表統計獨立。補測是較晚的新回答，不能視為取回原回答遺失尾段，也不能據此識別提高 token 上限的因果效果。

兩批自動解析都命中 3 筆目標品牌；補測未找到目標官方網域的 citation 或 search-result URL。**這些是自動文字與 URL 比對，不是已確認的分店推薦率。** 補測正例：XY-031 的「馬辣」命中實際文字「新馬辣經典麻辣鍋 Plus+」，不能直接歸為原名冊的「馬辣頂級麻辣鴛鴦火鍋信義店」；XY-060、XY-057 的回答分別寫到橘色 A9 與 WILDWOOD A9，但仍待作者確認來源支持。逐字原文見 `completion-supplement/positive-answer-review.json`。自動判定保留不覆寫，人工結論欄仍 pending。

補測不生成新分數，不與原批次混合分母；與 9 月也不直接合併或比較為升降趨勢。0 個目標官方 URL 不代表回答沒有任何餐廳官網，也不能推論網站品質導致不被引用。

## 9 月基準重新驗證

9 月原始 49 列包含 37 成功、12 失敗；111 筆探索判定與 37 個分數均已離線重現，資料集及帳本語義雜湊吻合。337 筆用量事件已拆為 v1 archive 的 152 筆與 v2 最終階段 185 筆；148 份 Perplexity 原始回答依操作、模型、tokens 與 latency 指紋唯一對上帳本。這是推導連接，不能冒充原始 response ID；37 筆 DeepSeek 尚無逐站原始 usage 連結，也無法回溯未保存的 HTTP 重試。

舊報告抽核的 11 個明列頻次有 5 個不符保存答案，已建立 [更正紀錄](../xinyi-dining-h2-2026-wave0/ERRATA-2026-10-15.md)。原始回答與舊報告原文保留。舊排行榜、推薦率及 WAF 因果敘事不可直接沿用。

兩波同為 49 個輸入，23 個站點兩波 pipeline 均成功，配對沒有 store ID 不一致；但這不等於實體歸屬均經本月確認。9 月沒有保存完整 request payload、finish reason 與執行 source commit，不能證明與 10 月完整設定一致或回答未截斷。`protocol.json` 中 baseline-code 的用語僅指本次查閱程式，歷史連續性限制已補入 `methodology.json`。

## 尚未補成有效觀測的項目

| 缺口 | 已完成的準備 | 完成條件 |
|---|---|---|
| 16 個根網址實體對應未決 | 已修正會消掉 URL 路徑／查詢的檢查，保存候選店點、owned URL 與當期 HTTP 證據 | 作者確認每筆根輸入對應的精確店點頁；不得自行選第一家。見 `preparation/entity-resolution-proposals.json` |
| 10 個抓取失敗 | 分類為 crawl_quality 3、url_dns 3、translate_fetch 4，保留失敗和網頁快照 | 取得對應店點的可驗證網站內容後，另記補收窗口；不把失敗視為零分或停業 |
| 63 店點與 49 根輸入的範圍差 | 49 根實際映射 60 店；XY-059、XY-062、XY-069 無根映射 | 明確保留未覆蓋，或經作者決定新的店點採樣方式；不能稱已測完 63 家 |
| 語意與來源複核 | 正例原文、引用與店點資訊已整理，全部人工欄位保留 pending | 確認品牌／子品牌／分店、提及與推薦的區別，以及引用是否支持回答；保留覆核者與日期 |
| 跨月可比性 | 原批次、補測、matched panel 分離，凍結來源與參數 | 作者確認後續波次的完整回答規格；9 月缺失不能靠 10 月資料補造 |

研究 skill 的原文要求為「Shared domains require an exact owned URL mapping.」見 [SKILL.md](../../../.agents/skills/geo-whitepaper-research/SKILL.md)。這是 16 筆保留 unknown 的依據；已完成候選資料整理，但不冒填人工核准。下一波的長度規格及是否改採店點 URL，是待作者確認的研究設計，未寫成正式決策。

## 證據帳本與重現

| Claim ID／類型 | 可使用的觀測 | 正本／定位 |
|---|---|---|
| OBS-OCT-001 | 49 列、23 成功、10 失敗、16 unknown | `summary.json.pipeline_status_counts`；`results.jsonl` |
| OBS-OCT-002 | 原批次 55 截斷、補測 69 完整 | `summary.json.quality_counts`；`completion-supplement/summary.json`；各 transport response 的 finish_reason |
| OBS-OCT-003 | 184 實際請求，已知部分費用 USD 0.5585 | 兩批 `transport-ledger.csv`；response usage.cost；DeepSeek 費用 unknown |
| OBS-OCT-004 | 9 月 111 判定與 37 分數重現；5 項舊文字頻次錯誤 | `preparation/readiness-audit.json`、`wave0-observation-replay.csv`、`historical-report-claim-checks.csv` |
| OBS-OCT-005 | 49 根映射 60 店，3 店未覆蓋 | `preparation/readiness-audit.json.mapping`；`store-current-evidence.csv` |

來源為本地保存的 P0 輸入、供應商原始回應、公開 HTTP 快照與推導稽核；採集與驗證日期均為 2026-10-15。這些來源證明保存與觀測狀態，不保證商家現在營業、回答真實或因果關係。執行 HEAD 為 `6d3dae319e3457bc8595da0811957d5b3e58650f`，工作樹含改動；14 份凍結檔案逐一雜湊比對成功，實際 bytes 另存 `provenance/source/`，不能僅以 HEAD 當作完整執行版本。

完整 49 列 `results.jsonl` 的檔案 SHA-256：`d5010dfd737262b2ff5a0c67b2e80d1894abb0976a6dbe99a890d38e7cf04ea4`。33 列原 canonical 子集的語義雜湊：`547edbd83ee5a5b76067102ca7fecabe1ba97caea65eb424ce6159422affe548`。定義不同，不可互換。整個資料包逐檔雜湊見 `manifest.json`。

離線重現順序：`node research/work/audit-wave0-for-october.mjs`、`node research/work/audit-october-readiness.mjs`、`node research/work/finalize-october-wave1.mjs`、`node research/work/audit-october-completion.mjs`。不需供應商金鑰；勿把收數腳本的 `--collect` 當作離線驗證。重建會更新 generated_at，須重產 manifest。完整 `npm.cmd test` 已通過，包含實體精確映射、請求上限／續跑保留及 SDK 型別編譯；資料是否可發布則仍依上述研究限制判定。

建議學習紀錄：成功跑完程式、回答完整與店點判定正確是三個不同門檻；補測必須保留原結果與參數差異，不能把重新取得的答案當成原觀測缺失值。本次未代填正式 Learning Log、研究決策或人工覆核。
