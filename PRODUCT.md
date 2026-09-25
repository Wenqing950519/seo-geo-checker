# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **GeoCheck（`geocheck.lslabs.tw`）**：台灣中小品牌／店家老闆與行銷人，非技術背景，想知道 ChatGPT、Gemini、Perplexity、Claude 回答顧客問題時有沒有提到、引用自己的官網。同時是 LS-Labs 讀者「自己驗證研究」的證據面。
- **Platform（`platform.lslabs.tw`）**：要把四引擎引用觀測接進自家系統的開發者與代理商工程師；他們讀文件、拿 API key、看用量。

使用者已於 2026-09-25 確認上述理解。

## Product Purpose

GeoCheck 以固定四引擎實測，回答「AI 在回答你顧客的問題時，看得見你嗎」，並附上可檢查的原始回答與引用來源。Platform 把同一套量測以 `/v1` API、TypeScript SDK 與 Console 提供給開發者。依 D-051，兩者是 LS-Labs 研究室的 MVP 能力佐證，不是主要營利線；成功是「讀者與開發者能自己跑、自己看證據」。

## Positioning

量測而非建議：每個分數都能回到四個引擎的原始回答、引用網址與演算法版本（AI Trust Index v1）。缺資料是 `unknown`，不是 0 分。這是只做 SEO 清單或只給一個分數的工具無法誠實複製的立場。

## Operating Context

- 三層品牌（D-049）：品牌層 LS-Labs（`lslabs.tw`，研究發表主站）→ 能力層 GeoCheck（量測方法）→ 交付層：免費快檢、Dashboard（暫停，D-051）、Platform。
- GeoCheck 工具頁不重複主站行銷文案；說明與排名頁在 `lslabs.tw`。
- Platform 付款維持關閉；計費草案為預付額度、按用量扣款（D-053），審核通過前不得宣稱可購買。

## Capabilities and Constraints

- 前端為靜態 HTML／CSS／原生 JS，由 `services/api/server.js` 與 Cloudflare Pages／Worker 供應；無框架、無 build step（Dashboard 另計）。
- 固定四引擎：OpenAI、Google Gemini、Perplexity、Anthropic Claude（D-029）。引擎識別色見 LS-Labs tokens。
- 全成才扣量；冪等 key；非同步輪詢。
- Dashboard（`app.lslabs.tw`，`apps/web/app/`）暫停推進，不在本次視覺重構範圍。

## Brand Commitments

- 產品名稱：GeoCheck（by LS-Labs）、GeoCheck Track（Product A，D-050）、Platform By LS-Labs。
- 標誌正本在 LS-Labs repo `brand/logos/`；GeoCheck 標誌與 LS 標誌沿用。
- 與母品牌關係（使用者 2026-09-25 確認）：同一家族、各有個性——共用 LS 標誌、字體家族與 navy 夜色基底；GeoCheck 與 Platform 各有自己的主視覺語言與強調色。
- 語氣：繁體中文、直白、不誇大；不承諾排名或效果。

## Evidence on Hand

- 真實案例截圖：`apps/web/public/assets/real-site-apoint*.{png,jpg}`；量測架構圖 `measurement-architecture.jpg`。
- 白皮書、方法論：`apps/web/public/whitepaper.html`、`docs/AI_TRUST_INDEX_V1.md`。
- 沒有客戶名單、推薦語、公開 benchmark 排名或付費使用者數據，不得虛構。

## Product Principles

1. 證據先於分數：任何數字都要能展開到原始回答。
2. 不知道就說不知道：`unknown` 與 `0` 在介面上必須可區分。
3. 工具頁只做工具的事，研究與行銷回到 `lslabs.tw`。
4. 未開放的能力不假裝開放（付款、登入、額度以實際狀態為準）。

## Accessibility & Inclusion

LS-Labs tokens 已記錄 WCAG 2.1 對比實測值（2026-09-13 稽核）；新設計沿用 AA 下限。
