# SEO/GEO Website Modular Scaffold

這是一個「內容模組化」網站打底包。目的不是重做整個網站，而是把目前 landing page 的文字與區塊資料從 HTML/React component 裡抽出來，讓之後可以：

- 只改 `content/*.json` 就調整文案
- 保留固定 UI component，不讓版面每次重寫
- 未來接 Editor.js、CMS 或資料庫時沿用同一份 schema
- 交給 Claude/Codex/工程協作者時，有明確資料邊界

## 建議整合方式

將以下資料夾複製到 Next.js 專案：

```text
content/
components/
lib/
types/
```

然後在 `app/page.tsx` 使用：

```tsx
import { getHomepageContent, getFaqContent, getSampleReport } from "@/lib/content";
import { HomePage } from "@/components/HomePage";

export default function Page() {
  return (
    <HomePage
      content={getHomepageContent()}
      faq={getFaqContent()}
      sampleReport={getSampleReport()}
    />
  );
}
```

## 目前檔案

```text
content/homepage.json       首頁所有區塊文案
content/sample-report.json  報告範例資料
content/faq.json            FAQ 與透明聲明
types/content.ts            TypeScript 型別
lib/content.ts              讀取 JSON 的 helper
components/HomePage.tsx     首頁組裝
components/sections/*.tsx   各區塊 component
```

## 下一步

1. 把這包整合進正式 Next.js 專案。
2. 先用 JSON 直接改文案。
3. 等文案與區塊穩定後，再考慮接 Editor.js 或 CMS。

