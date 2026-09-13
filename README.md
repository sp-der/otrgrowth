# OTR Growth

The internal AI-powered marketing workspace for **OTR Services**. Milestone 1 turns Business DNA into a usable marketing brief, with a polished dashboard, content approvals, campaign planning, and a clear analytics funnel.

## Run locally

Use Node.js 22+ and npm. On Windows, clone into the requested project directory:

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

Open **http://127.0.0.1:3000**. The development and production start scripts bind to loopback by default. The application works with an empty AI key; only strategy generation requires a configured gateway.

```bash
npm run lint       # ESLint, zero warnings
npm run typecheck  # Strict TypeScript checks
npm test           # AI contract, API validation, persistence and metric tests
npm run build      # Next.js production build
npm start          # Run the production build locally
```

## Milestone 1 capabilities

| Page         | Working behavior                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Dashboard    | Business count, active campaign count, approval queue, illustrative leads/performance and recent workspace activity   |
| Businesses   | Add and select businesses; OTR Services starts as Client #001                                                         |
| Business DNA | Edit and validate all 21 profile fields; explicit save, completeness indicator and storage failure feedback           |
| Strategist   | Generate, validate, render and save a complete strategy for the selected business; flag strategies based on older DNA |
| Content      | Ideas, captions, reels, editable copy, approval statuses, planned dates and month calendar                            |
| Campaigns    | Create/edit objectives, audiences, offers, channels, ad copy, creative status and local campaign status               |
| Analytics    | Spend → impressions → CPM → clicks → CTR → CPC → leads → CPL → customers → revenue → ROAS                             |

Dark responsive UI, mobile navigation, reduced-motion support, visible keyboard focus, form labels, and readable loading/error/empty states are included. No social account is connected. Content approval and campaign status changes are local tracking actions only.

OTR Services is seeded only with information supplied for this build: creative/web services, website building, website management, design/branding, dark creative-studio styling, and **“BUILT TO REPRESENT YOUR BUSINESS RIGHT.”** Unknown fields remain blank. Every seeded DNA field is editable. All campaign/content examples and the September 1–13, 2026 analytics are explicitly illustrative; figures do **not** describe actual OTR financials. The demo metrics are independent of the draft campaign.

## Architecture

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 and Zod.
- `src/lib/domain/schemas.ts`: runtime schemas and inferred types for `Business`, `BusinessProfile`, `Strategy`, `ContentItem`, `Campaign`, `Creative`, and `PerformanceMetric`; versioned workspace envelope.
- `src/lib/data/repository.ts`: asynchronous `WorkspaceRepository` interface (`load` / `save`).
- `src/lib/data/local-repository.ts`: temporary browser-storage adapter. Validates reads/writes and does not overwrite corrupt data.
- `src/components/workspace-provider.tsx`: injects the repository, serializes writes and exposes domain state to screens. A failed save does not falsely update saved UI state.
- `src/lib/data/metrics.ts`: computes rates from raw totals, with zero-denominator handling.
- `src/lib/ai`: server-only provider adapter, transport types, prompts, bounded stream reader and response validation.

The call path is:

```text
Strategist UI → POST /api/ai/strategy → generateStrategy → AIProvider → configured gateway
```

Components never call the gateway directly. They receive a validated strategy or a sanitized error, never provider credentials or raw provider error bodies. `server-only` imports prevent AI transport/configuration from entering a client import tree. Native fetch is used; no vendor SDK is required.

### Future Supabase persistence

No database is provisioned in this milestone. The repository boundary is deliberately independent of storage. A later adapter can call authenticated OTR Growth server routes backed by Supabase tables for businesses, profiles, strategies, content, campaigns, creatives and metrics. Retain the current domain contract, UUID relationships and validation. Add authentication, ownership/RLS, transactional writes and optimistic concurrency before enabling shared persistence. A workspace transaction can be implemented behind the existing adapter without rewriting feature components; the current whole-workspace storage format is a temporary local implementation, not a proposed production database schema.

## AI configuration & FreeLLMAPI

[FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) is a **separate local/internal OpenAI-compatible gateway**. This repository neither contains nor forks its source and does not change its installation. Follow its upstream setup instructions separately, configure a working upstream provider in that gateway, and obtain the gateway's API key.

Set these variables **only on the OTR Growth server**, in `.env.local` for local development:

```dotenv
AI_BASE_URL=http://127.0.0.1:3001/v1
AI_API_KEY=
AI_MODEL=auto:smart
```

| Variable      | Purpose                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `AI_BASE_URL` | OpenAI-compatible base URL, including `/v1`; defaults to the local gateway |
| `AI_API_KEY`  | Gateway access key; blank means strategy generation is unavailable         |
| `AI_MODEL`    | Model/routing identifier; defaults to `auto:smart`                         |

Restart OTR Growth after changing environment variables. Never prefix these variables with `NEXT_PUBLIC_`. `.env*` files are ignored except the blank-key `.env.example`. Do not put a key in the URL. HTTP is accepted only for loopback development; remote providers must use HTTPS. Redirects are rejected so credentials are not forwarded to another endpoint.

The adapter calls `POST {AI_BASE_URL}/chat/completions` with bearer authentication, JSON-object response mode, a 6,000-token output budget and a 45-second deadline. There are no automatic retries or fallback model calls. Some gateway models do not support JSON mode; select a compatible model if the gateway rejects the request.

OpenAI, OpenRouter and other OpenAI-compatible services can use the existing adapter with new environment values. Direct native Anthropic or Gemini APIs would require implementing `AIProvider.complete(messages)` and selecting that adapter in `getAIProvider()`; feature pages and strategy rendering remain unchanged. Native vendor adapters are **not** implemented in Milestone 1.

### Strategy API contract

`POST /api/ai/strategy` accepts the BusinessProfile JSON object directly (the same fields as the Business DNA editor), using `Content-Type: application/json`.

Success is `{ strategy, generatedAt }`. `strategy` contains:

- `executiveSummary`
- `idealCustomerProfiles`: name, description, painPoints
- `positioning`, `offerRecommendations`
- `contentPillars`: name, purpose, ideas
- `channelRecommendations`: channel, rationale, cadence
- `campaignConcepts`: name, objective, concept, callToAction
- `thirtyDayPriorities`: each week 1–4 exactly once, with actions
- `keyMetrics`: name, reason, measurement

The schema is the source of truth. The prompt treats DNA as untrusted data, labels missing information and recommendations, and prohibits invented financials, guarantees or claims of executed actions. JSON and fenced JSON are accepted only if the full schema validates.

Errors are `{ code, error }`, optionally with input field validation details:

| Status          | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| 400 / 413 / 415 | Invalid DNA/JSON, request above 64 KB, or wrong content type |
| 403             | Cross-origin request rejected                                |
| 503             | `GATEWAY_NOT_CONFIGURED` or `PROVIDER_UNAVAILABLE`           |
| 502             | `MALFORMED_RESPONSE`                                         |
| 500             | Sanitized unexpected server failure                          |

Gateway responses are capped at 256 KB. Failed generations do not overwrite the prior valid strategy. Generated results are rendered as text, not HTML. Review all AI recommendations before use.

## Vercel readiness & security boundary

The standard Next.js Node runtime build can be imported into Vercel without custom deployment configuration. The strategy route allows up to 60 seconds and does not require build-time AI credentials.

**Milestone 1 is a trusted, single-operator local app. It has no application login or public API authentication.** Before a hosted instance receives a real AI key, protect the entire deployment (including `/api/*`) with Vercel Deployment Protection or an equivalent authenticated internal access layer. Same-origin checks are CSRF hygiene, not user authentication or a rate limiter. Do not expose this workspace as a public AI proxy. Application auth, durable rate limiting and shared-user storage belong to a later milestone.

A Vercel server cannot reach FreeLLMAPI running on your Windows PC through `127.0.0.1`; loopback means the Vercel server itself. For now, run both services on the same local computer. A future protected deployment must use a server-reachable approved provider. Production FreeLLMAPI hosting and multi-tenant gateway exposure are outside this milestone. No deployment is performed by this build task.

## Current limitations

- Data is stored in this browser/origin only, under `otr-growth:workspace:v1`; no Supabase sync, device sharing, exports or recovery UI. Browser clearing/private mode can discard it. Use a single editing tab; cross-tab concurrency is not implemented.
- DNA uses explicit save. Save before switching businesses or navigating; closing/reloading a dirty page prompts the browser where supported.
- Strategies are saved per business; regenerating replaces the last valid saved strategy. No history/version comparison yet.
- Content dates are planning dates, not posting jobs. Campaign status never launches or spends on ads.
- Financial examples are mock data. There are no live platform insights or causal performance claims.
- The adapter contract is tested using deterministic responses and gateway errors. A real FreeLLMAPI generation still requires your local gateway and key.
- No billing, subscriptions, client portal, CRM, email/SMS, social APIs, automated publishing/spending, or autonomous optimization.

## Roadmap after Milestone 1

1. Authenticated Supabase persistence and safe shared workflows.
2. Reviewable AI-assisted content and campaign drafts.
3. Explicitly authorized platform ingestion and unified reporting.
4. Human-reviewed optimization recommendations and client reporting.

This repository is independent of `sp-der/otrai` and the FreeLLMAPI upstream repository.
