from datetime import date
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

class Metrics(StrictModel):
    source: Literal["demo", "manual", "meta", "google", "tiktok"]
    periodStart: date
    periodEnd: date
    spend: float = Field(ge=0)
    impressions: int = Field(ge=0)
    clicks: int = Field(ge=0)
    leads: int = Field(ge=0)
    customers: int = Field(ge=0)
    revenue: float = Field(ge=0)
    @model_validator(mode="after")
    def dates(self):
        if self.periodStart > self.periodEnd:
            raise ValueError("Invalid reporting period")
        return self

class Evidence(StrictModel):
    # User-attested observations. Omitted values are unknown, never false.
    trackingVerified: bool | None = None
    creativeFatigueObserved: bool | None = None
    budgetOnPace: bool | None = None
    audienceVerified: bool | None = None
    landingPageVerified: bool | None = None
    performanceOnTarget: bool | None = None
    note: str = Field(default="", max_length=1000)

class AuditInput(StrictModel):
    businessId: UUID
    campaignId: UUID | None = None
    metrics: list[Metrics] = Field(default_factory=list, max_length=100)
    evidence: Evidence = Field(default_factory=Evidence)

class Finding(StrictModel):
    control_id: str
    category: str
    status: Literal["pass", "fail", "unknown"]
    severity: Literal["high", "medium"]
    confidence: Literal["medium", "none"]
    observation: str
    evidence: list[dict]

class Recommendation(StrictModel):
    id: UUID
    title: str
    description: str
    category: str
    severity: Literal["high", "medium"]
    confidence: Literal["medium"]
    evidence: list[dict]
    businessId: UUID
    campaignId: UUID | None
    proposedAction: Literal["refresh_creative", "review_evidence"]
    requiresApproval: Literal[True] = True
    status: Literal["Suggested"] = "Suggested"

class AuditReport(StrictModel):
    schemaVersion: Literal[1] = 1
    status: Literal["normal", "provisional", "insufficient_evidence"]
    metricContext: Metrics | None = None
    healthScore: float | None
    evidenceCoverage: float
    findings: list[Finding]
    recommendations: list[Recommendation]
    dataGaps: list[str]
    sources: list[str]
    externalExecutionEnabled: Literal[False] = False
