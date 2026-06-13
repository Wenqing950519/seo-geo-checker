# SEO/GEO 自動化 Skill — 流程規劃

## 定位

一個 skill(`seo-geo`),內含四個模式。手動觸發或排程觸發皆可。通用設計,之後換網站只需改 config。

## 檔案結構

```
seo-geo/
├── SKILL.md              # 主流程與模式路由
├── config.json           # 網站 URL、sitemap、競品、Telegram 設定
├── questions.json        # GEO 目標問題集(20–50 題)
├── scripts/
│   ├── crawl.py          # 抓頁面、解析 meta / schema / 內鏈
│   └── diff.py           # 比對本次與上次結果
├── data/
│   ├── audits/           # seo-audit 結果(JSON,以日期命名)
│   └── geo/              # geo-test 結果(JSON 時間序列)
├── drafts/               # content-brief 產出,人工審核
└── reports/              # 週報
```

## 四個模式

### 1. seo-audit(技術檢查)
1. 讀 config → 抓 sitemap → 爬主要頁面
2. 檢查:title/meta、H 結構、schema.org、canonical、內鏈、圖片 alt、robots/sitemap、llms.txt
3. 輸出 `data/audits/audit-YYYYMMDD.json` + 與上次 diff
4. 產出問題清單,按「影響 × 修復成本」排優先級

### 2. geo-test(AI 引用實測)— 核心價值
1. 讀 `questions.json` 問題集
2. 每題對 AI 搜尋(web search / Perplexity 等)實測,**每題跑 3 次**(降低隨機性)
3. 記錄:是否被引用、引用排序、被引用的頁面、競品是否被引用
4. 輸出 `data/geo/geo-YYYYMMDD.json`,計算引用率,與上次 diff
5. 對「未被引用」的問題,標註對應頁面的改善建議(可引用性:數據、出處、自含段落)

### 3. content-brief(內容機會)
1. 從 GSC(connector 或手動匯出 CSV)取得查詢數據
2. 篩選:高曝光低點擊、排名 5–15 名的關鍵字
3. 對照 geo-test 中未被引用的問題,找重疊主題
4. 每個機會產出一份簡報(目標關鍵字、搜尋意圖、大綱、GEO 結構建議)→ `drafts/`
5. **只產草稿,不自動發布**

### 4. seo-report(週報)
1. 彙整 `data/` 最近數據:GSC 趨勢、audit 問題增減、AI 引用率變化
2. 重點呈現 **diff**(比上週好/壞了什麼),不是靜態快照
3. 輸出到 `reports/`,可推 Telegram

## 排程建議

| 頻率 | 動作 |
|------|------|
| 每週一 | seo-audit + geo-test |
| 每週五 | seo-report → Telegram |
| 每月 | content-brief |

## 建置順序

1. **Phase 1**:骨架 + config + seo-audit(最快能跑)
2. **Phase 2**:geo-test + 問題集 + 時間序列存檔(最有價值)
3. **Phase 3**:seo-report + Telegram 推播 + 排程
4. **Phase 4**:content-brief(需接 GSC)

## 設計原則

- 每次結果落地成 JSON,skill 永遠做 diff,沒有狀態就沒有趨勢
- 自動化停在草稿層,人工把關發布
- geo-test 單次結果無意義,看多次平均的引用率
