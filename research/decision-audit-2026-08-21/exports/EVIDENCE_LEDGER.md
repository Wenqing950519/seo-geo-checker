# Evidence Ledger

| Evidence | Claim | Polarity | Source | Locator | Passage |
|---|---|---|---|---|---|
| E-AIS-01 | DEC-R11 | SUPPORT | SRC-ACL-AIS | abstract | External-world NLG output should be verified against an independent provided source. |
| E-ALCE-01 | DEC-R11 | SUPPORT | SRC-ACL-ALCE | abstract | Citation generation can be evaluated for correctness and citation quality against human judgments. |
| E-ALGORITHM-GEMINI | DEC-R06 | SUPPORT | SRC-LOCAL-ALGORITHM | lines 25-38 and 48-63 | Algorithm V3 describes Gemini as the query-generation and profiling provider. |
| E-CHARTER-A4 | DEC-R14 | SUPPORT | SRC-LOCAL-CHARTER | sections 3.3 and 4.3 | The charter labels citation-to-acquisition as an unresolved gap and limits the analysis to exploratory correlation. |
| E-CHARTER-WEIGHTS | DEC-R03 | SUPPORT | SRC-LOCAL-CHARTER | sections 4.2 and 5 | The current V3 two-layer weights have no derivation basis and are uncalibrated provisional values. |
| E-CODE-DEEPSEEK | DEC-R06 | CONTRADICT | SRC-LOCAL-PIPELINE | lines 1-18 and 89-118 | The shared pipeline resolves query planning through the current structured router and labels unavailable planning as DeepSeek-related. |
| E-CURRENT-DEEPSEEK | DEC-R06 | CONTRADICT | SRC-LOCAL-CURRENT | lines 19-24 | Current state says DeepSeek replaces Gemini for profiling and query generation. |
| E-D002-IMPLEMENTED | DEC-R08 | CONTRADICT | SRC-LOCAL-ALGORITHM | lines 7-9 and 67-72 | Algorithm V3 states that Perplexity failure must return an unknown GEO score. |
| E-D002-STATUS | DEC-R08 | SUPPORT | SRC-LOCAL-DECISIONS | lines 56-63 and 250-257 | D-002 remains Proposed although it defines Perplexity failure as unknown rather than zero. |
| E-D012 | DEC-R10 | SUPPORT | SRC-LOCAL-DECISIONS | lines 161-168 | D-012 confirms the measurement/analysis separation direction but leaves signal details for P2. |
| E-D014-DECISION | DEC-R16 | PARTIAL | SRC-LOCAL-DECISIONS | lines 180-187 | D-014 records DeepSeek as better in same-condition API evaluation and keeps Luna/Gemini as fallbacks. |
| E-D014-EVAL | DEC-R16 | PARTIAL | SRC-LOCAL-BLIND-EVAL | comparison.md and comparison.json | The blind provider comparison has one controlled observation and both candidates failed the automated contract. |
| E-D019 | DEC-R09 | SUPPORT | SRC-LOCAL-DECISIONS | lines 234-246 | D-019 confirms measurement-layer separation and the product name AI Trust, while leaving variables, denominators, weights, missing values, caps, and validity thresholds undecided. |
| E-DECISION-WEIGHTS | DEC-R03 | SUPPORT | SRC-LOCAL-DECISIONS | lines 40-54 | D-001 records no reason for the 50/30/20 weights and defers derivation to P2. |
| E-DOC-D19-DATE | DEC-R18 | SUPPORT | SRC-LOCAL-DECISIONS | lines 1-4 and 234-246 | Decision log front matter says last_updated 2026-08-10 although D-019 is dated 2026-08-21. |
| E-DOC-METADATA | DEC-R18 | SUPPORT | SRC-LOCAL-CURRENT | lines 1-15 | The file front matter says last_updated 2026-08-10 while the body says updated 2026-08-01. |
| E-GENERALIZABILITY | DEC-R15 | SUPPORT | SRC-NASEM-RR | chapter 3, lines 81-96 | Generalizability concerns whether results apply in other contexts or populations. |
| E-IMPLEMENTATION-INNER | DEC-R04 | SUPPORT | SRC-LOCAL-IMPLEMENTATION | line 35 | The production implementation computes mentionRate times 40, citationRate times 30, and authority times 0.3. |
| E-IMPLEMENTATION-OUTER | DEC-R05 | SUPPORT | SRC-LOCAL-IMPLEMENTATION | lines 7-26 | The production implementation combines technical access 20, content citeability 30, and Perplexity observation 50. |
| E-KAPPA-01 | DEC-R11 | SUPPORT | SRC-NCBI-KAPPA | section 4.1.2 | Cohen's kappa is commonly used to assess interrater reliability for categorical variables. |
| E-L2 | DEC-R13 | SUPPORT | SRC-LOCAL-CHARTER | sections 7 and 8 | The project defines L2 as third-party access to original data, while L3 independent re-collection is not a current success condition. |
| E-NASEM-01 | DEC-R12 | SUPPORT | SRC-NASEM-RR | chapter 3, lines 77-101 | Reproducibility uses the same input data, methods, code, and analysis conditions. |
| E-NASEM-02 | DEC-R13 | SUPPORT | SRC-NASEM-RR | chapter 3, lines 78-96 | Replicability uses new data collection to test consistency with a previous study. |
| E-NASEM-03 | DEC-R13 | SUPPORT | SRC-NASEM-RR | chapter 3, lines 140-147 | Exact reproducibility does not guarantee correctness of the computation. |
| E-PROVIDER-DEPLOY | DEC-R19 | SUPPORT | SRC-LOCAL-CURRENT | lines 29-35 and 62-67 | DeepSeek is configured but still awaiting deployment-key verification; Perplexity had a recorded successful audit. |
| E-STANDARD-CAUSAL | DEC-R14 | SUPPORT | SRC-LOCAL-STANDARD | sections 10.5 and 11.3 | The research standard forbids writing observed association as causation without a design that identifies causal effects. |
| E-STANDARD-OUTCOMES | DEC-R11 | SUPPORT | SRC-LOCAL-STANDARD | section 11.2 | The research standard requires separate fields for identification, mention, recommendation, citation, correctness, rank position, and stability. |
| E-VALIDITY-01 | DEC-R01 | SUPPORT | SRC-ETS-MESSICK | abstract | Unified validity integrates content, criteria, and consequences into a construct framework. |
| E-VALIDITY-02 | DEC-R02 | SUPPORT | SRC-ETS-MESSICK | abstract | Validity concerns the appropriateness, meaningfulness, and usefulness of score-based inferences. |
| E-VERSION-SCORE | DEC-R07 | CONTEXT | SRC-LOCAL-IMPLEMENTATION | scoring-v2.js and geo-assessment.js | The implementation exposes ALGORITHM_VERSION 3.0.0 while geo-assessment exposes SCORING_VERSION 3.1.0. |
