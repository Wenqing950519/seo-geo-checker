# AI provider adapters

Perplexity 負責目前的搜尋觀測。DeepSeek 與 `structured-router.js` 處理結構化判讀；router 中的 OpenAI／Gemini 不是已完成的搜尋量測 adapter，因此不先建立誤導性的獨立搜尋模組。

`brave.js`、`agnes.js` 為舊整合，保留供既有研究工具與相容入口使用。`usage-meter.js` 暫保留既有本機紀錄方式，不是計費帳本。未來依 API_CONTRACT 的 engine profile 與能力驗收逐個擴充，不先照供應商清單建立空實作。
