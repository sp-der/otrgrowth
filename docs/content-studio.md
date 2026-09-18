# OTR Growth Content Studio

OTR Growth embeds the official HyperFrames Studio without reimplementing its editor or renderer.

## Upstream

- Repository: https://github.com/heygen-com/hyperframes
- Package: `hyperframes`
- Pinned version: `0.8.48`
- License: Apache-2.0

The Railway host runs the official HyperFrames CLI preview server. That server supplies Studio, project file editing, preview, lint/check support, media workflows, render jobs, and the official render pipeline.

## Request flow

1. The authenticated OTR Growth browser opens `/content-studio`.
2. The page sends its Supabase JWT and selected business ID to `POST /api/content-studio/session`.
3. The API verifies that the JWT can read that business through Supabase RLS and stores an HttpOnly short-lived Studio session cookie.
4. Next.js rewrites the Studio HTML, `/assets/*`, and otherwise-unmatched `/api/*` requests to the Railway HyperFrames host.
5. The Railway host validates the same Supabase JWT and business ownership before proxying anything to HyperFrames.
6. Each business receives its own project directory under `HYPERFRAMES_PROJECTS_DIR/<business-id>`.
7. On first use the host calls the official `hyperframes init`. It then runs the official `hyperframes preview` server for that project.
8. Business DNA and campaign snapshots are refreshed into `OTR-CONTEXT.json` and `OTR-CONTEXT.md` in the project directory.

The browser remains on the OTR Growth domain. Railway is an implementation detail.

## Persistence

Production should mount a Railway volume at `/data`. Without a volume, project edits can be lost when Railway replaces the container.

## Environment

Railway host:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- optional `HYPERFRAMES_PROJECTS_DIR` (default `/data/projects`)
- `PUPPETEER_EXECUTABLE_PATH` defaults to `/usr/bin/chromium`

OTR Growth / Vercel:
- `HYPERFRAMES_STUDIO_URL` points at the Railway host. The integration may also carry a project-specific default URL in `next.config.ts` after provisioning.

## Security boundary

The Railway Studio host is not an open editor. Every request must include the OTR Studio cookie. The cookie contains the current Supabase access token and selected business ID, is HttpOnly/Secure on production, and is validated again by the Railway host using Supabase Auth + RLS before project access.

No Supabase service-role key is required by the HyperFrames host.
