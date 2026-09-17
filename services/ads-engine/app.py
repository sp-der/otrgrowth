import os
import secrets
from fastapi import FastAPI, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from otr_ads.schemas import AuditInput, AuditReport
from otr_ads.audit import audit

app = FastAPI(title="OTR Ads Intelligence", docs_url=None, redoc_url=None, openapi_url=None)

@app.middleware("http")
async def bounded_body(request: Request, call_next):
    # Enforce actual streamed bytes, not only caller-controlled Content-Length.
    total = bytearray()
    async for part in request.stream():
        total.extend(part)
        if len(total) > 128_000:
            return JSONResponse({"detail": "Request too large"}, status_code=413)
    request._body = bytes(total)
    return await call_next(request)

def authorize(authorization: str = Header(default="")):
    secret = os.environ.get("ADS_ENGINE_SECRET", "")
    if len(secret) < 32:
        raise HTTPException(503, "Service authentication is not configured")
    if not secrets.compare_digest(authorization, "Bearer " + secret):
        raise HTTPException(401, "Unauthorized")

@app.get("/health")
def health():
    return {"status": "ok", "externalExecutionEnabled": False}

@app.get("/capabilities", dependencies=[Depends(authorize)])
def capabilities():
    return {"version": 1, "audit": True, "manualEvidence": True, "externalExecutionEnabled": False, "platformConnections": [], "approvalRequired": True}

@app.post("/audit", response_model=AuditReport, dependencies=[Depends(authorize)])
def run_audit(data: AuditInput):
    return audit(data)

@app.post("/validate", dependencies=[Depends(authorize)])
def validate(data: AuditInput):
    return {"valid": True, "externalExecutionEnabled": False}
