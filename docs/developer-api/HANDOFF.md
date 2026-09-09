# 下一個模型的實作交接入口

版本0.5｜2026-09-09｜目前階段：B0～B2 後臺已實作並通過本機測試；四家 benchmark 已通過，視覺前端、付款、遠端 D1 建立與公開部署未執行。先看 [後臺操作手冊](BACKEND_RUNBOOK.md)、[OpenAPI](openapi.yaml)、[本次實測與審計](AUDIT_2026-09-09.md)。

## 閱讀順序與現況

先讀根AGENTS、PROJECT_CHARTER、CURRENT_STATE、RESEARCH_STANDARD、DECISION_LOG D-027～D-030，再讀 [BLUEPRINT](BLUEPRINT.md) 及 [SECURITY](SECURITY.md)。舊ARCHITECTURE／PRODUCT_BOUNDARY／TASKS保留A現況和歷史方案；涉及B選引擎、單引擎首發的舊草案已被固定四家決策取代。本交接不改A或研究優先序。

目前已有 `/v1` customer、console、auth 與 admin 後臺；B2 包含帳戶／key、tenant 隔離、SQLite／D1 durable store、job lease/fencing、配額 reservation、provider attempt、成本與安全 ledger、結果 expiry／刪除。預設不啟用，fixture 無真實搜尋，official 模式要求四家 server-side API key。2026-09-09 benchmark 證明四家當時可通；尚無金流、任意 URL 實際抓取、寄信供應商、遠端 D1 資源或正式部署。

## 人工決策集中表

以下一次集中審閱，不必每寫一個模組就再詢問；mock可先使用建議值並標provisional。與D-027～D-030一致的內容不用重問。實作仍需使用者下一次明確啟動。

| ID | 待定內容／建議 | 影響範圍 |
|---|---|---|
| P1 | 首批客群：會串API的獨立開發／網站接案者，次為小型SEO團隊；價值與KPI見BLUEPRINT | 對外定位与招募，mock工程不受阻 |
| P2 | D-031／D-033已確認一個原樣prompt×四家；有問題直接採用，否則模板生成；不選題、不拆題、不做provider各自選題。模板內容、URL資訊不足與品質成功條件仍待定 | 已確認部分不重問；剩餘項影響payload／成本／schema，不沿用A四題+authority |
| P3 | D-032已確認首次進 API Key 管理介面即起算，無須建key；建立key須先選方案，Basic/Premium採訂閱制。試用窗、訂閱週期、續費、取消、付款失敗與額度效期仍待定 | 真實試用／付費服務；不可自行假發付費額度或補成月費細節 |
| P4 | 首批採邀請啟用；免费日TWD60、月TWD600、job上限TWD12及SECURITY限流草案 | 真實免費流量與付費smoke前核准；未填budget預設不執行 |
| P5 | D-034採分層保存方向；D-035雛型只存獨立D1結果層，不存raw evidence或R2。仍須訂結果內容、大小上限、期限、tenant存取、刪除／tombstone／備份淘汰及上游資料條款 | 不可凍結刪除／expiry契約或收集live資料；僅可用合成fixture |

P4 的單次 smoke 與 D-036 20 輪受控 benchmark 已由使用者於 2026-09-09 明確啟動並完成；20／20 四家全成，成本與延遲門檻均通過。這不取代正式免費流量、production budget、保存政策或部署批准。付費金流、SDK、dashboard、代管監控仍需另案授權。

## 實作工作包（未執行）

| 階段 | 具體交付 | 驗收完成才往下 |
|---|---|---|
| B0 契約與A基線 | **完成**：JS契約、成功／失敗／部分結果fixtures、OpenAPI 3.1與A回歸 | API行為與fixtures有測試 |
| B1 零成本垂直流程 | **完成**：mock四家adapter、B orchestrator、private presenter、結果store port與本機HTTP smoke | 一次POST到終態完整走通；無真實fetch；任一家失敗不扣輪 |
| B2 持久工作與隔離 | **後臺完成、本機驗證**：tenant/key、交易store、outbox、lease/fencing、成本與配額事件、刪除／保留 | SQLite行為與D1 adapter契約通過；遠端D1 migration／restore仍是上線驗收 |
| B3 四家與URL邊界 | **部分完成**：四家 payload／parser、原生 evidence、用量／成本與單次 smoke；URL 僅做 hostname 產題並拒絕 localhost／IP／非預設埠，尚未建立 egress | 真實 URL 抓取前須完成 DNS／redirect／egress 控制；上游資料 contract 仍需驗證 |
| B4 小額人工驗收 | **技術前置完成**：D-036 的 20 輪受控 benchmark、成本／延遲／完成率報告已通過；P1～P5、真實客戶價值與 production budget 未完成 | 可進入前端／文件／dashboard 規劃；公開流量與部署仍需另行批准 |

每階段限定新增檔與測試，PR／交付記錄前後差異、未解缺口、回退步驟。以mock與fixture測試為主，不以付費API當CI。程式修改後跑相關測試再跑一次 `npm.cmd test`；有無lint/typecheck先看package.json，沒有script就明說，不能宣稱通過。發布與資安上線門檻不是單靠unit tests完成。

## 必要驗收案例

| ID | 條件 | 預期 |
|---|---|---|
| C01 | 四家有效搜尋回答及必要分析完成 | succeeded、4個結果、扣1輪 |
| C02 | 任一家錯誤／拒答／empty／parse error | failed、完整比較null、回可用部分、扣0輪 |
| C03 | 有效回答沒有目標提及／citation | 不偽造；指標按證據為false／空陣列；不是provider error |
| C04 | 缺target或搜尋執行證據無法確認 | target指標null；搜尋未知不冒充完整成功，依P2品質gate |
| C05 | 同tenant同key同body重送 | 回同job；GET不呼叫模型；不重複預留／結算 |
| C06 | 同key不同body／不同tenant重用key | 前者409；後者互相隔離且不可讀對方job |
| C07 | 剩1輪同時20個POST／worker重複claim | 最多1個獲額度；一個有權完成的worker；不負餘額 |
| C08 | provider已回、worker死掉／提交結果時DB故障 | 恢復已保存證據；不重打成功家；未commit不回成功 |
| C09 | provider timeout且帳務未知 | ambiguous記帳、不假設免費；依規則failed且客戶扣0 |
| C10 | 反覆failed、無剩餘成功輪、全域預算滿 | 獨立attempt與成本gate阻止無限免費呼叫 |
| C11 | 試用第7窗跨到期完成／換key／重寄信 | 結算原reservation；不增加第8窗或重置試用 |
| C12 | 私網URL、DNS rebinding、redirect、過大壓縮內容 | 沒有內網連線；bounded抓取；上游搜尋不啟動 |
| C13 | prompt／HTML要求改額度、洩密、回script | 不能改可信狀態或跨tenant取資料；script不可執行 |
| C14 | B結果被A公開route／他人key取讀或刪除 | 無內容外洩；外部一致404；內部保留受控稽核 |
| C15 | key撤銷／試用過期／結果到期／刪除後restore | 新job被拒；舊result按權限與期限讀；備份不復活刪除內容 |
| C16 | 一家readiness關閉／B壓測／B總開關關閉 | 不接受三家替代成功；A資源與既有流程通過回歸 |
| C17 | queue未滿但等待加執行超過deadline／worker停機 | 拒絕超出容量承諾的新job；已接受逾期job最終failed且扣0；晚到結果不翻轉終態 |
| C18 | key輪替／剩餘0輪以有效key重送原job | 輪替不刪資料；有效身分可回原job而不再執行；撤銷key仍拒絕 |
| C19 | 結果含prompt／answer副本，原文到期或使用者刪除 | 按P5欄位政策清除所有對應副本；ledger不含原文；還原不復活 |
| C20 | 跨預算窗、估價不足、restore缺少近期ledger | 在途成本不消失；停止新admission並對帳；不增加客戶收費或可用輪數 |
| C21 | prompt已含觀測問題／輸入只有URL或背景／單一prompt含多題 | 前者不呼叫生成步驟；後者以模板生成一題；四家使用同一effective_prompt且保存question_source；多題不拆、不選；生成失敗不啟動四家 |

失敗映射至少固定 invalid_request、auth_required、forbidden、quota_exhausted、trial_expired、rate_limited、service_unavailable、provider_timeout、provider_refusal、provider_invalid_response、search_unconfirmed、persistence_error。外部不回stack、秘密或原始上游帳號資訊。

## 可直接交給下一個模型的提示

> 請先閱讀 AGENTS.md、docs/developer-api/AUDIT_2026-09-09.md、HANDOFF.md 及其指定文件，檢查工作區既有變更。B0／B1 與一次性四家 smoke 已完成；不要重複付費 smoke。保留產品 A 行為，先測試再實作。遵循 D-027～D-035 固定四家、全成才扣輪與 failed 回部分結果。P1～P5 未確認處只使用明確標記的 mock 建議值。不要串金流、開 dashboard、發布 SDK、加監控產品、建立正式 D1、儲值或部署，除非使用者另行明確授權。完成後交付測試結果、變更檔、下一階段門檻；遇到會改變使用者商業決策的缺口，完成獨立工作後集中呈報。

上述提示是供使用者下一輪選擇執行的文字，不是此輪已下達的實作命令。

學習紀錄建議：固定四家是一個商品單位；HTTP request、工作、上游attempt、成功扣量是四種不同事件。私有演算法不代表輸出不可追溯；failed不收費不代表可以無限重試。服務成本與客戶額度必須分帳。這些可日後記入LEARNING_LOG，未新增研究結論。
