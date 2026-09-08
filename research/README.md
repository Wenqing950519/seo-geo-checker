# Research workspace

| 位置 | 責任 |
|---|---|
| `inputs/` | 候選資料、entity master、題庫與研究登錄；draft 不等於已審核 |
| `outputs/` | 各次實驗的原始／衍生輸出、版本與 hash，保留歷史 |
| `sources/` | 外部取得的原始資料與來源紀錄 |
| `work/`、`scripts/`、`lib/` | 資料準備、實驗 CLI 與研究專屬 I/O；執行前查看參數及付費上限 |
| `*-audit-2026-08-21/` | 當時的審計、seed 與 ledger snapshot，不當作目前狀態重播 |

資料由原來 research-input、research-output、research-sources、research-work 搬入。原始證據保持 bytes 不變，內含舊 locator 時透過 [搬移表](../docs/maintenance/layout-migration-2026-09-08.json) 解析，不為美化路徑而改寫 JSONL／CSV。

正式白皮書入口仍是 `.agents/skills/geo-whitepaper-research/scripts/`。它們可透過 mock-api re-export 使用新實作，人工審核、凍結題組、entity coverage 與預算門檻保持。CLI 的 `--project-root` 指向 repository 根目錄；新輸入／輸出參數請用 `research/inputs/...`／`research/outputs/...`。

研究不依賴尚未存在的 Developer API；現有審計 seed 含當時主張與路徑，不應重新執行後把舊結論標為當日實測。需要重現舊狀態時使用原 commit 與搬移表。
