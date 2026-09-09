# Developer SDK — not implemented

目前目錄只有邊界文件，沒有可安裝、可 import 或可實測的 SDK client，也尚未發布 npm。2026-09-09 已驗證的是 `/v1` HTTP fixture 合約與四家 server-side 官方 adapter，不等於 SDK 已存在。

首發語言、套件名稱、版本與 retry／polling 行為會形成公開契約，須由使用者拍板後再實作。SDK 只應包 HTTP、型別與輪詢，不打包 crawler、provider 金鑰、上游成本或 scoring 副本。
