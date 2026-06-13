# 技術 SEO 檢查清單

這份清單是 seo-audit 的單一真實來源。要增減檢查項目,直接編輯這裡即可,流程不用改。
標 `[腳本]` 的項目由 `scripts/audit_checks.py` 自動檢查;其餘需要逐項判斷。

## 頁面層級

- [腳本] title:存在、唯一、長度約 15–60 字元、含主要關鍵字
- [腳本] meta description:存在、長度約 50–160 字元
- [腳本] H1:每頁恰好一個;H 階層不跳級
- [腳本] canonical:存在;是否指向正確版本需人工判斷
- [腳本] 結構化資料:有 JSON-LD;類型是否合適(Article、FAQPage、Product…)需人工判斷
- [腳本] 圖片 alt:缺 alt 的比例
- [腳本] 內鏈:頁面對站內其他頁的連結數;找出孤島頁
- og:title / og:description / og:image 是否齊全
- 內容是否回答了該頁目標關鍵字的搜尋意圖(判斷題,非規則題)
- 內容是否符合 `strategy.md` 的定位,並承接 `icp.md` 的高價值情境
- 是否使用 `evidence-inventory.md` 中的具體證據,而非空泛主張

## 站台層級

- robots.txt:存在、沒有誤擋重要路徑、列出 sitemap
- sitemap.xml:可取得、URL 都回 200、沒有大量重導向
- llms.txt:存在與否(GEO 加分項);內容是否涵蓋主要頁面
- HTTPS 與 www/非 www 是否統一重導向
- 404 處理:隨機測幾個不存在路徑

## 嚴重度分級

| 級別 | 定義 | 例子 |
|------|------|------|
| critical | 直接影響收錄或排名 | robots 誤擋、canonical 錯誤、title 重複 |
| warning | 影響表現但不致命 | meta 過長、缺結構化資料 |
| info | 加分項 | 缺 llms.txt、og 標籤不全 |

輸出時按 critical → warning → info 排序,同級內以「修復成本低」優先。
