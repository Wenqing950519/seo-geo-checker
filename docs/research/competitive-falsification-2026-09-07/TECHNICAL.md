# 公開頁面技術逆向：Hogiah、Peec AI、Profound

本階段完成公開DOM／路由／初始表單狀態觀察，**未完成網路請求攔截及檢測回應驗證**。工具只有瀏覽器DOM操作與頁面資源，沒有network interception、HAR或DevTools請求介面；未臆造端點、mock payload，亦未使用既有草稿的未證實API列表冒充本次結果。研究時間2026-09-07。

選擇Peec與Profound是分析判斷：前者直接搶顧問／agency的工作流，後者的panel需求資料反駁「別人只會固定prompt」；Ahrefs對方法差異化同樣構成重大威脅，但本階段深查維持使用者指定的額外兩家範圍。

## 可重現觀察

| 證據ID | 頁面／DOM位置 | 本次看到什麼 | 可以／不可以推論什麼 |
|---|---|---|---|
| HT01 | [Hogiah首頁](https://www.hogiah.com/zh-TW)，script src | `_next/static/chunks/`及`turbopack-`資源指紋 | I：Next.js/Turbopack；不能識別DB、任務queue、LLM供應商代理 |
| HT02 | 同頁website input | `type=text`、`required=true`、pattern空；placeholder網站範例 | O：不是原生type=url；U：自訂URL正規化、驗證程式與錯誤訊息未觸發 |
| HT03 | 同頁CTA及說明 | 快查、10項AI可讀性、提交資料／匿名研究條款 | F：行銷流程宣稱；沒有按下送出，不能證明後續跑哪些請求 |
| HT04 | [Hogiah signup](https://www.hogiah.com/zh-TW/auth/signup) | required email、Google、referral欄、同意條款、continue初始disabled | O：登入／註冊入口；U：驗證優先順序／身分provider／success state |
| HT05 | [Hogiah plans](https://www.hogiah.com/zh-TW/plans) | self-service engines、台灣範圍；海外／城市enterprise；整合coming soon | F：商業規格，不是payload有region／locale欄位的證據 |
| PT01 | [Peec pricing](https://peec.ai/pricing) | generator `Framer 8a671e2`；月／年toggle可改變價格 | O：marketing站Framer，不能外推app也是Framer |
| PT02 | [Peec app](https://app.peec.ai/) | 初始loading後註冊；Google／Microsoft／SSO；work email；disabled magic-link；`/sign-in` | O：公開app狀態；U：身份完成後project/onboarding流程 |
| PT03 | 同app script src | `https://storage.googleapis.com/peec-mordor-assets-prd/assets/index-BS4x3faM.js` | I：獨立打包client app；U：確切框架、路由庫、後端及storage schema |
| RT01 | [Profound pricing](https://www.tryprofound.com/pricing) | `_next/static/chunks/` | I：Next.js指紋；不代表全系統架構 |
| RT02 | [Profound welcome](https://app.tryprofound.com/welcome) | `_next/static/immutable/chunks/`；email欄type=text、required；continue disabled；中文文案 | O：公開welcome gate；U：輸入驗證實作、locale傳輸參數、登入後檢測流程 |

沒有下載、複製或重建競品bundle。靜態資源路徑僅作技術指紋摘錄，不是API端點。

## 流程狀態：已觀察與未觀察分開

```text
Hogiah：首頁空白URL表單 [O]
       → 使用者輸入 [未提交]
       → URL驗證／送出／排程／輪詢／成功結果／錯誤與重試 [全部U]
       官網另有「快查→報告」敘述 [F，不能代替請求證據]
       signup：空email＋同意條款狀態 [O] → 驗證／帳號建立 [U]

Peec：app loading [O] → signup／magic-link／SSO入口 [O]
      → 登入 → project → 選題 → 執行 → 結果 [U，本次未越過入口]

Profound：welcome email form [O]
          → 身分確認 → brand/project設定 → 執行 → 結果 [U]
```

三者不一定提供相同的「匿名網址→即時結果」漏斗。把Peec／Profound登入前頁面硬還原成Hogiah的流程，会製造不存在的觀察。

## 公開API、資料模型、引擎執行結論

| 要求 | Hogiah | Peec | Profound |
|---|---|---|---|
| 無登入API endpoint＋method | U，無network證據 | U，無network證據 | U，無network證據 |
| request params／response格式 | U | U | U |
| job／polling／websocket／retry | U | U | U |
| 結果儲存模型／DB | U | U | U |
| 引擎 | F：方案6個，enterprise另議 | F：基本3個、更多另購／enterprise | F：Starter1、Growth3、enterprise9 |
| region／locale | F：方案台灣／enterprise其他地區；實際欄位U | F：multi-country功能；實際欄位U | F：panel region文件；實際執行欄位U |
| 採用consumer UI還是API；確切model version | U | U | U |

**僅可提出的邏輯模型假設 I**：這類產品的畫面至少需要brand/project、prompt、engine/surface、execution time、answer observation、mention/citation與aggregate。但資料可以即時計算、不一定逐欄持久化；不能從feature表推斷競品資料表、外鍵、cache、API response或prompt orchestration。GeoCheck若建模，應另外保存query版本、region、validity、raw evidence與分母，這是建議，不是逆向結果。

## 如何補齊缺口

後續需要具request/response擷取能力的瀏覽器session，只使用正常公开表單操作；記錄時間、來源頁、method、URL、已遮蔽PII的request、status、response與畫面狀態一一對照。若點擊會建立帳號、接受合約或產生付費檢測，需先確認該操作範圍。遇登入即停止，不列舉隱藏endpoint、不嘗試auth bypass。未完成前，不得把本檔命名為已完成API逆向。
