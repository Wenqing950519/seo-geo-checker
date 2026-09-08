# P1 Claim Audit — GEO 研究假設與推論

日期：2026-08-14  
狀態：工作稽核；非正式決策、非對外結論  
範圍：本次對話中已提出的 GEO 定義、量測與「第三方來源／權威」推論。  
方法：依 `whitepaper-claim-auditor` 設計稿的原則，將複合主張拆為原子主張，分別找支持、反證、限制與替代解釋；所有證據均評估其與主張的 entailment，而非僅因主題相關即採用。

## 稽核摘要

| Verdict | 件數 |
|---|---:|
| VERIFIED | 0 |
| SUPPORTED | 0 |
| QUALIFIED | 2 |
| UNVERIFIED | 3 |
| CONTRADICTED | 1 |
| ORIGINAL_HYPOTHESIS / METHODOLOGICAL CHOICE | 4 |

核心結論：目前公開資料不足以支持「身分 > 曝光（流量）> 內容」或「大部落客／大量第三方提及會提高生成式引擎權重」這類通用因果規則。應把它們保留為待檢驗假設，不能寫成白皮書背景事實。Google 對其自家生成式搜尋的公開指引，反而明確反對不真實提及與以操縱排名為目的的連結／內容操作。

## Evidence register

| ID | 來源 | 品質 | 可用的 passage-level 證據（摘要） |
|---|---|---|---|
| E-01 | [Google: Optimizing for generative AI features](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)（2026-07） | A：平台官方技術文件 | Google 說生成式功能以核心搜尋排名與品質系統檢索可公開存取、可爬取、且符合呈現資格的頁面；也說刻意追求不真實的網路提及並無助益，並把獨特、有用、可靠內容列為重點。未公開個別訊號權重。 |
| E-02 | [Google: Helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)（2025-12） | A：平台官方技術文件 | Google 描述多因素系統與 E-E-A-T 概念；信任最重要，但 E-E-A-T 本身不是單一排名因子。作者／來源資訊、專業與內容品質均屬概念性訊號，未給固定排序。 |
| E-03 | [Google: Spam policies](https://developers.google.com/search/docs/essentials/spam-policies)（2026） | A：平台官方政策 | 為操縱搜尋排名而建立連結或低價值內容屬 link spam；以金錢、商品或服務交換含連結文章亦在列舉範圍。政策適用於 Google 搜尋結果，包括生成式 AI 回覆。 |
| E-04 | [Liu, Zhang & Liang, 2023, Findings of EMNLP](https://aclanthology.org/2023.findings-emnlp.467/) | A：同行評審會議論文 | 將「引用是否支持相連句子」與「回答是否被引用完整支持」分開評估；說明有 citation 不可自動視為正確或完整支持。研究平台與時間較早，不能外推其數值到今日系統。 |
| E-05 | [From Citation Selection to Citation Absorption](https://arxiv.org/abs/2604.25707)（2026） | C：預印本、跨平台觀察研究 | 提出 citation selection 與 citation absorption 為兩階段不同結果；在其資料中，頁面長度、結構、語意貼合與可擷取證據和吸收結果相關。這是觀察關聯，不是平台公布的因果權重。 |
| E-06 | [Chinese-language generative search citation study](https://arxiv.org/abs/2607.15771)（2026） | C：預印本、跨平台觀察研究 | 在所研究的中文生成搜尋系統中，citation pool 中的品牌只有部分會在回答裡被顯示；支持「被引來源」與「品牌在答案可見」應分開量測，但不證明因果。 |
| E-07 | [Perplexity: How does Perplexity work?](https://www.perplexity.ai/help-center/en/articles/10352895-how-does-perplexity-work)（2026-07） | A：平台官方產品文件 | Perplexity 說其回答流程包含即時網頁搜尋、彙整來源洞見與回答；每份回答含有連到原始來源的 citation。文件未保證每個答案內的個別主張或品牌都由可見 citation 逐一支持。 |
| E-08 | [OpenAI: How to search in ChatGPT](https://help.openai.com/en/articles/9237897-chatgpt-)（2026）與 [Does ChatGPT tell the truth?](https://help.openai.com/en/articles/8313428)（2026） | A：平台官方說明 | ChatGPT 可能依問題決定是否搜尋；使用搜尋的回答也只是「可能」出現 inline citations。未開啟搜尋時回答基於訓練資料；官方承認模型可能產生錯誤、誤導或虛構的內容／citation。 |
| E-09 | [Kirsten et al., 2026, Findings of ACL](https://aclanthology.org/2026.findings-acl.526/) | A：同行評審會議論文 | 比較 Google、OpenAI、Perplexity 的五個生成式搜尋系統，發現來源多樣性、內部／外部知識依賴與穩定性在系統間差異顯著；支持把 source diversity 當獨立量測面向，但不提供品牌 GEO 的權重或因果結論。 |
| E-10 | [Google: Search ranking systems guide](https://developers.google.com/search/docs/appearance/ranking-systems-guide)（2025-12） | A：平台官方技術文件 | Google 傳統搜尋的 site diversity system 通常限制同一 root site 在頂端結果中的數量，避免單一網站主導結果；這是傳統搜尋呈現規則，不能外推為生成式引用排序，但支持 root domain 是可重現的來源群組單位。 |
| E-11 | [Cochrane Handbook: reports versus studies](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04) | A：權威研究方法手冊 | 多份報告可能來自同一研究；若當成多個獨立研究會造成重複計算與偏誤。因此應同時保留各報告資訊，但以真正的分析單位彙整。此為方法學類比，不是生成式搜尋效應的直接證據。 |

## Evidence matrix

### C-001：來源被模型引用，本身即達到 GEO 的基本需求

- 類型：`METHODOLOGICAL / DEFINITIONAL`
- Verdict：`ORIGINAL_HYPOTHESIS / METHODOLOGICAL CHOICE`
- 稽核：這是在定義研究的「source-level GEO」，不是可由外部文獻判真假的事實。E-05 支持 citation selection 可獨立作為量測構面（`PARTIAL_SUPPORT`），但不能替作者決定「基本需求」的規範性位置。
- 必要限制：必須固定在研究設計中表述為「本研究將被引用的來源視為 source-level visibility」，不可寫成所有 GEO 領域的共識。

### C-002：若來源不能被引用，就不會有下一步的品牌被看見／直接出現在回答中

- 類型：`CAUSAL / NECESSITY`
- Verdict：`UNVERIFIED`
- 支持：E-07 支持在 Perplexity 的搜尋型回答中，流程通常是搜尋／彙整來源後作答，且回答有 citations。E-05、E-06 支持「引用來源」和「答案吸收／品牌露出」是可區分、可觀察的結果。
- 推論斷裂：E-07 沒有保證每個個別品牌提及都由可見 citation 支持。E-08 更表明一般 ChatGPT 回答可不搜尋，且可能產生錯誤內容；因此「被引用必是被回答收錄的前置」不能跨平台成立，也不能把無可見支持的提及直接歸為模型不夠聰明。
- 替代解釋：品牌原有辨識度、查詢設計、模型版本、地點實體辨識與回答模板。
- 建議表述：改為「在指定 Perplexity 搜尋模式下，本研究將檢驗品牌存在於可見引用來源，是否與品牌被回答正文收錄共同出現。」直接品牌提及但未能對應引用來源者應標為 `direct_answer_unattributed`，另做正確性查核，不預設其成因。

### C-003：第三方部落格被引用，即使餐廳未直接出現在答案，也算餐廳的『間接 GEO』

- 類型：`INTERPRETIVE / CAUSAL`
- Verdict：`QUALIFIED`
- 直接支持：E-05 的二階段框架、E-06 的品牌選擇率，都支持「來源被引」不能等同「來源提到的品牌被答案呈現」（對原主張為 `PARTIAL_SUPPORT`）。
- 不能支持的部分：沒有資料證明第三方頁面被引，會替其中餐廳帶來可見、信任或轉換效果。
- 可保留的定義：對該部落格／網域而言，它是 `source-level GEO`；對餐廳只能記為「可能相關的 third-party source exposure」，不得計入 `entity-level GEO` 成功。

### C-004：在「信義區有何餐廳推薦」的回答中，提到鼎泰豐品牌即可算品牌層級成功，不必列出特定信義門市

- 類型：`METHODOLOGICAL CHOICE`
- Verdict：`ORIGINAL_HYPOTHESIS / METHODOLOGICAL CHOICE`
- 稽核：這是品牌層級的 outcome definition，不是外部事實。可以採用，但需同時紀錄「品牌提及」與「地理資訊正確性」，以免把已無信義門市、地點錯置的品牌當成合格推薦。
- 依賴條件：研究母體必須以品牌去重；連鎖店多據點不能把一次品牌提及擴大成多個成功觀測值。

### C-005：提到品牌但資訊錯誤不計入合格分數；應在報告中獨立指出並追查可能原因

- 類型：`METHODOLOGICAL CHOICE`
- Verdict：`ORIGINAL_HYPOTHESIS / METHODOLOGICAL CHOICE`（品質分離的 rationale 為 `SUPPORTED`）
- 支持：E-04 直接支持 citation support / answer support 應獨立審核，故「曝光」不可代替「正確性」。
- 限制：是否歸零、如何處理 partial / unverifiable，是本研究的評分規則，不能說文獻已規定唯一答案。
- 可採用的最小欄位：`brand_mentioned`、`recommendation_strength`、`citation_present`、`claim_support`、`geographic_accuracy`、`factual_accuracy`。

### C-006：SEO 過去透過大量第三方作證，權威媒體收錄會使排名權重大增；餐飲小店可找大部落客撰文來做好 GEO

- 類型：`CAUSAL / GENERALIZATION`
- Verdict：`CONTRADICTED`（若主張包含付費、規模化或為操縱排名而安排的第三方提及）；其餘「自然第三方報導可能有關」部分為 `UNVERIFIED`。
- 反證：E-03 對為操縱排名而買賣連結、以商品／服務交換含連結文章、低價值內容等有明確反向政策。E-01 也明示不真實 mentions 並無助益。
- 推論斷裂：即使自然報導與可見度同時出現，也可能由既有品牌知名度、餐廳品質、媒體選題、連鎖規模或地點需求共同造成；不能由相關性推出「文章造成模型權重上升」。
- 建議表述：改為 `H-001`：「在預先定義來源類型、文章提及品質與時間窗後，檢驗第三方內容的存在是否與被引用／品牌提及率相關。」不得承諾效果或提供操作建議。

### C-007：模型判準是身分 > 曝光（流量）> 內容

- 類型：`COMPARATIVE / GENERALIZATION`
- Verdict：`UNVERIFIED`
- 直接證據：無。E-01、E-02 都只揭露多因素、技術可存取性、相關性、可靠性與內容品質的原則，未公開「身分、流量、內容」的定義或固定權重排序。
- 邊界／反證：E-01 對 Google 自家生成式功能特別強調獨特、可靠、非商品化內容，並稱追求不真實 mentions 無益；這至少不支持把流量／提及放在內容之前的通用排序。
- 建議：將三者拆成獨立欄位而非總權重：`source_identity_type`、`audience_reach_metric + measurement_date`、`claim_support_and_content_quality`。流量若資料來源不一致，第一版僅做探索性共變量。

### C-008：權威來源被模型引用本身代表 GEO 已有效果；使用者是否在回答中看見是第二階段

- 類型：`INTERPRETIVE / MEASUREMENT MODEL`
- Verdict：`QUALIFIED`
- 支持：E-05 直接支持把 citation selection 與 citation absorption 分成兩階段量測；E-06 支持 citation pool 與品牌在答案中的露出不同。
- 限制：`citation selection` 是可觀察事件，不自動等於「權威」或「商業有效果」。權威需預先定義來源分類；使用者可見／可行動性仍需另列 outcome。

### C-009：品牌能見度應以品牌實體為主、網站為來源／證據而非餐廳實體

- 類型：`METHODOLOGICAL CHOICE`
- Verdict：`ORIGINAL_HYPOTHESIS / METHODOLOGICAL CHOICE`
- 稽核：可使連鎖品牌的「一次回答提及」不被多門市重複計分，具資料治理上的合理性；但仍應保留門市／地理 eligibility 作為正確性查核，不可因品牌層級而忽略查詢地點。

### C-010：資訊錯誤可深挖其來源污染或幻覺成因，並作為白皮書加分項

- 類型：`CAUSAL / INTERPRETIVE`
- Verdict：`UNVERIFIED`
- 支持：E-04 支持必須查核 citation 是否確實支持回答，因此可做「可追溯來源是否支持」的稽核。
- 缺口：一次錯誤回答不足以辨認模型內部的「污染」或幻覺成因；可能只是網頁過時、entity resolution、檢索片段、模型整合或未引用資訊。除非有可重複實驗與直接證據，不得歸因為特定來源。
- 建議表述：報告可說「發現與已核實資料不符的回答；已／未能找到相符的公開來源」，避免使用「污染導致」等因果語氣。

### C-011：三篇不同來源提及品牌，應比同一來源的三篇文章有更高的間接 GEO 分數

- 類型：`COMPARATIVE / METHODOLOGICAL`
- Verdict：`QUALIFIED`
- 支持：E-09 直接支持 source diversity 是生成式搜尋中值得獨立量測且跨引擎會變動的維度。E-10 支持 root domain 可作為可重現的 site-level 群組單位。E-11 的研究方法原則支持：不能把高度相關的多個報告錯當成同樣多份獨立證據。
- 限制：E-09 沒有證明多一個 root domain 會提高品牌被回答收錄、模型信任或商業效果；E-10 也只適用 Google 傳統搜尋結果，非 Perplexity citation。不同網域仍可能是轉載、同集團媒體、共同新聞稿或內容農場，不能當作真正獨立性。
- 可辯護的量測方案：同時保留 `cited_url_count`、`unique_root_domain_count`、`source_type` 與可得時的 `syndication_or_common_owner_flag`。分析／產品層可讓不同 root domain 作為比同域多 URL 更高的「來源多樣性」訊號，但必須預先設定同域遞減與總上限，並稱為 proxy，不稱為已證明的獨立證據或 AI 信任。

## Human review queue

1. 是否正式採用雙層 outcome：`source-level visibility` 與 `entity-level visibility`？這是作者決策，而不是文獻替你選擇。
2. 是否同意第三方頁面被引時，只把它計為該網域的 source-level event；餐廳必須在答案中被提及才計 entity-level event？
3. `source_identity_type` 的分類是否要預註冊為：official / government-academic / editorial-media / independent-blog / directory-platform / UGC？
4. 流量是否只作探索變項？若要納入，必須預先鎖定同一資料供應商、量測日期、國家與判定缺值規則。
5. H-001 要驗證的是「相關性」還是「因果」？若是因果，需要 pre/post 與對照組，單次橫斷面引用資料不足。

## Audit limitations

- E-05、E-06 是預印本，適合作為方法設計的啟發與待複驗證證據，不能當平台內部機制的定論。
- Google 官方文件只適用 Google Search 的生成式功能，不能外推為 ChatGPT、Perplexity 或所有模型的排序規則。
- 本稽核尚未執行 GeoCheck 自有樣本的正式批次量測；所有品牌／餐飲層級效果仍未有本地實證。
- 本文件沒有提出任何優化操作建議，僅界定何種主張可被使用與必須保留的證據強度。
