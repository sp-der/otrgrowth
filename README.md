# OTR Growth

The internal AI-powered marketing workspace for **OTR Services**. OTR Growth turns Business DNA into a usable marketing brief, with a dashboard, content approvals, campaign planning, analytics, authenticated cloud persistence, and an AI strategy workflow.

## Run locally

Use Node.js 22+ and npm. On Windows:

```powershell
git clone https://github.com/sp-der/otrgrowth.git C:\Users\Hermes\Projects\otrgrowth
cd C:\Users\Hermes\Projects\otrgrowth
npm ci
Copy-Item .env.example .env.local
npm run dev
```

On macOS/Linux:

```bash
git clone https://github.com/sp-der/otrgrowth.git
cd otrgrowth
npm ci
cp .env.example .env.local
npm run dev
```

Configure `.env.local` before signing in:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
AI_BASE_URL=http://127.0.0.1:3001/v1
AI_API_KEY=
AI_MODEL=auto:smart
```

The Supabase URL and publishable key are intentionally browser-visible credentials. Database authorization is enforced by Row Level Security. Never place a Supabase secret/service-role key or an AI provider secret in a `NEXT_PUBLIC_` variable.

Open **http://127.0.0.1:3000**. Strategy generation can remain unavailable while the rest of the workspace works if `AI_API_KEY` is blank.

```bash
npm run lint       # ESLint
npm run typecheck  # Strict TypeScript checks
npm test           # Domain, persistence, AI and metric tests
npm run build      # Next.js production build
npm start          # Run the production build locally
```

GitHub Actions also runs lint, typecheck, tests and the production build for pushes and pull requests.

## Current capabilities

| Area | Working behavior |
| --- | --- |
| Authentication | Supabase email/password sign-in and account creation with token refresh and sign-out |
| Dashboard | Business count, active campaign count, approval queue, illustrative leads/performance and recent workspace activity |
| Businesses | Add and select businesses; OTR Services starts as Client #001 |
| Business DNA | Edit and validate all 21 profile fields; explicit save and completeness indicator |
| Strategist | Generate, validate, render and save a complete strategy; flags strategies based on older DNA |
| Content | Ideas, captions, reels, editable copy, approval statuses, planned dates and month calendar |
| Campaigns | Create/edit objectives, audiences, offers, channels, ad copy, creative status and campaign tracking status |
| Analytics | Spend → impressions → CPM → clicks → CTR → CPC → leads → CPL → customers → revenue → ROAS |
| Persistence | Authenticated Supabase storage with per-user RLS, transactional workspace saves and optimistic concurrency |

Dark responsive UI, mobile navigation, reduced-motion support, visible keyboard focus, form labels, and readable loading/error/empty states are included. No social account is connected. Content approval and campaign status changes are tracking actions only and never publish or spend money.

OTR Services is seeded only with information supplied for this build: creative/web services, website building, website management, design/branding, dark creative-studio styling, and **“BUILT TO REPRESENT YOUR BUSINESS RIGHT.”** Unknown fields remain blank. Every seeded DNA field is editable. Seeded campaign/content examples and September 1–13, 2026 analytics are illustrative and do **not** describe actual OTR financials.

## Architecture

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 and Zod.
- `src/lib/domain/schemas.ts`: runtime schemas and inferred types for the complete versioned workspace contract.
- `src/lib/data/repository.ts`: asynchronous `WorkspaceRepository` interface (`load` / `save`).
- `src/lib/data/supabase-repository.ts`: authenticated PostgREST adapter that preserves the existing domain contract.
- `src/lib/data/local-repository.ts`: legacy browser-storage adapter retained for tests and one-time migration support.
- `src/lib/supabase/auth.ts`: browser auth/session helper using the Supabase Auth REST API.
- `src/lib/supabase/server-auth.ts`: server-side bearer-token verification for protected OTR Growth API routes.
- `src/components/auth-gate.tsx`: sign-in/create-account gate before workspace data is loaded.
- `src/components/workspace-provider.tsx`: serializes workspace writes and exposes domain state to screens.
- `src/lib/data/metrics.ts`: computes rates from raw totals, including zero-denominator handling.
- `src/lib/ai`: server-only provider adapter, transport types, prompts, bounded stream reader and response validation.
- `supabase/migrations/`: the exact database migrations applied to the live OTR Growth Supabase project.

The main client persistence path is:

```text
Authenticated UI
  → WorkspaceProvider
  → SupabaseWorkspaceRepository
  → Supabase PostgREST / save_workspace RPC
  → PostgreSQL transaction + RLS
```

The strategy path is:

```text
Strategist UI
  → authenticated POST /api/ai/strategy
  → generateStrategy
  → AIProvider
  → configured gateway
```

Components never receive provider secrets or raw provider error bodies. Generated output is validated against the domain schema before it can replace saved strategy data.

## Supabase persistence and security

The workspace is normalized across these tables:

- `businesses`
- `workspace_state`
- `business_profiles`
- `strategies`
- `content_items`
- `campaigns`
- `creatives`
- `performance_metrics`
- `activity`

Every persisted row is associated with an authenticated `auth.users` owner. RLS is enabled on all application tables and policies require `auth.uid() = owner_id` for reads and writes.

`public.save_workspace(p_workspace, p_expected_revision)` performs a complete workspace save inside one PostgreSQL transaction. It validates the workspace version, locks the current user's workspace, rejects stale revisions, upserts current entities, removes deleted entities, validates ownership relationships, and advances the revision only after the transaction succeeds.

Composite foreign keys prevent a user-owned row from linking to another owner's business or campaign. Foreign-key indexes are present for the ownership relationships. The Supabase security advisor currently reports no security findings.

### Existing local data migration

The previous Milestone 1 workspace key is `otr-growth:workspace:v1`. If the authenticated account has no cloud workspace yet, OTR Growth:

1. validates the existing local workspace if present,
2. otherwise creates the standard seed workspace,
3. saves it successfully to Supabase,
4. only then removes the old local workspace copy.

A failed cloud save leaves the old local copy untouched.

### Concurrency

Each workspace has a monotonically increasing revision. Saves send the revision they loaded. If another browser/session has already saved a newer revision, the database raises a workspace conflict instead of silently overwriting newer work. Reload before retrying after a conflict.

## AI configuration and FreeLLMAPI

[FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) is a separate local/internal OpenAI-compatible gateway. This repository neither contains nor forks its source.

Server-only AI variables:

```dotenv
AI_BASE_URL=http://127.0.0.1:3001/v1
AI_API_KEY=
AI_MODEL=auto:smart
```

| Variable | Purpose |
| --- | --- |
| `AI_BASE_URL` | OpenAI-compatible base URL including `/v1`; defaults to the local gateway |
| `AI_API_KEY` | Gateway access key; blank means strategy generation is unavailable |
| `AI_MODEL` | Model/routing identifier; defaults to `auto:smart` |

Restart OTR Growth after changing environment variables. Never prefix AI credentials with `NEXT_PUBLIC_`. HTTP is accepted only for loopback development; remote providers must use HTTPS. Redirects are rejected so credentials are not forwarded to another endpoint.

The adapter calls `POST {AI_BASE_URL}/chat/completions` with bearer authentication, JSON-object response mode, a 6,000-token output budget and a 45-second deadline. There are no automatic retries or fallback model calls.

A Vercel server cannot reach FreeLLMAPI running on a Windows PC through `127.0.0.1`; loopback means the Vercel server itself. A hosted OTR Growth deployment needs a server-reachable approved AI provider/gateway for strategy generation.

## Strategy API contract

`POST /api/ai/strategy` requires:

- same-origin browser request,
- valid Supabase bearer token,
- `Content-Type: application/json`,
- a BusinessProfile payload that validates against the domain schema.

Success is `{ strategy, generatedAt }`.

Errors are `{ code, error }`, optionally with field validation details:

| Status | Meaning |
| --- | --- |
| 400 / 413 / 415 | Invalid DNA/JSON, request above 64 KB, or wrong content type |
| 401 | Missing, expired or invalid Supabase authentication |
| 403 | Cross-origin request rejected |
| 503 | `GATEWAY_NOT_CONFIGURED` or `PROVIDER_UNAVAILABLE` |
| 502 | `MALFORMED_RESPONSE` |
| 500 | Sanitized unexpected server failure |

Gateway responses are capped at 256 KB. Failed generations do not overwrite the prior valid strategy. Generated results are rendered as text, not HTML. Review all AI recommendations before use.

## Current limitations

- Authentication is email/password only. Password recovery, MFA, organization/team invitations and role tiers are not implemented yet.
- The client auth helper intentionally uses Supabase's REST endpoints directly rather than adding another SDK dependency. Access tokens live in browser storage, so normal XSS protections remain important.
- DNA uses explicit save. Save before navigating away; closing/reloading a dirty page prompts the browser where supported.
- Strategies are saved per business; regenerating replaces the last valid saved strategy. No history/version comparison yet.
- Content dates are planning dates, not posting jobs. Campaign status never launches or spends on ads.
- Financial examples are mock data. There are no live platform insights or causal performance claims.
- No billing, subscriptions, client portal, CRM, email/SMS, social APIs, automated publishing/spending, or autonomous optimization.

## Next roadmap

1. Reviewable AI-assisted content and campaign drafts.
2. Creative generation and asset workflow.
3. Explicitly authorized Meta/Google/TikTok ingestion and unified reporting.
4. Human-reviewed optimization recommendations and client reporting.
5. Team access, stronger account recovery/MFA and operational audit tooling as needed.

This repository is independent of `sp-der/otrai` and the FreeLLMAPI upstream repository.

## Ads Intelligence

This branch adds a separate evidence-backed Ads Intelligence service with owner-scoped audits, findings, recommendations, and human approval tracking. See [Ads Engine setup, evidence semantics, and Meta roadmap](docs/ads-engine.md).

The previous custom creative-rendering / HyperFrames integration has been removed. OTR Growth will treat creative production as a separate content workflow rather than maintaining its own rendering engine. No external ad account changes, publishing, or spend actions are enabled.
