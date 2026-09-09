# AI provider adapters

Perplexity 負責目前 A 的搜尋觀測。DeepSeek 與 `structured-router.js` 處理結構化判讀；router 中的 OpenAI／Gemini 不是已完成的搜尋量測 adapter。

`brave.js`、`agnes.js` 為舊整合，保留供既有研究工具與相容入口使用。`usage-meter.js` 暫保留既有本機紀錄方式，不是計費帳本。

Developer API 的官方直連方向依 D-027／D-028，profile 登錄在 `services/api/application/official-engine-profiles.js`，介面在 `services/api/ports/search-provider.js`，實作在 `services/api/application/official-search-providers.js`。四個 model ID 與搜尋工具已於 2026-09-09 完成 D-036 的 20 輪受控 benchmark，20／20 四家全成；狀態只代表本題組與本時段的連線、解析、搜尋證據、成本與延遲成功，不代表 SLA、長期相容性或正式上線。DeepSeek 只可能在後續作為已保存觀測的統合輸出層，不是搜尋 adapter。
