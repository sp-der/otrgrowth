from uuid import uuid4
from claude_ads_core.scoring import score_account
from .schemas import AuditInput, AuditReport, Finding, Recommendation

# OTR controls; not upstream benchmark claims. Each evaluates an explicit human attestation.
CONTROLS = [
    ("trackingVerified", "Tracking", "high", "Verify conversion tracking"),
    ("creativeFatigueObserved", "Creative fatigue", "medium", "Prepare a replacement creative"),
    ("budgetOnPace", "Budget pacing", "high", "Review budget pacing"),
    ("audienceVerified", "Audience", "medium", "Review audience evidence"),
    ("landingPageVerified", "Landing page", "medium", "Review the landing page"),
    ("performanceOnTarget", "Performance", "medium", "Review performance against the target"),
]

def audit(data: AuditInput) -> AuditReport:
    controls, core_findings, findings, recommendations, gaps = [], [], [], [], []
    for key, category, severity, title in CONTROLS:
        value = getattr(data.evidence, key)
        # Fatigue is only attributable to a campaign when the user selected one.
        if key == "creativeFatigueObserved" and data.campaignId is None:
            value = None
        status = "unknown" if value is None else ("fail" if (value if key == "creativeFatigueObserved" else not value) else "pass")
        evidence = [] if value is None else [{"source": "manual_attestation", "field": key, "value": value, "note": data.evidence.note}]
        observation = "Insufficient evidence" if value is None else f"User-attested observation: {key}={value}. Not independently verified."
        finding = Finding(control_id=key, category=category, severity=severity, status=status, confidence="none" if value is None else "medium", observation=observation, evidence=evidence)
        findings.append(finding)
        controls.append(dict(schema_version="1.0.0", control_id=key, category=category, severity=severity, required_inputs=[key], source_ids=["otr-manual-attestation-v1"], maturity="inventory-baselined", geographies=["global"], scoring_behavior="health", stability="stable"))
        core_findings.append(dict(schema_version="1.0.0", control_id=key, status=status, confidence=finding.confidence, evidence=evidence, observation=observation, diagnosis="Human attestation only", recommendation=title))
        if status == "unknown":
            gaps.append(f"{category}: supply an explicit observation" + (" and select a campaign" if key == "creativeFatigueObserved" else ""))
        if status == "fail":
            recommendations.append(Recommendation(id=uuid4(), title=title, description=observation, category=category, severity=severity, confidence="medium", evidence=evidence, businessId=data.businessId, campaignId=data.campaignId, proposedAction="refresh_creative" if key == "creativeFatigueObserved" else "review_evidence"))
    score = score_account(controls, core_findings, {"Tracking":20,"Creative fatigue":20,"Budget pacing":15,"Audience":15,"Landing page":15,"Performance":15})
    if data.metrics:
        gaps.append("Stored metrics are business-level context; no campaign attribution or target benchmark is inferred.")
    return AuditReport(metricContext=max(data.metrics, key=lambda m: (m.periodEnd,m.periodStart)) if data.metrics else None, status=score.status, healthScore=None if score.status == "insufficient_evidence" else score.health_score, evidenceCoverage=score.evidence_coverage, findings=findings, recommendations=recommendations, dataGaps=gaps, sources=sorted(set(m.source for m in data.metrics) | ({"manual_attestation"} if any(f.evidence for f in findings) else set())))
