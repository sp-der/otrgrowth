# Ads Intelligence

## Boundary

`services/ads-engine` is a separate Python 3.11+ FastAPI service. Next.js calls it server-side using authenticated, owner-scoped OTR Growth data. The service never receives a Supabase service-role credential.

The service reuses the pinned `claude-ads-core` scoring/contract foundation while keeping OTR-specific request schemas, evidence controls, persistence, approval states, and UI in this repository.

Claude Ads core is MIT licensed; see `docs/licenses/claude-ads-LICENSE`.

## Evidence semantics

Controls cover Tracking, Creative fatigue, Budget pacing, Audience, Landing page, and Performance. Every control defaults to unknown. Human yes/no observations are stored as manual evidence, not presented as independently verified platform facts.

Stored performance rows are context only. Missing account evidence, targets, attribution, or campaign-level data remain unknown rather than being fabricated.

## Private API

- `GET /health`: liveness only.
- `GET /capabilities`: authenticated capability declaration.
- `POST /audit`: authenticated bounded audit input.
- `POST /validate`: authenticated validation.

Use a cryptographically random `ADS_ENGINE_SECRET` of at least 32 characters. Production service URLs must use HTTPS. The Next.js adapter rejects remote HTTP and redirects.

There is no execute, launch, spend, publish, or Applied endpoint.

## Persistence and approval

The database stores:
- `ad_audits`
- `ad_findings`
- `ad_recommendations`
- `ad_approval_events`

`save_ad_audit` writes one audit plus findings and recommendations under RLS. Recommendation state is limited to Suggested, In review, Approved, or Rejected. Status changes create approval events.

Approval records a human decision only. It does not change an external ad account.

## Local development

```sh
cd services/ads-engine
python3.11 -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock
# Set ADS_ENGINE_SECRET securely, then:
uvicorn app:app --host 127.0.0.1 --port 8001
python -m pytest -q
```

Next.js environment:

```dotenv
ADS_ENGINE_URL=http://127.0.0.1:8001
ADS_ENGINE_SECRET=
```

Never prefix the secret with `NEXT_PUBLIC_`.

## Railway

Deploy `services/ads-engine` as its own service using the included Dockerfile. Set `ADS_ENGINE_SECRET`, expose the health check at `/health`, and configure the matching `ADS_ENGINE_URL` / secret on the Next.js deployment.

## Validation

The repository validates:
- authenticated Ads API boundaries
- missing-service behavior
- migration execution
- owner isolation
- recommendation approval constraints
- Python scoring/contracts
- missing-evidence behavior
- body limits and disabled execution

## Next platform step

The next platform integration should remain read-only: connect Meta with only the permissions needed to ingest account/campaign/ad reporting evidence, store explicit reporting windows and attribution context, and audit that evidence without enabling writes or spend changes.
