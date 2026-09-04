# GeoCheck GA4 使用者旅程 Tracking

更新日期：2026-08-14  
Schema version：1.0  
GA4 Web Stream：`G-CBTTKVLT82`

## 目的與邊界

這套事件用來觀察「流量來源 → 開始使用 → 完成分析 → 查看結果 → 採取下一步 → 再次分析」的產品漏斗。它是產品行為資料，不是 GEO 效果、獲客因果或廣告增量效果的證據。

GA4 不會收到使用者輸入的受測網址、Email、姓名、聯絡內容或完整 referrer URL。報告頁的 browser title 也不包含受測網址，避免 GA4 自動帶入 `page_title`。自訂參數 `referrer` 只保留 hostname。UTM 會保留在同一瀏覽器 tab 的 `sessionStorage`，讓首頁進站後導向報告頁時仍沿用同一次來源；新的 browser session 不會沿用舊 Campaign。

## 共用事件參數

每個自訂事件都附帶以下欄位：

| 參數 | 說明 |
|---|---|
| `schema_version` | 目前為 `1.0` |
| `client_timestamp` | 瀏覽器觸發事件的 ISO 8601 時間；BigQuery 另有 GA4 原生 `event_timestamp` |
| `gc_anonymous_id` | 本站隨機匿名瀏覽器 ID，存於 `localStorage`；不是登入身分 |
| `gc_session_id` | 本 tab 的隨機 session ID，存於 `sessionStorage` |
| `page_route` | 觸發事件的 pathname，不含 query string |
| `entry_route` | 本 session 首次進入的 pathname |
| `utm_source` | 本 session 進站時的來源 |
| `utm_medium` | 本 session 進站時的媒介 |
| `utm_campaign` | 本 session 進站時的 Campaign |
| `utm_content` | 本 session 進站時的 Creative／內容標記 |
| `referrer` | 進站 referrer hostname，不含 path、query 或 fragment |
| `device_type` | `desktop`、`tablet` 或 `mobile`；GA4／BigQuery 也有原生 device category |

GA4 本身還會提供 `user_pseudo_id`、GA session、device、geo 與 traffic source 欄位。`gc_*` ID 是跨頁除錯與 SQL fallback；不建議在 GA4 UI 把匿名 ID、session ID、analysis ID 或 timestamp 註冊成高基數 Custom Dimension。

## 事件定義

| Event | 觸發時機 | 額外參數 | 去重規則 |
|---|---|---|---|
| `landing_view` | 首頁 tracking 初始化完成 | `journey_stage=landing`、`analysis_status=not_started` | 同一 browser session 只記一次；refresh 與 `/home`→`/` redirect 不重複 |
| `cta_click` | 點擊導向健檢輸入區的 CTA | `cta_id`、`journey_stage=cta_clicked` | 每次真實 click 各記一次；程式 render 不觸發 |
| `url_submitted` | URL form 通過瀏覽器驗證並 submit | `journey_stage=url_submitted`、`analysis_status=pending` | 每次有效 submit 一次；不附受測 URL |
| `analysis_started` | 一次使用者 submit 開始分析 | `analysis_sequence`、`is_repeat_analysis`、`analysis_stage=analysis_started`、`analysis_status=in_progress`、`submission_source` | API retry 不重複；只有新的 submit 才增加 |
| `analysis_completed` | 前端收到可導向的 report response | `analysis_id`、`analysis_sequence`、`analysis_stage=analysis_completed`、`analysis_status=completed`、`cache_hit` | 每次成功的使用者分析一次；cache hit 仍算完成 |
| `result_viewed` | 報告頁成功顯示；正式 Product Conversion／Activation | `analysis_id`、`analysis_sequence`、`is_repeat_analysis`、`journey_stage=result`、`analysis_stage=result_viewed`、`analysis_status=completed` | 同一 `analysis_id` + `analysis_sequence` 只記一次；reload 不重複，但再次主動分析即使命中同一 cache report 仍算新一次 |
| `recommendation_clicked` | 在報告頁點擊下一步 | `analysis_id`、`action_type`、`journey_stage=next_step`、完成狀態 | 每次真實 click 一次 |
| `second_analysis` | 同一 browser session 的第二次使用者分析開始 | 與第二次 `analysis_started` 相同 | 只在 `analysis_sequence=2` 時送一次；retry 不算第二次 |
| `analysis_failed` | 所有前端 retry 均失敗，或遇到不可重試錯誤 | `analysis_stage`、`analysis_status=failed`、`error_code` | 一次失敗 submit 一次；不送錯誤訊息或網址 |
| `lead_submitted` | 聯絡／回饋表單由 API 確認成功 | `journey_stage=lead_submitted`、`interest` | 每次成功送出一次；不送姓名、Email、網站或文字內容 |

`cta_id` 目前值：`nav_start_audit`、`hero_start_audit`、`report_preview_start_audit`、`project_start_audit`。

`action_type` 目前值：`download_report`、`book_report_interpretation`、`run_another_analysis`。

`analysis_sequence` 是目前 browser session 內第幾次使用者 submit。`is_repeat_analysis=true` 則代表同一 `gc_anonymous_id` 在這次 analysis 開始前，已經至少完成過一次 `result_viewed`；它可跨 browser session 保留，但仍會受到 storage 清除、隱私模式與換裝置影響。

## GA4 DebugView 與 Realtime 驗證

1. 在測試網址加入 `ga_debug=1`，例如：
   `https://geocheck.lisheng.cv/?ga_debug=1&utm_source=meta&utm_medium=paid_social&utm_campaign=debug_launch&utm_content=video_a`
2. 開啟 GA4 → **Admin** → **Data display** → **DebugView**。
3. 依序完成：首頁 → CTA → submit → 等待報告 → 報告下一步 → 回首頁 → 第二次 submit。
4. 在 DebugView 點開事件，核對 event name、UTM、`gc_session_id`、`analysis_sequence`、`analysis_id` 與狀態欄位。
5. 重新整理首頁，確認沒有第二個 `landing_view`；重新整理同一報告，確認沒有第二個相同 analysis ID + analysis sequence 的 `result_viewed`。
6. GA4 **Reports → Realtime** 可確認一般流量；DebugView 適合逐事件與參數除錯。也可使用 Google Tag Assistant 進入 debug mode。

`ga_debug=1` 只讓本站自訂事件帶 `debug_mode=true`。驗證後移除該 query parameter；DebugView 資料不應當作正式 Funnel 樣本。

## 建議的 GA4 Custom Definitions

為方便 Explore 與報表，建議註冊下列 event-scoped dimensions：

- `page_route`
- `utm_source`、`utm_medium`、`utm_campaign`、`utm_content`
- `referrer`
- `device_type`
- `journey_stage`、`analysis_stage`、`analysis_status`
- `cta_id`、`action_type`
- `submission_source`
- `cache_hit`
- `is_repeat_analysis`

`analysis_sequence` 可註冊為 event-scoped custom metric。不要註冊 `gc_anonymous_id`、`gc_session_id`、`analysis_id`、`client_timestamp` 為 GA4 UI dimension；它們適合 BigQuery join 與除錯。

## 建議的 Key Events

依 D-018，GA4 先只設定兩個 Key Events：

- `result_viewed`：Product Conversion／Activation。
- `lead_submitted`：Business Conversion。

`landing_view`、`cta_click`、`url_submitted`、`analysis_started`、`analysis_completed`、`recommendation_clicked`、`second_analysis` 與 `analysis_failed` 都維持一般 Funnel event，用來解釋 Activation 成功或失敗的原因。

Key Event 是 GA4 property 的後台設定，不由前端程式碼自動變更。正式部署並確認事件開始收件後，到 GA4 Admin 的 Events／Key events 設定中，只將 `result_viewed` 與 `lead_submitted` 標為 Key Event，並確認上述其他 Funnel events 未被標記。

## BigQuery Funnel 欄位

GA4 連結 BigQuery 後，daily table 為 `events_YYYYMMDD`；若啟用 streaming export，另有 `events_intraday_YYYYMMDD`。建立 Funnel 時可使用：

- 時間與順序：`event_timestamp`、`event_name`、`batch_event_index`
- 使用者：GA4 `user_pseudo_id`，必要時 fallback 到 event param `gc_anonymous_id`
- Session：event param `ga_session_id`，必要時 fallback 到 `gc_session_id`
- 流量來源：GA4 traffic-source 欄位與 event params `utm_source`、`utm_medium`、`utm_campaign`、`utm_content`、`referrer`
- Funnel：`journey_stage`、`analysis_stage`、`analysis_status`、`analysis_sequence`、`is_repeat_analysis`
- 分析串接：`analysis_id`
- 行動細分：`cta_id`、`action_type`
- 品質控制：`cache_hit`、`error_code`、`schema_version`
- 裝置：GA4 `device.category`，或 event param `device_type`

SQL 分析時應先依 `user_pseudo_id`（必要時 fallback 至 `gc_anonymous_id`）與 `event_timestamp` 排序，再以 GA session 分段分析。Campaign／Creative 的 Activation Rate 定義為 `有 result_viewed 的使用者或 session / 有 landing_view 的使用者或 session`；採 user-based 或 session-based 分母、排除條件、日期範圍與 debug traffic 必須事先固定。

成功重複使用不是 `second_analysis` 本身。SQL 必須找到同一 anonymous user 的首次 `result_viewed`，再確認之後存在新的 `analysis_started`，且同一新流程依序完成 `analysis_completed → result_viewed`。`analysis_sequence` 與 `is_repeat_analysis` 用於輔助檢查，但仍應以事件時間順序確認完整流程。

## 已知準確度限制

- 現有網站不是 SPA；首頁與報告頁是 full-page navigation。因此沒有 SPA router 自動 page-view 重複問題，產品事件全部綁定真實 DOM interaction 或成功 response。
- `landing_view` 採 session 去重；`result_viewed` 以 analysis ID + analysis sequence 去重。單純 refresh 不增加事件，新的使用者 submit 則會增加。
- 瀏覽器阻擋 Analytics、廣告攔截器、使用者清除 storage、Safari／隱私模式限制 storage，都會造成漏記或 ID 變動。
- 報告目前只存在 server memory；server restart 後舊 report URL 可能 404。這會影響 `result_viewed`，但不是 tracking 本身造成。
- `analysis_completed` 是「前端收到成功 report」，不是使用者已閱讀內容；閱讀行為由 `result_viewed` 表示。
- `second_analysis` 目前是同 browser tab session 的第二次 submit，不是跨日 retention。
- 現有 `/api/audit-real-lite` 會在讀取 audit cache 前先檢查同網址 cooldown。同一網址在 cooldown 內再次送出會產生 `second_analysis`，隨後是 `analysis_failed`，不會有 `analysis_completed`。因此成功的重複使用應定義為 `second_analysis` 後仍出現 `analysis_completed`，或直接用 `analysis_sequence >= 2 AND analysis_status = completed`；若要讓同網址立即重跑，需另外由產品負責人決定是否調整 rate-limit／cache 順序。
- GA4 UI、BigQuery export 與廣告平台歸因模型可能有定義差異；不能只靠 raw UTM 就宣稱廣告造成轉換。

## 官方參考

- [Google：Set up events](https://developers.google.com/analytics/devguides/collection/ga4/events)
- [Google：Monitor events in DebugView](https://support.google.com/analytics/answer/7201382)
- [Google：GA4 BigQuery Export schema](https://support.google.com/analytics/answer/7029846)
- [Google：gtag.js configuration and campaign fields](https://developers.google.com/analytics/devguides/collection/ga4/reference/config)
