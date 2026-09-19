from fastapi.testclient import TestClient
from app import app
from otr_ads.audit import audit
from otr_ads.schemas import AuditInput
from uuid import uuid4
import pytest

client = TestClient(app)
@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("ADS_ENGINE_SECRET", "x" * 32)

def payload(**kw):
    return {"businessId":str(uuid4()), **kw}

def test_missing_evidence_never_scores_healthy():
    report = audit(AuditInput(**payload()))
    assert report.healthScore is None and report.evidenceCoverage == 0
    assert all(f.status == "unknown" for f in report.findings)
    assert report.recommendations == []

def test_campaign_fatigue_is_attested_and_gated():
    report = audit(AuditInput(**payload(campaignId=str(uuid4()), evidence={"creativeFatigueObserved":True})))
    assert len(report.recommendations)==1
    assert report.recommendations[0].proposedAction == "refresh_creative"
    assert report.recommendations[0].requiresApproval
    assert not report.externalExecutionEnabled

def test_fatigue_requires_campaign():
    assert not audit(AuditInput(**payload(evidence={"creativeFatigueObserved":True}))).recommendations

def test_known_negative_is_not_missing():
    report = audit(AuditInput(**payload(evidence={"trackingVerified":False})))
    assert report.findings[0].status == "fail"
    assert report.evidenceCoverage > 0

def test_auth_and_validation():
    assert client.post("/audit", json=payload()).status_code==401
    headers={"Authorization":"Bearer "+"x"*32}
    assert client.post("/audit",json=payload(),headers=headers).status_code==200
    assert client.post("/audit",json=payload(evidence={"trackingVerified":"garbage"}),headers=headers).status_code==422
    assert client.post("/execute",json={},headers=headers).status_code==404
    assert client.get("/capabilities",headers=headers).json()["externalExecutionEnabled"] is False

def test_body_limit():
    assert client.post("/audit",content=b"x"*128001).status_code==413

def test_all_attested_controls():
    report=audit(AuditInput(**payload(campaignId=str(uuid4()),evidence=dict(trackingVerified=True, creativeFatigueObserved=False,budgetOnPace=True,audienceVerified=True,landingPageVerified=True,performanceOnTarget=True))))
    assert report.healthScore==100 and report.evidenceCoverage==100
