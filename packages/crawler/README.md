# Crawler adapters

現有 Node HTTP、Playwright、Scrapling／Python、Translate fallback、technical signals、citation resolution 與 URL safety 位於此處。它們有網路、瀏覽器或系統依賴，不屬純 geo-core，也不應進入 SDK。

Python helper 在 `scripts/scrapling-fetch.py`；安裝工具在根目錄 `scripts/runtime/`；既有 `.scrapling-runtime` 和 node_modules 路徑保留。`html-v2.js` 仍混有純 HTML 解析與抓取，後續抽取為獨立改善，不在目錄搬移中更改行為。
