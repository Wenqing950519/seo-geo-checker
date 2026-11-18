# LS-Labs GeoCheck｜MCAC 離線判讀核心

把一次 AI 搜尋的回答、來源網址、品牌名稱及官網資料交給判讀程式，就能算出品牌提及、官網引用、聯絡資料和行動入口四項結果。隨附案例的問題、回答與商家資料均為合成。執行程式時只讀本機檔案，無須 API 金鑰。

## 跑第一個案例

從 [GitHub Release](https://github.com/Wenqing950519/seo-geo-checker/releases/tag/mcac-core-0.2.0-replay.1) 取得 `mcac-core-0.2.0-replay.1.tar.gz`，解壓縮後，在含有 `scripts` 與 `packages` 的目錄執行下列命令。使用原始碼時，從儲存庫根目錄執行相同命令。範例使用 Node.js 24。

```sh
node scripts/mcac/replay.cjs
node tests/regression/mcac-replay.test.js
```

第一個命令輸出判讀 JSON。打開[案例輸入](examples/noodle-shop.json)，可以對照每題的回答與來源。兩道推薦題中有一道提到這家店，排第一名。四題中有三題列出官網，地址和電話一致，行動題提供官網與電話。四項分別得 21、25、20、20 分，總覽分是 **86**。

第二個命令驗證包含缺答在內的結果。把第二道推薦題 `d2` 的 `status` 改成 `failed`，並移除該題的 `answer` 和 `citations`，就能重算缺答時的分數。提及的分母從兩題變成一題，四項仍可計分，總覽分成為 **100**。比較兩份報告時，先看各有幾題取得回答。

## 放入自己的資料

可以複製範例 JSON、換上自己的資料，再指定檔案路徑：

```sh
node scripts/mcac/replay.cjs my-case.json
```

| 欄位 | 要放的內容 |
|---|---|
| `methodVersion`、`siteHost` | 方法版本 `0.2.0` 與受測網站的主機名稱，例如 `noodle-shop.example`。 |
| `brandNames` | 本次核對的品牌名稱與別名。名稱改變，提及結果也可能改變。 |
| `truth` | 檢測當時從商家頁面取得的電話、地址等基準。沿用範例物件格式；當時頁面沒有資料可填 `{}`。 |
| `probes` | 最多兩道推薦題（`discovery`）、一道事實題（`fact`）與一道行動題（`action`）。每筆記下 `id`、`type`、`query`、`status`。已回答的題目標 `answered`，填入 `answer` 原文和 `citations` 網址陣列。執行失敗則標 `failed`，答案留空。 |
| `resolvedUrls`（選填） | 當次已查得的來源轉址對照表。填入原網址與落地網址，離線核對時就能辨認實際網域。 |

結果的 `mention.n` 是有效推薦回答數，`citation.n` 是全部有效回答數。`accuracy.fields` 保留電話與地址各自的比對結果，`conversion.actions` 列出可用入口。`score.breakdown` 可查每項得分，`score.value` 是報告上的總覽分。重算時請保存原始輸入與使用的程式版本。重新向 AI 提問會產生另一筆觀測。

## 公開權重與計分版本

本版使用 `mcac-flags-v0` 判讀四項結果，按 `exposure_funnel_v1` 計分。這組權重用於 LS-Labs GeoCheck 單次快檢的報告總覽。四項皆可計分時，加總後四捨五入為整數；任一項為未知，`score.value` 為 `null`。

| 項目 | 滿分 | 給分方式 |
|---|---:|---|
| 提及 | 35 | 提到品牌的題數 ÷ 有效推薦回答數 × 28。曾被提及再依最佳名次加分：第 1–3 名加 7，第 4–10 名加 4，其餘提及加 2。該項取到小數第一位。 |
| 引用來源 | 25 | 以全部有效回答為分母。至少 3/4 的回答列出官網，得 25 分；至少一半得 22 分；其餘有列出官網得 14 分；皆未列出得 0 分。 |
| 資訊正確性 | 20 | 電話與地址各占 10 分。一致得 10，AI 未提供得 3，商家頁面無資料可核對得 2，不一致得 0。若只有一欄有可計分的狀態，該欄分數加倍。 |
| 行動資訊 | 20 | 有可使用的入口得 12 分，含官網入口再加 5 分，入口達兩種以上再加 3 分。有效回答沒有入口得 0 分。 |

報告依總覽分顯示四個區間：80–100 為「能見度優異」，60–79 為「具備基礎能見度」，35–59 為「能見度待補強」，0–34 為「能見度偏低」。四項原始證據、門檻與案例解讀見[方法白皮書](https://geocheck.lslabs.tw/whitepaper#mcac-score)。題組版本為 `mcac-probes-0.2.0`，可查閱[出題模板](probes.js)與[判讀、計分函式](evaluate.js)。

## 授權與檔案範圍

[MIT License](LICENSE) 適用於[發行清單](release-files.txt)逐一列出的核心程式、共用名稱比對程式、使用說明、測試及自製案例。商業使用、修改與散布均依 MIT 條款辦理。儲存庫其他目錄的研究資料、個別報告、品牌圖像與線上服務各依原有權利與條款管理。
