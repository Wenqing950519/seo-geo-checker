# Developer API 20 輪受控驗證（2026-09-09）

## 結論

D-036 的四項門檻全部通過，可以結束供應商前置驗證並進入「前端、技術文件、API 管理 dashboard」的規劃階段；這不是部署或公開營運核准。

| 驗收項目 | 門檻 | 觀察結果 | 判定 |
|---|---:|---:|---|
| 固定四家完整成功 | 至少 19／20 | 20／20（100%） | 通過 |
| P95 單輪成本 | ≤ TWD 4.5 | TWD 3.490287 | 通過 |
| 單輪端到端時間 | 每輪 ≤ 30 秒 | 最慢 12.948 秒；P95 11.907 秒 | 通過 |
| 供應商總預算 | ≤ TWD 120 | 保守上界 TWD 53.304851 | 通過 |

## 方法

20 個繁體中文問題涵蓋政府、交通、物流、電信、旅遊電商、SaaS、教育與求職；每題對應公開 HTTPS 網站，不含個資。每回合以相同 prompt 同時呼叫 GPT-5.6 Luna、Gemini 3.5 Flash-Lite、Sonar、Claude Haiku 4.5，各家只嘗試一次、不 retry。成功要求非空回答、確認執行 web search 且至少一個有效 citation；只保存問題 hash、數量、usage、成本、模型與延遲，不保存回答或引用內容。

每家 timeout 為 29 秒、輸出上限 1,024 tokens；OpenAI／Anthropic 搜尋最多 2 次。成本 P95 採每輪保守上界並以 nearest-rank 計算；匯率沿用 D-036 核准執行時的 TWD 31.535／USD。Google Search 免費額度是否已使用無帳務證據，因此總成本保留 TWD 36.305987～53.304851 區間，驗收與預算均採上界。

## 後台帳務對帳（使用者回報）

2026-09-09 測試後，使用者回報四家供應商自接入以來的後台累計值。這是人工觀察值，尚未保存帳單匯出或截圖，且範圍可能包含 benchmark 前的 smoke test，因此不能反推每一輪成本或取代事件檔的 P95；可用來核對總預算是否超支。

| Provider | 後台累計用量 | 後台累計費用 |
|---|---:|---:|
| Anthropic／Claude | 8.8k（後台顯示，欄位口徑未確認） | USD 0.670 |
| Google／Gemini | 未回報 token | USD 0.008 |
| OpenAI | 341,226 total tokens | USD 0.300 |
| Perplexity | 未回報 token | USD 0.115 |
| **合計** | — | **USD 1.093／TWD 34.467755** |

換算沿用 TWD 31.535／USD。這個接入後累計實付觀察值比 benchmark 的保守上界少 TWD 18.837096，且只使用 TWD 120 授權預算的 28.72%。OpenAI 後台 341,226 tokens 比事件檔 334,799 多 6,427，符合累計範圍含其他呼叫的可能性，但不是充分證明；Claude 後台的 8.8k 與 API usage 聚合口徑明顯不同，未取得帳單欄位定義前不強行換算。正式定價仍應採逐 request 帳務 ledger 或保守上界，不以這筆累計平均值當 P95。

## 供應商觀察

| Provider | 成功 | P95 latency | 累計 token | 搜尋計數 | 20 輪成本區間 |
|---|---:|---:|---:|---:|---:|
| OpenAI | 20／20 | 11.907 秒 | 334,799 | 35 | TWD 13.5096 |
| Google | 20／20 | 4.708 秒 | 9,567 | 37 | TWD 0.0905～17.0894 |
| Perplexity | 20／20 | 5.924 秒 | 5,049 | 0 | TWD 3.3131 |
| Anthropic | 20／20 | 9.238 秒 | 277,186 | 30 | TWD 19.3928 |

Perplexity 的 `usage.num_search_queries` 在 20 輪均回 0，但每輪都有 citations／search results 且 provider-reported cost 非零；這個欄位只能保存為供應商原始計數，不能解讀成「沒有搜尋」。Google 的上下界差異來自搜尋免費額度與 token 分拆未知，不可用下界做定價。

## 證據與限制

- 固定題組：`evidence/controlled-benchmark-inputs-20-v1.json`，SHA-256 `9e31f959cceeb3bcdfea9446a7ab74b484371cfc4bb8b23f1aa7b3c1e616f9ef`。
- Append-only 事件：`evidence/controlled-benchmark-2026-09-09.jsonl`；獨立彙總：`evidence/controlled-benchmark-2026-09-09.summary.json`。
- `npm.cmd run verify:official-benchmark` 重新核對 20 個 started／completed 配對、題目 hash、四家順序、沒有回答正文，並重算全部門檻。
- `n=20` 只支持本題組與本時段的前置穩定性；不等於正式 SLA、真實客戶價值、尖峰容量或長期模型相容性。
- 下一階段仍需先定前端使用者、資訊架構與 API key／tenant／保存政策，再實作公開介面；不得因本次通過而跳過正式資安與部署驗收。
