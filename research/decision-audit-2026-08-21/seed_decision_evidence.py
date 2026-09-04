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


DB = Path("research/decision-audit-2026-08-21/research.db")


SOURCES = [
    ("SRC-ETS-MESSICK", "Messick: Foundations of Validity", 1993, "https://www.ets.org/research/policy_research_reports/publications/report/1993/hxne.html", "research_report", "A-peer-reviewed-method"),
    ("SRC-NASEM-RR", "Reproducibility and Replicability in Science", 2019, "https://www.nationalacademies.org/read/25303/chapter/3", "consensus_report", "A-authoritative"),
    ("SRC-APA-STANDARDS", "Standards for Educational and Psychological Testing", 2014, "https://www.apa.org/science/programs/testing/standards", "professional_standard", "A-standard"),
    ("SRC-NCBI-KAPPA", "Measures of Agreement and Approaches to Modeling", 2010, "https://www.ncbi.nlm.nih.gov/books/NBK519796/", "government_methodology", "A-authoritative"),
    ("SRC-ACL-ALCE", "Enabling Large Language Models to Generate Text with Citations", 2023, "https://aclanthology.org/2023.emnlp-main.398/", "peer_reviewed_paper", "A-peer-reviewed"),
    ("SRC-ACL-AIS", "Measuring Attribution in Natural Language Generation Models", 2023, "https://aclanthology.org/2023.cl-4.2/", "peer_reviewed_paper", "A-peer-reviewed"),
    ("SRC-LOCAL-CHARTER", "GeoCheck Project Charter", 2026, "C:/Users/eason/Documents/geocheck/docs/PROJECT_CHARTER.md", "local_governance_record", "A-local-record"),
    ("SRC-LOCAL-DECISIONS", "GeoCheck Decision Log", 2026, "C:/Users/eason/Documents/geocheck/docs/DECISION_LOG.md", "local_governance_record", "A-local-record"),
    ("SRC-LOCAL-ALGORITHM", "GeoCheck Algorithm V3.0.0", 2026, "C:/Users/eason/Documents/geocheck/ALGORITHM_V3.md", "local_method_specification", "A-local-spec"),
    ("SRC-LOCAL-CURRENT", "GeoCheck Current State", 2026, "C:/Users/eason/Documents/geocheck/docs/CURRENT_STATE.md", "local_operational_record", "A-local-record"),
    ("SRC-LOCAL-STANDARD", "GeoCheck Research Standard", 2026, "C:/Users/eason/Documents/geocheck/docs/RESEARCH_STANDARD.md", "local_research_standard", "A-local-standard"),
    ("SRC-LOCAL-CONSTRUCT", "P1 Construct Working Notes", 2026, "C:/Users/eason/Documents/geocheck/docs/P1_CONSTRUCT_WORKING_NOTES.md", "local_research_record", "A-local-record"),
    ("SRC-LOCAL-HUMAN-REVIEW", "P1 Human Work Review", 2026, "C:/Users/eason/Documents/geocheck/docs/P1_HUMAN_WORK_REVIEW_2026-08-09.md", "local_research_record", "A-local-record"),
    ("SRC-LOCAL-IMPLEMENTATION", "GeoCheck current implementation", 2026, "C:/Users/eason/Documents/geocheck/mock-api/lib/geo-assessment.js", "local_implementation", "A-local-executed"),
    ("SRC-LOCAL-PIPELINE", "GeoCheck shared measurement pipeline", 2026, "C:/Users/eason/Documents/geocheck/mock-api/lib/geo-measurement.js", "local_implementation", "A-local-executed"),
    ("SRC-LOCAL-BLIND-EVAL", "Blind DeepSeek/Luna provider evaluation", 2026, "C:/Users/eason/Documents/geocheck/research-output/blind-deepseek-luna-2026-08-01T12-11-00/comparison.md", "local_evaluation_record", "A-local-record"),
]


EVIDENCE = [
    ("E-VALIDITY-01", "SRC-ETS-MESSICK", "DEC-R01", "Unified validity integrates content, criteria, and consequences into a construct framework.", "SUPPORT", "The external method source supports defining the construct and intended score interpretation before treating a score as meaningful.", "abstract"),
    ("E-VALIDITY-02", "SRC-ETS-MESSICK", "DEC-R02", "Validity concerns the appropriateness, meaningfulness, and usefulness of score-based inferences.", "SUPPORT", "Repeatable computation alone does not establish that a score measures the intended construct.", "abstract"),
    ("E-NASEM-01", "SRC-NASEM-RR", "DEC-R12", "Reproducibility uses the same input data, methods, code, and analysis conditions.", "SUPPORT", "This supports the decision to freeze and preserve query sets, raw outputs, code, parameters, and environment metadata.", "chapter 3, lines 77-101"),
    ("E-NASEM-02", "SRC-NASEM-RR", "DEC-R13", "Replicability uses new data collection to test consistency with a previous study.", "SUPPORT", "The project L2 gate is narrower than full reproducibility and does not by itself establish replicability.", "chapter 3, lines 78-96"),
    ("E-NASEM-03", "SRC-NASEM-RR", "DEC-R13", "Exact reproducibility does not guarantee correctness of the computation.", "SUPPORT", "This separates code replay from validity and correctness claims.", "chapter 3, lines 140-147"),
    ("E-KAPPA-01", "SRC-NCBI-KAPPA", "DEC-R11", "Cohen's kappa is commonly used to assess interrater reliability for categorical variables.", "SUPPORT", "The research standard's requirement for independent coding and agreement statistics is methodologically grounded.", "section 4.1.2"),
    ("E-ALCE-01", "SRC-ACL-ALCE", "DEC-R11", "Citation generation can be evaluated for correctness and citation quality against human judgments.", "SUPPORT", "Citation presence, support, and quality are separate measurable outcomes.", "abstract"),
    ("E-AIS-01", "SRC-ACL-AIS", "DEC-R11", "External-world NLG output should be verified against an independent provided source.", "SUPPORT", "This supports separating generated answers from independent evidence and attribution review.", "abstract"),
    ("E-CHARTER-WEIGHTS", "SRC-LOCAL-CHARTER", "DEC-R03", "The current V3 two-layer weights have no derivation basis and are uncalibrated provisional values.", "SUPPORT", "The charter explicitly prevents treating the current weights as validated external conclusions.", "sections 4.2 and 5"),
    ("E-DECISION-WEIGHTS", "SRC-LOCAL-DECISIONS", "DEC-R03", "D-001 records no reason for the 50/30/20 weights and defers derivation to P2.", "SUPPORT", "The decision log confirms that the weight issue is unresolved rather than academically justified.", "lines 40-54"),
    ("E-IMPLEMENTATION-INNER", "SRC-LOCAL-IMPLEMENTATION", "DEC-R04", "The production implementation computes mentionRate times 40, citationRate times 30, and authority times 0.3.", "SUPPORT", "The inner scoring formula is in code, but it is absent from ALGORITHM_V3.md's formal scoring table.", "line 35"),
    ("E-IMPLEMENTATION-OUTER", "SRC-LOCAL-IMPLEMENTATION", "DEC-R05", "The production implementation combines technical access 20, content citeability 30, and Perplexity observation 50.", "SUPPORT", "This verifies current code behavior, not the validity of the chosen weights.", "lines 7-26"),
    ("E-ALGORITHM-GEMINI", "SRC-LOCAL-ALGORITHM", "DEC-R06", "Algorithm V3 describes Gemini as the query-generation and profiling provider.", "SUPPORT", "The dated algorithm specification still contains the retired provider description.", "lines 25-38 and 48-63"),
    ("E-CURRENT-DEEPSEEK", "SRC-LOCAL-CURRENT", "DEC-R06", "Current state says DeepSeek replaces Gemini for profiling and query generation.", "CONTRADICT", "The current operational record conflicts with the provider description in ALGORITHM_V3.md.", "lines 19-24"),
    ("E-CODE-DEEPSEEK", "SRC-LOCAL-PIPELINE", "DEC-R06", "The shared pipeline resolves query planning through the current structured router and labels unavailable planning as DeepSeek-related.", "CONTRADICT", "Current code and tests identify the implementation path as DeepSeek-first, not Gemini-first.", "lines 1-18 and 89-118"),
    ("E-VERSION-SCORE", "SRC-LOCAL-IMPLEMENTATION", "DEC-R07", "The implementation exposes ALGORITHM_VERSION 3.0.0 while geo-assessment exposes SCORING_VERSION 3.1.0.", "CONTEXT", "The version identifiers are individually valid but the combined production scoring identity is not represented by one clear public spec version.", "scoring-v2.js and geo-assessment.js"),
    ("E-D002-STATUS", "SRC-LOCAL-DECISIONS", "DEC-R08", "D-002 remains Proposed although it defines Perplexity failure as unknown rather than zero.", "SUPPORT", "The decision status is explicitly unresolved in the governance record.", "lines 56-63 and 250-257"),
    ("E-D002-IMPLEMENTED", "SRC-LOCAL-ALGORITHM", "DEC-R08", "Algorithm V3 states that Perplexity failure must return an unknown GEO score.", "CONTRADICT", "The operational rule is treated as implemented while the formal decision remains Proposed.", "lines 7-9 and 67-72"),
    ("E-D019", "SRC-LOCAL-DECISIONS", "DEC-R09", "D-019 confirms measurement-layer separation and the product name AI Trust, while leaving variables, denominators, weights, missing values, caps, and validity thresholds undecided.", "SUPPORT", "This is a valid boundary decision, not a final formula.", "lines 234-246"),
    ("E-D012", "SRC-LOCAL-DECISIONS", "DEC-R10", "D-012 confirms the measurement/analysis separation direction but leaves signal details for P2.", "SUPPORT", "The architecture direction is confirmed while the operational schema remains provisional.", "lines 161-168"),
    ("E-STANDARD-OUTCOMES", "SRC-LOCAL-STANDARD", "DEC-R11", "The research standard requires separate fields for identification, mention, recommendation, citation, correctness, rank position, and stability.", "SUPPORT", "The local standard is internally aligned with the citation and attribution literature.", "section 11.2"),
    ("E-STANDARD-CAUSAL", "SRC-LOCAL-STANDARD", "DEC-R14", "The research standard forbids writing observed association as causation without a design that identifies causal effects.", "SUPPORT", "The A4 decision follows the project's own highest-level research standard.", "sections 10.5 and 11.3"),
    ("E-CHARTER-A4", "SRC-LOCAL-CHARTER", "DEC-R14", "The charter labels citation-to-acquisition as an unresolved gap and limits the analysis to exploratory correlation.", "SUPPORT", "The decision is appropriately conservative and keeps the causal claim out of formal conclusions.", "sections 3.3 and 4.3"),
    ("E-GENERALIZABILITY", "SRC-NASEM-RR", "DEC-R15", "Generalizability concerns whether results apply in other contexts or populations.", "SUPPORT", "The Perplexity-only scope must not be generalized to every answer engine.", "chapter 3, lines 81-96"),
    ("E-L2", "SRC-LOCAL-CHARTER", "DEC-R13", "The project defines L2 as third-party access to original data, while L3 independent re-collection is not a current success condition.", "SUPPORT", "This is a project gate; it is narrower than the external definitions of reproducibility and replicability.", "sections 7 and 8"),
    ("E-D014-EVAL", "SRC-LOCAL-BLIND-EVAL", "DEC-R16", "The blind provider comparison has one controlled observation and both candidates failed the automated contract.", "PARTIAL", "The artifact can support a preliminary observation about token use and invalid-query counts, not a robust provider superiority claim.", "comparison.md and comparison.json"),
    ("E-D014-DECISION", "SRC-LOCAL-DECISIONS", "DEC-R16", "D-014 records DeepSeek as better in same-condition API evaluation and keeps Luna/Gemini as fallbacks.", "PARTIAL", "The decision is user-confirmed, but its empirical rationale should be downgraded to a one-run preliminary benchmark until repeated evaluation is complete.", "lines 180-187"),
    ("E-PROVIDER-DEPLOY", "SRC-LOCAL-CURRENT", "DEC-R19", "DeepSeek is configured but still awaiting deployment-key verification; Perplexity had a recorded successful audit.", "SUPPORT", "Repository readiness and production readiness are separate states and must not be collapsed in the whitepaper.", "lines 29-35 and 62-67"),
    ("E-DOC-METADATA", "SRC-LOCAL-CURRENT", "DEC-R18", "The file front matter says last_updated 2026-08-10 while the body says updated 2026-08-01.", "SUPPORT", "The current-state document has stale or conflicting date metadata and needs a controlled update before publication.", "lines 1-15"),
    ("E-DOC-D19-DATE", "SRC-LOCAL-DECISIONS", "DEC-R18", "Decision log front matter says last_updated 2026-08-10 although D-019 is dated 2026-08-21.", "SUPPORT", "The governance source's metadata is stale relative to its newest formal decision.", "lines 1-4 and 234-246"),
]


CLAIMS = [
    ("DEC-R01", "The decision layer correctly identifies construct definition as preceding score design", "SUPPORTED", ["E-VALIDITY-01", "E-CHARTER-WEIGHTS"], "The charter's P2 order is consistent with construct-validity theory and its own diagnosis of premature operationalization."),
    ("DEC-R02", "Repeatable computation alone would not establish that AI Trust or the current score measures the intended construct", "SUPPORTED", ["E-VALIDITY-02", "E-NASEM-03"], "Validity and computational reproducibility are separate claims."),
    ("DEC-R03", "The current 50/30/20 outer weights and 40/30/0.3 inner weights are uncalibrated provisional values", "SUPPORTED", ["E-CHARTER-WEIGHTS", "E-DECISION-WEIGHTS"], "This is explicitly documented; no external evidence has validated the values."),
    ("DEC-R04", "ALGORITHM_V3.md fully specifies every production scoring weight", "CONTRADICTED", ["E-IMPLEMENTATION-INNER"], "The inner production formula is in code and charter/decision notes but absent from the V3 formal scoring table."),
    ("DEC-R05", "The current production pipeline implements outer 20/30/50 lanes and an inner visibility formula", "SUPPORTED", ["E-IMPLEMENTATION-OUTER", "E-IMPLEMENTATION-INNER"], "Verified as an implementation fact only; weight validity remains unresolved."),
    ("DEC-R06", "ALGORITHM_V3.md is current and consistent about the structured provider", "CONTRADICTED", ["E-ALGORITHM-GEMINI", "E-CURRENT-DEEPSEEK", "E-CODE-DEEPSEEK"], "The dated V3 document still says Gemini while current governance and code are DeepSeek-first."),
    ("DEC-R07", "The public V3.0.0 identifier unambiguously identifies the entire current scoring pipeline", "CONTRADICTED", ["E-VERSION-SCORE"], "Algorithm version 3.0.0 and scoring version 3.1.0 are both exposed; the public specification does not resolve their relationship."),
    ("DEC-R08", "Unknown-on-missing-Perplexity-evidence is a formally confirmed decision", "CONTRADICTED", ["E-D002-STATUS", "E-D002-IMPLEMENTED"], "It is implemented and documented as a rule but remains Proposed in the formal decision log."),
    ("DEC-R09", "D-019 confirms only the AI Trust naming and layer boundary, not the final formula", "SUPPORTED", ["E-D019"], "The decision log explicitly leaves formula, denominators, weights, missing-value handling, caps, and validity thresholds open."),
    ("DEC-R10", "Measurement-layer and analysis-layer separation is direction-confirmed but not yet a complete schema", "SUPPORTED", ["E-D012", "E-D019"], "The decision is correctly marked direction confirmed and detail provisional."),
    ("DEC-R11", "The decision documents correctly separate identification, mention, recommendation, citation, correctness, and stability", "SUPPORTED", ["E-STANDARD-OUTCOMES", "E-ALCE-01", "E-AIS-01", "E-KAPPA-01"], "The separation is methodologically supported; the project's coding protocol still needs execution and reliability results."),
    ("DEC-R12", "Frozen query sets, raw outputs, methods, code, parameters, and environment metadata are required for computational reproducibility", "SUPPORTED", ["E-NASEM-01"], "The project requirements are stricter and more operational than a simple prose description, which is appropriate."),
    ("DEC-R13", "The project's L2 raw-data-access gate is equivalent to full reproducibility and replicability", "PARTIAL", ["E-L2", "E-NASEM-02", "E-NASEM-03"], "L2 is a necessary project gate for the stated success definition, but not a complete validity, reproducibility, or replicability claim."),
    ("DEC-R14", "The decision to treat citation-to-acquisition as exploratory correlation and prohibit causal wording is methodologically defensible", "SUPPORTED", ["E-STANDARD-CAUSAL", "E-CHARTER-A4"], "This is a scope and inference rule, not evidence that the proposed association exists."),
    ("DEC-R15", "Perplexity-only observations must not be generalized to all answer engines", "SUPPORTED", ["E-GENERALIZABILITY"], "The scope limitation is necessary and explicitly stated in the current documents."),
    ("DEC-R16", "The DeepSeek-first provider decision is supported by a robust comparative benchmark", "PARTIAL", ["E-D014-EVAL", "E-D014-DECISION"], "The decision is user-confirmed, but its benchmark rationale is one blind run in which both candidates failed the contract."),
    ("DEC-R17", "AI Trust is a product index name and must not be presented as an observable internal model state", "SUPPORTED", ["E-D019"], "The naming decision is author-owned; the construct definition and validity evidence remain open."),
    ("DEC-R18", "The decision-layer documents have current and mutually consistent metadata", "CONTRADICTED", ["E-DOC-METADATA", "E-DOC-D19-DATE"], "Both CURRENT_STATE and DECISION_LOG contain stale front-matter dates relative to their body/newest decision."),
    ("DEC-R19", "The current repository and production deployment have the same provider readiness state", "PARTIAL", ["E-PROVIDER-DEPLOY"], "The repository is configured and tests pass, but DeepSeek production-key verification remains pending."),
]


def source_record(row):
    source_id, title, year, url, source_type, quality = row
    provider = "local" if url.startswith("C:/") else "web"
    return Source(
        source_id=source_id,
        provider=provider,
        provider_id=url,
        title=title,
        year=year,
        url=url,
        source_type=source_type,
        publication_status="published_or_recorded",
        metadata={"source_quality": quality, "retrieval": "local_read_or_web_open", "review_date": "2026-08-21"},
    )


with ResearchStore(DB) as store:
    source_quality = {row[0]: row[-1] for row in SOURCES}
    for row in SOURCES:
        source_id, title, _, url, _, quality = row
        store.upsert_source(source_record(row))
        store.upsert_document(Document(
            document_id=f"DOC-{source_id}",
            source_id=source_id,
            title=title,
            content=f"Source locator: {url}\nDecision-layer evidence is recorded in the evidence table.",
            locator=url,
            mime_type="text/markdown" if url.startswith("C:/") else "text/html",
            metadata={"source_quality": quality, "retrieval_ref": "local-read-or-web-open"},
        ))
        store.log_action(ActionRecord(
            action_id=f"ACT-FETCH-{source_id}",
            action_type=ActionType.SOURCE_FETCHED,
            status="SUCCESS",
            target_id=source_id,
            provider="local" if url.startswith("C:/") else "web",
            detail={"url": url, "source_quality": quality},
        ))

    for evidence_id, source_id, claim_id, passage, polarity, rationale, locator in EVIDENCE:
        store.upsert_evidence(ResearchEvidence(
            evidence_id=evidence_id,
            source_id=source_id,
            document_id=f"DOC-{source_id}",
            claim_id=claim_id,
            passage=passage,
            locator=locator,
            polarity=EvidencePolarity[polarity],
            retrieval_query=f"decision layer audit {claim_id}",
            score=1.0,
            source_quality=source_quality[source_id],
            metadata={"rationale": rationale, "review_date": "2026-08-21"},
        ))
        store.log_action(ActionRecord(
            action_id=f"ACT-EVIDENCE-{evidence_id}",
            action_type=ActionType.EVIDENCE_RETRIEVED,
            status="SUCCESS",
            target_id=evidence_id,
            provider="local" if source_id.startswith("SRC-LOCAL") else "web",
            query=f"decision layer audit {claim_id}",
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
            status="SUCCESS" if status == "SUPPORTED" else "PARTIAL",
            target_id=claim_id,
            provider="academic-audit",
            detail={"status": status, "evidence_ids": evidence_ids, "rationale": rationale},
        ))

    store.upsert_analysis(AnalysisArtifact(
        analysis_id="ANALYSIS-DECISION-DOC-CONSISTENCY-2026-08-21",
        title="Decision document and current implementation consistency audit",
        status=ArtifactStatus.EXECUTED,
        command="rg/Get-Content plus current Node implementation inspection",
        input_locator="PROJECT_CHARTER.md; DECISION_LOG.md; ALGORITHM_V3.md; CURRENT_STATE.md; RESEARCH_STANDARD.md; mock-api/lib/*.js",
        output_locator="research/decision-audit-2026-08-21/DECISION_LAYER_AUDIT_REPORT.md",
        summary="Audited decision status, provider/version drift, hidden scoring layer, AI Trust boundary, reproducibility gates, and document metadata.",
        metadata={"scope": "decision-core", "status_counts": {"supported": 11, "partial": 3, "contradicted": 5}},
    ))
    store.log_action(ActionRecord(
        action_id="ACT-ANALYSIS-DECISION-DOC-CONSISTENCY-2026-08-21",
        action_type=ActionType.ANALYSIS_EXECUTED,
        status="SUCCESS",
        target_id="ANALYSIS-DECISION-DOC-CONSISTENCY-2026-08-21",
        provider="academic-search",
        detail={"profile": "geo-whitepaper", "mode": "full", "scope": "decision documents and current implementation"},
    ))
    store.log_action(ActionRecord(
        action_id="ACT-REVIEW-DECISION-2026-08-21",
        action_type=ActionType.REVIEW_EXECUTED,
        status="SUCCESS",
        provider="academic-search",
        detail={"profile": "geo-whitepaper", "scope": "PROJECT_CHARTER, DECISION_LOG, ALGORITHM_V3, CURRENT_STATE, RESEARCH_STANDARD", "openalex": "UNAVAILABLE"},
    ))

print(f"Seeded {len(SOURCES)} sources, {len(EVIDENCE)} evidence passages, and {len(CLAIMS)} decision-layer claims into {DB}")
