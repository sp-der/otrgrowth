# Ads Intelligence

## Boundary and upstream reuse

`services/ads-engine` is a Python 3.11+ FastAPI service. Next.js calls it server-side through an internal adapter, using user-owned business/campaign data read under the user's Supabase JWT. The service never receives a Supabase service-role credential. OTR's existing AI provider abstraction is unchanged; this milestone's analysis is deterministic, not model-generated.

Reused directly: `claude-ads-core` at commit `ac21644933910419529bcf81efb95a9ca71edf81`, specifically `score_account` and its control/finding contract validation. Its severity-weighted evidence coverage and category scoring are used without copying the upstream repository. The dependency is installed from the pinned Git commit, with all Python versions captured in `requirements.lock`.

OTR-specific code: six manual-attestation controls, HTTP authentication, OTR request/response contracts, recommendation mapping, persistence, UI, and creative bridge. Category weights are OTR choices (20/20/15/15/15/15), not upstream platform benchmarks. Capability manifests, explicit evidence gaps, approval, and disabled execution are adapted architectural concepts. Platform-specific upstream skills/slash commands, account connectors, monitoring jobs, live mutation, verification/rollback executors, and campaign planning endpoints are not installed.

Licenses: Claude Ads core is MIT; see `docs/licenses/claude-ads-LICENSE`. HyperFrames is Apache-2.0; see `docs/licenses/hyperframes-LICENSE`. Dependency packages retain their own notices.

## Evidence semantics

Controls: Tracking, Creative fatigue, Budget pacing, Audience, Landing page, Performance. Each defaults to unknown. A yes/no observation is explicitly attributed to a human and has medium confidence, never “verified by platform.” Fatigue is evaluated only for a selected campaign. No generic CTR/frequency thresholds are invented. Reports below the upstream 60% evidence-coverage threshold suppress the aggregate health score.

Stored/demo/manual performance rows are context. The latest reporting period is shown with its source, spend, impressions, clicks, and computed CTR. Overlapping rows are not summed. These business-level records cannot prove campaign fatigue or budget/landing-page health. Missing targets and account evidence remain unknown. An all-positive attestation score measures those supplied checks, not expected profitability.

## Private API

- `GET /health`: liveness only; no data or secrets.
- `GET /capabilities`: authenticated; declares audit/manual evidence support, no platform connections or external execution.
- `POST /audit`: authenticated, bounded JSON input, validated report output.
- `POST /validate`: authenticated input validation.

Use a cryptographically random `ADS_ENGINE_SECRET` of at least 32 characters and a TLS URL in production. The Next adapter refuses non-HTTPS remote service URLs and redirect responses. Localhost HTTP is permitted for development. The service uses constant-time bearer comparison and rejects a missing/short configured secret. Put it behind private ingress or network allowlisting and a request rate limit in production; CORS is not enabled.

No `/execute`, launch, spend, account mutation, or “Applied” API exists. No Claude Code subprocess is used.

## Persistence and review

The migration adds `ad_audits`, `ad_findings`, `ad_recommendations`, and `ad_approval_events` plus render infrastructure. `save_ad_audit` atomically inserts one audit, findings, and recommendation rows under RLS. Composite FKs tie business/campaign/audit ownership together. Recommendation status is Suggested/In review/Approved/Rejected; the DB constraint rejects Applied. Status changes create decision events. These records are internal owner-managed workflow history, not a tamper-proof external execution ledger.

“Generate replacement creative” validates the recommendation/business/campaign relationship and creates a new existing-format creative draft with `recommendationId`, campaign content, and a Creative DNA snapshot. Sequential clicks reuse an existing recommendation draft in the loaded workspace; the existing revision check rejects conflicting concurrent workspace saves. Human creative review remains mandatory.

Future change workflow: recommendation → immutable draft change → human review → approve/reject → capability-authorized executor → read-after-write verification → audit event. External execution is intentionally absent; approval in this milestone cannot cause an account change. Financial changes will need an idempotency key, version-bound approval, budget limits, trusted verification, and rollback design before an executor can be introduced.

## Start locally

```sh
cd services/ads-engine
python3.11 -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock
# Set ADS_ENGINE_SECRET securely, then:
uvicorn app:app --host 127.0.0.1 --port 8001
python -m pytest -q
```

Next.js environment additions:

```dotenv
ADS_ENGINE_URL=http://127.0.0.1:8001
ADS_ENGINE_SECRET=
```

Set the same secret on the Python service. Never prefix it with `NEXT_PUBLIC_`. Existing Supabase and AI configuration is unchanged.

## Deploy on Railway

Create a separate service from this branch with root directory `services/ads-engine`, using its Dockerfile. Set `ADS_ENGINE_SECRET`; Railway supplies `PORT`. Set health check `/health`. Enable private networking where compatible with your Next.js host, otherwise expose TLS behind access/rate-limit controls. Set `ADS_ENGINE_URL` and the matching secret on the Next.js server. Restart/redeploy the Next.js app after configuration.

Apply the repository migration to staging before using either new screen, and deploy the separate render worker as described in `hyperframes.md`. No production migration or new service deployment was performed during implementation. Docker recipes are prepared, not container-tested here.

## Validation

JavaScript tests cover backward-compatible workspace schemas, composition injection restrictions, render transitions, recommendation-to-creative ownership, API authentication/configuration behavior, and migration execution with PGlite (Postgres WASM). Migration tests switch roles to verify isolation, claims, output restrictions, and approval constraints. Python tests exercise real upstream scoring, missing evidence, fatigue attribution, API auth, body limits, validation, and disabled execution. PGlite does not replace a staging test of the deployed Supabase Storage service.

## Exact next step for Meta

Add a read-only Meta connection: create the Meta app, configure OAuth, request only the read permissions required for the chosen accounts, and store encrypted tokens server-side. Import account/campaign/ad identifiers, reporting windows, attribution settings, spend, delivery, frequency, conversions, and tracking evidence into an owner-scoped schema. Extend the current business-level metrics with explicit campaign/ad attribution, then test the audit against real read-only evidence. Do not enable writes or spend changes in that step. Write permissions require a later, separately reviewed executor with version-bound approvals and reconciliation.
