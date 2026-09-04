from pathlib import Path
import sys

SKILL_ROOT = Path(r"C:\Users\eason\Documents\skill\academic-search")
sys.path.insert(0, str(SKILL_ROOT))

from src.contracts import (
    ActionRecord,
    ActionType,
    AnalysisArtifact,
    ArtifactStatus,
    ClaimStatus,
    Document,
    EvidencePolarity,
    ResearchClaim,
    ResearchEvidence,
    Source,
)
from src.store import ResearchStore


DB = Path("research/academic-audit-2026-08-21/research-final.db")


SOURCES = [
    ("SRC-GOOGLE-ROBOTS", "Google Search Central: Robots.txt introduction", 2026, "https://developers.google.com/search/docs/crawling-indexing/robots/intro", "official_documentation", "A-official"),
    ("SRC-SITEMAPS-ORG", "Sitemaps protocol overview", 2020, "https://www.sitemaps.org/", "standards_documentation", "A-standard"),
    ("SRC-GOOGLE-DEV-GUIDE", "Google Search developer guide", 2026, "https://developers.google.com/search/docs/fundamentals/get-started-developers", "official_documentation", "A-official"),
    ("SRC-GOOGLE-JS", "Google JavaScript SEO basics", 2026, "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics", "official_documentation", "A-official"),
    ("SRC-GOOGLE-AI", "Google guidance on generative AI features", 2026, "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide", "official_documentation", "A-official"),
    ("SRC-GOOGLE-STRUCTURED", "Google structured data guidelines", 2026, "https://developers.google.com/search/docs/appearance/structured-data/sd-policies", "official_documentation", "A-official"),
    ("SRC-GOOGLE-CRAWLERS", "Google common crawlers and fetchers", 2026, "https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers", "official_documentation", "A-official"),
    ("SRC-GOOGLE-SITEMAP-OVERVIEW", "Google Sitemaps overview", 2026, "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview", "official_documentation", "A-official"),
    ("SRC-SCHEMA-ORG", "Schema.org shared vocabulary", 2026, "https://schema.org/", "standards_documentation", "A-standard"),
    ("SRC-OPENAI-PUBLISHERS", "OpenAI Publishers and Developers FAQ", 2026, "https://help.openai.com/en/articles/12627856-publishers-and-developers-faq", "official_documentation", "A-official"),
    ("SRC-ANTHROPIC-CRAWLERS", "Anthropic crawler controls", 2024, "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler", "official_documentation", "A-official"),
    ("SRC-RFC-9309", "Robots Exclusion Protocol RFC 9309", 2022, "https://www.rfc-editor.org/rfc/rfc9309.html", "standards_documentation", "A-standard"),
    ("SRC-ACL-ALCE", "Enabling Large Language Models to Generate Text with Citations", 2023, "https://aclanthology.org/2023.emnlp-main.398/", "peer_reviewed_paper", "A-peer-reviewed"),
    ("SRC-ACL-AIS", "Measuring Attribution in Natural Language Generation Models", 2023, "https://aclanthology.org/2023.cl-4.2/", "peer_reviewed_paper", "A-peer-reviewed"),
    ("SRC-CITATION-CAPACITY", "On the Capacity of Citation Generation by Large Language Models", 2024, "https://arxiv.org/abs/2410.11217", "preprint", "B-preprint"),
    ("SRC-LLM-VARIABILITY", "Same Prompt, Different Outcomes: Evaluating the Reproducibility of Data Analysis by LLMs", 2026, "https://arxiv.org/abs/2602.14349", "preprint", "B-preprint"),
    ("SRC-LOCAL-REPOSITORY", "GeoCheck repository, current implementation and executed tests", 2026, "C:/Users/eason/Documents/geocheck", "local_repository", "A-local-executed"),
    ("SRC-LOCAL-P1-REVIEW", "GeoCheck P1 human work review", 2026, "docs/P1_HUMAN_WORK_REVIEW_2026-08-09.md", "local_research_record", "A-local-record"),
]


EVIDENCE = [
    ("E-GOOGLE-ROBOTS-01", "SRC-GOOGLE-ROBOTS", "WP-R01", "A robots.txt file is not a mechanism for keeping a web page out of Google.", "SUPPORT", "Google official documentation states that robots.txt controls crawling, not reliable exclusion from indexing.", "https://developers.google.com/search/docs/crawling-indexing/robots/intro#what_is_robots_txt_used_for"),
    ("E-SITEMAPS-01", "SRC-SITEMAPS-ORG", "WP-R02", "Using the Sitemap protocol does not guarantee that web pages are included in search engines.", "SUPPORT", "The Sitemap protocol is a crawling/discovery hint, not an inclusion or ranking guarantee.", "https://www.sitemaps.org/#what"),
    ("E-GOOGLE-DEV-01", "SRC-GOOGLE-DEV-GUIDE", "WP-R03", "While Google does run JavaScript, there are some differences and limitations that you need to account for.", "SUPPORT", "Google documents crawler rendering limitations and the difference between user view and Google view.", "https://developers.google.com/search/docs/fundamentals/get-started-developers#check_javascript"),
    ("E-GOOGLE-JS-01", "SRC-GOOGLE-JS", "WP-R03", "Google is able to process content within JavaScript as long as it isn't blocked.", "SUPPORT", "This supports the whitepaper's distinction between JavaScript presence and content that is unavailable to crawlers.", "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide#javascript"),
    ("E-GOOGLE-AI-01", "SRC-GOOGLE-AI", "WP-R05", "The best practices for SEO continue to be relevant because our generative AI features on Google Search are rooted in our core Search ranking and quality systems.", "SUPPORT", "This is bounded to Google's generative AI features; it cannot be generalized to every answer engine.", "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide#is-seo-still-relevant"),
    ("E-GOOGLE-AI-02", "SRC-GOOGLE-AI", "WP-R06", "LLMS.txt files and other special markup are not required to appear in Google Search, including generative AI capabilities.", "SUPPORT", "This supports treating llms.txt as non-guaranteeing and not as a universal ranking signal.", "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide#what-you-need-to-know"),
    ("E-GOOGLE-AI-03", "SRC-GOOGLE-AI", "WP-R06", "Structured data isn't required for generative AI search, and there's no special schema.org markup you need to add.", "SUPPORT", "This contradicts any stronger claim that Schema alone increases generative citation or guarantees visibility.", "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide#structured-data"),
    ("E-GOOGLE-STRUCTURED-01", "SRC-GOOGLE-STRUCTURED", "WP-R06", "Google does not guarantee that your structured data will show up in search results.", "SUPPORT", "Structured data may support eligibility for features, but the source explicitly denies a display guarantee.", "https://developers.google.com/search/docs/appearance/structured-data/sd-policies"),
    ("E-GOOGLE-CRAWLERS-01", "SRC-GOOGLE-CRAWLERS", "WP-R04", "Google-Extended does not impact a site's inclusion in Google Search nor is it used as a ranking signal in Google Search.", "SUPPORT", "This official documentation separates training/grounding controls from Google Search inclusion and ranking; the conclusion is vendor-specific.", "https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers#google-extended"),
    ("E-GOOGLE-SITEMAP-OVERVIEW-01", "SRC-GOOGLE-SITEMAP-OVERVIEW", "WP-R02", "A sitemap helps search engines discover URLs on your site, but it doesn't guarantee that all the items in your sitemap will be crawled and indexed.", "SUPPORT", "This is the primary Google documentation for the discovery-versus-indexing distinction.", "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview"),
    ("E-SCHEMA-ORG-01", "SRC-SCHEMA-ORG", "WP-R06", "Schema.org is a collaborative, community activity with a mission to create, maintain, and promote schemas for structured data on the Internet.", "SUPPORT", "Schema.org defines a shared vocabulary; this passage does not establish ranking, citation, or trust effects.", "https://schema.org/"),
    ("E-OPENAI-BOTS-01", "SRC-OPENAI-PUBLISHERS", "WP-R04", "For your site content to be included in summaries and snippets in ChatGPT, make sure you aren't blocking OAI-SearchBot.", "SUPPORT", "OpenAI distinguishes the search crawler from GPTBot training controls; this is product-specific guidance.", "https://help.openai.com/en/articles/12627856-publishers-and-developers-faq"),
    ("E-ANTHROPIC-BOTS-01", "SRC-ANTHROPIC-CRAWLERS", "WP-R04", "Claude-SearchBot navigates the web to improve search result quality for users.", "SUPPORT", "Anthropic documents a search-specific crawler distinct from other crawler purposes.", "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler"),
    ("E-RFC-ROBOTS-01", "SRC-RFC-9309", "WP-R01", "The Robots Exclusion Protocol defines user-agent groups and longest-match path rules.", "SUPPORT", "RFC 9309 is the standards source for the parser behavior described in the whitepaper.", "https://www.rfc-editor.org/rfc/rfc9309.html#section-2.2.2"),
    ("E-ALCE-01", "SRC-ACL-ALCE", "WP-R08", "Current systems have considerable room for improvement in citation quality, and automatic citation metrics can be compared with human judgments.", "SUPPORT", "The ACL paper evaluates citation correctness and quality and reports correlation with human judgments; it does not validate GeoCheck's weights.", "https://aclanthology.org/2023.emnlp-main.398/"),
    ("E-AIS-01", "SRC-ACL-AIS", "WP-R08", "NLG output pertaining to the external world is to be verified against an independent, provided source.", "SUPPORT", "AIS supports the whitepaper's separation of generated interpretation from independent evidence verification.", "https://aclanthology.org/2023.cl-4.2/"),
    ("E-CITATION-01", "SRC-CITATION-CAPACITY", "WP-R08", "The essence of RAG in combating hallucination lies in accurately attributing claims in responses to corresponding retrieved documents.", "SUPPORT", "This supports citation correctness as a distinct evaluation dimension, not a causal claim about ranking or trust.", "https://arxiv.org/abs/2410.11217"),
    ("E-LLM-VARIABILITY-01", "SRC-LLM-VARIABILITY", "WP-R09", "The study reports considerable variation in analytical results even for consistent configurations.", "PARTIAL", "This recent preprint supports a reproducibility risk for LLM-assisted scoring, but it is not evidence that every model or deployment varies identically.", "https://arxiv.org/abs/2602.14349"),
    ("E-LOCAL-R10", "SRC-LOCAL-REPOSITORY", "WP-R10", "Executed repository check: algorithmVersion 3.0.0; ruleCount 25; totalWeight 100; npm.cmd test exited with code 0.", "SUPPORT", "Direct local execution and current source code verify the implementation fact.", "mock-api/lib/scoring-v2.js; npm.cmd test"),
    ("E-LOCAL-R11", "SRC-LOCAL-REPOSITORY", "WP-R11", "Current geo-assessment code assigns technical_access weight 20, content_citeability weight 30, and perplexity_observation weight 50.", "SUPPORT", "Direct current source code verifies the implemented formula; no external source validates the chosen weights.", "mock-api/lib/geo-assessment.js"),
    ("E-LOCAL-R12", "SRC-LOCAL-REPOSITORY", "WP-R12", "Current tests and provider configuration identify DeepSeek V4 Flash as the structured provider and remove the retired Gemini proxy routes.", "SUPPORT", "Current repository evidence contradicts treating Gemini as the current primary provider.", "mock-api/tests/deepseek-provider.test.js; mock-api/tests/model-config.test.js"),
    ("E-LOCAL-R13", "SRC-LOCAL-REPOSITORY", "WP-R13", "Current geo-assessment code adds a Perplexity observation lane and returns null when Perplexity evidence is insufficient.", "SUPPORT", "Current source and tests verify that the technical-only 100-point model is not the complete current production assessment.", "mock-api/lib/geo-assessment.js; mock-api/tests/geo-assessment.test.js"),
    ("E-LOCAL-BP01", "SRC-LOCAL-P1-REVIEW", "BP-R01", "Formal sample approval and formal batch execution had not occurred; 140 candidates and 46 domains remained pending in the 2026-08-09 review.", "CONTRADICT", "The local P1 review contradicts reading the blueprint's target 100-store/516-run design as a completed study.", "docs/P1_HUMAN_WORK_REVIEW_2026-08-09.md#4.2"),
    ("E-LOCAL-BP02", "SRC-LOCAL-P1-REVIEW", "BP-R02", "The P1 review states that no restaurant visibility, platform-difference, GEO-effect, or causal conclusion may be formed before the formal research run.", "CONTRADICT", "This is the current governance record for the status of H1-H5.", "docs/P1_HUMAN_WORK_REVIEW_2026-08-09.md#1"),
    ("E-LOCAL-BP03", "SRC-LOCAL-P1-REVIEW", "BP-R03", "Reproducible analysis requires a frozen codebook, raw runs, eligibility decisions, locked analysis data, and executed artifacts.", "SUPPORT", "The review records these as unfinished gates; formulas alone are insufficient for reproducibility.", "docs/P1_HUMAN_WORK_REVIEW_2026-08-09.md#7"),
]


CLAIMS = [
    ("WP-R01", "robots.txt controls crawler access and should not be treated as a reliable indexing exclusion", "SUPPORTED", ["E-GOOGLE-ROBOTS-01"], "Official Google documentation directly supports the bounded claim."),
    ("WP-R02", "sitemaps help discovery/crawling but do not guarantee indexing or ranking", "SUPPORTED", ["E-SITEMAPS-01"], "The standard source directly supports the non-guarantee; ranking implications remain bounded."),
    ("WP-R03", "JavaScript rendering can create a difference between user-visible content and crawler-visible content", "SUPPORTED", ["E-GOOGLE-DEV-01", "E-GOOGLE-JS-01"], "Google documentation directly describes rendering limitations and crawler/user-view differences."),
    ("WP-R04", "search crawlers and training crawlers are distinct policy categories", "SUPPORTED", ["E-OPENAI-BOTS-01", "E-ANTHROPIC-BOTS-01"], "Official vendor documents support the distinction for those vendors; it is not universal beyond documented products."),
    ("WP-R05", "Google generative AI features rely on core Search systems and do not require special GEO markup", "SUPPORTED", ["E-GOOGLE-AI-01", "E-GOOGLE-AI-02", "E-GOOGLE-AI-03"], "Supported for Google Search only; do not generalize to Perplexity, ChatGPT, or Claude."),
    ("WP-R06", "structured data or llms.txt guarantees higher AI citation visibility", "CONTRADICTED", ["E-GOOGLE-AI-02", "E-GOOGLE-AI-03", "E-GOOGLE-STRUCTURED-01"], "Official Google guidance explicitly rejects a guarantee; any whitepaper sentence stronger than eligibility/interpretability must be removed."),
    ("WP-R07", "citation presence alone proves that a source caused a recommendation", "CONTRADICTED", ["E-ALCE-01", "E-AIS-01", "E-CITATION-01"], "The literature treats citation correctness/attribution as an evaluation problem; a displayed citation does not identify causal influence."),
    ("WP-R08", "independent evidence and human-reviewed attribution are necessary for evaluating generated claims", "SUPPORTED", ["E-AIS-01", "E-ALCE-01", "E-CITATION-01"], "The bounded evaluation principle is supported, but the whitepaper must specify its own annotation protocol."),
    ("WP-R09", "LLM output variability is a reproducibility risk for score-determining use", "PARTIAL", ["E-LLM-VARIABILITY-01"], "A preprint supports the risk; this is a methodological rationale, not a universal law."),
    ("WP-R10", "the current repository contains 25 deterministic rules totaling 100 points", "SUPPORTED", ["E-LOCAL-R10"], "Verified by executed repository code and passing npm.cmd test; this is local implementation evidence, not an academic claim."),
    ("WP-R11", "the current GEO assessment combines technical access 20%, content citeability 30%, and Perplexity observation 50%", "SUPPORTED", ["E-LOCAL-R11"], "Verified by current mock-api/lib/geo-assessment.js and tests; weight validity remains unestablished."),
    ("WP-R12", "the current system uses Gemini 3.1 Flash-Lite as its primary structured provider", "CONTRADICTED", ["E-LOCAL-R12"], "The dated V3 whitepaper says this, but current repository decisions and tests identify DeepSeek V4 Flash as primary, with fallbacks."),
    ("WP-R13", "the current whitepaper's technical-only 100-point score is the complete current production score", "CONTRADICTED", ["E-LOCAL-R13"], "Current code adds a separate GEO assessment layer with Perplexity observation; the whitepaper is a historical snapshot and must be labeled as such."),
    ("BP-R01", "the Taiwan Xinyi research protocol is a completed 100-store, 3-platform, 516-run study", "CONTRADICTED", ["E-LOCAL-BP01"], "The blueprint specifies a target design; P1 review records that formal sample approval and formal batch execution had not occurred."),
    ("BP-R02", "H1-H5 are established findings about restaurant visibility and platform differences", "CONTRADICTED", ["E-LOCAL-BP02"], "They are preregistered hypotheses and require the planned observations; they must remain hypotheses until data are collected and analyzed."),
    ("BP-R03", "EMR, share of voice, prominence, citation support, and factual accuracy are reproducible analysis definitions", "PARTIAL", ["E-LOCAL-BP03"], "The blueprint provides formulas and fields, but reproducibility still requires frozen codebook, raw runs, eligibility decisions, and executed analysis artifacts."),
]


def source_record(row):
    source_id, title, year, url, source_type, quality = row
    return Source(
        source_id=source_id,
        provider="web",
        provider_id=url,
        title=title,
        year=year,
        url=url,
        source_type=source_type,
        publication_status="published_or_official",
        metadata={"source_quality": quality, "retrieval": "web_search_and_open", "review_date": "2026-08-21"},
    )


with ResearchStore(DB) as store:
    source_quality = {row[0]: row[-1] for row in SOURCES}
    for row in SOURCES:
        store.upsert_source(source_record(row))
        source_id, title, _, url, _, quality = row
        document_id = f"DOC-{source_id}"
        store.upsert_document(Document(
            document_id=document_id,
            source_id=source_id,
            title=title,
            content=f"Source URL: {url}\nEvidence passages are recorded in the evidence table.",
            locator=url,
            mime_type="text/html",
            metadata={"source_quality": quality, "retrieval_ref": "web.open/search"},
        ))
        store.log_action(ActionRecord(
            action_id=f"ACT-FETCH-{source_id}",
            action_type=ActionType.SOURCE_FETCHED,
            status="SUCCESS",
            target_id=source_id,
            provider="web",
            detail={"url": url, "source_quality": quality, "note": "Opened or retrieved during audit; exact evidence passage recorded below."},
        ))

    evidence_by_claim = {}
    for evidence_id, source_id, claim_id, passage, polarity, rationale, locator in EVIDENCE:
        evidence_by_claim.setdefault(claim_id, []).append(evidence_id)
        store.upsert_evidence(ResearchEvidence(
            evidence_id=evidence_id,
            source_id=source_id,
            document_id=f"DOC-{source_id}",
            claim_id=claim_id,
            passage=passage,
            locator=locator,
            polarity=EvidencePolarity[polarity],
            retrieval_query=f"whitepaper audit {claim_id}",
            score=1.0,
            source_quality=source_quality[source_id],
            metadata={"rationale": rationale, "review_date": "2026-08-21"},
        ))
        store.log_action(ActionRecord(
            action_id=f"ACT-EVIDENCE-{evidence_id}",
            action_type=ActionType.EVIDENCE_RETRIEVED,
            status="SUCCESS",
            target_id=evidence_id,
            provider="web",
            query=f"whitepaper audit {claim_id}",
            detail={"source_id": source_id, "locator": locator, "polarity": polarity},
        ))

    for claim_id, text, status, evidence_ids, rationale in CLAIMS:
        store.upsert_claim(ResearchClaim(
            claim_id=claim_id,
            text=text,
            status=ClaimStatus[status],
            evidence_ids=evidence_ids,
            counterevidence_ids=[],
            rationale=rationale,
            human_review_required=status in {"PARTIAL", "CONTRADICTED", "UNRESOLVED"},
        ))
        store.log_action(ActionRecord(
            action_id=f"ACT-CITATION-{claim_id}",
            action_type=ActionType.CITATION_VERIFIED,
            status="SUCCESS" if evidence_ids else "PARTIAL",
            target_id=claim_id,
            provider="audit",
            detail={"status": status, "evidence_ids": evidence_ids, "rationale": rationale},
        ))

    store.upsert_analysis(AnalysisArtifact(
        analysis_id="ANALYSIS-NPM-TEST-2026-08-21",
        title="GeoCheck current test suite",
        status=ArtifactStatus.EXECUTED,
        command="npm.cmd test",
        input_locator="mock-api/tests/",
        output_locator="terminal-exit-0-2026-08-21",
        summary="All configured Node.js tests exited successfully; this verifies current implementation behavior, not external construct validity.",
        metadata={"exit_code": 0, "scope": "mock-api/tests"},
    ))
    store.log_action(ActionRecord(
        action_id="ACT-ANALYSIS-NPM-TEST-2026-08-21",
        action_type=ActionType.ANALYSIS_EXECUTED,
        status="SUCCESS",
        target_id="ANALYSIS-NPM-TEST-2026-08-21",
        provider="local_node",
        detail={"command": "npm.cmd test", "exit_code": 0},
    ))
    store.upsert_analysis(AnalysisArtifact(
        analysis_id="ANALYSIS-LEGACY-CLAIM-AUDIT-2026-08-21",
        title="Legacy candidate claim extraction audit",
        status=ArtifactStatus.EXECUTED,
        command="audit_document.py",
        input_locator="GEOCheck_Technical_Whitepaper_V3_2026-07-16.docx (mechanically extracted), 2026_台灣餐飲_AI搜尋能見度_白皮書研究藍圖.md",
        output_locator="research/academic-audit-2026-08-21/legacy-v3/audit.json; research/academic-audit-2026-08-21/legacy-blueprint/audit.json",
        summary="Legacy extractor produced 431 V3 candidate claims and 234 blueprint candidate claims; these are candidate inventories, not final verdicts.",
        metadata={"v3_claim_candidates": 431, "blueprint_claim_candidates": 234},
    ))
    store.log_action(ActionRecord(
        action_id="ACT-ANALYSIS-LEGACY-CLAIM-AUDIT-2026-08-21",
        action_type=ActionType.ANALYSIS_EXECUTED,
        status="SUCCESS",
        target_id="ANALYSIS-LEGACY-CLAIM-AUDIT-2026-08-21",
        provider="academic-search",
        detail={"command": "audit_document.py", "outputs": ["legacy-v3/audit.json", "legacy-blueprint/audit.json"]},
    ))

    store.log_action(ActionRecord(
        action_id="ACT-REVIEW-2026-08-21",
        action_type=ActionType.REVIEW_EXECUTED,
        status="SUCCESS",
        provider="academic-search",
        detail={"profile": "geo-whitepaper", "mode": "full", "scope": "V3 technical whitepaper plus Taiwan research blueprint", "openalex": "UNAVAILABLE", "local_legacy_claim_candidates": {"v3": 431, "blueprint": 234}},
    ))

print(f"Seeded {len(SOURCES)} sources, {len(EVIDENCE)} evidence passages, and {len(CLAIMS)} grouped claims into {DB}")
