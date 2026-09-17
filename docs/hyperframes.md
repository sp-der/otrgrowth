# HyperFrames creative engine

## Architecture

The existing creative JSON payload has an optional `studio` field. Existing Image/Video/Carousel concepts remain valid. `studio` holds a validated brief, immutable composition snapshot, approval state, and previous-version ID. Saving in Studio creates a new creative row rather than replacing a previous version. The existing revision-checked workspace RPC persists these drafts unchanged.

`src/lib/creative/` owns schemas, template starting copy, DNA transformation, HTML escaping, and the rendering contract. Creative DNA is optional within the existing Business Profile JSON. Campaign ownership is checked before composition construction. The renderer uses the pinned `hyperframes@0.8.46` package in `services/render-worker`, outside the Next.js dependency tree. No upstream repository is vendored.

The six template presets use supplied campaign/Business DNA copy: Product Promo, Service Promo, Offer / Sale, Website Showcase, Testimonial, Announcement. Portrait, square, and landscape outputs use 1080×1920, 1080×1080, and 1920×1080. Platform is metadata, not a guarantee of ad-platform eligibility.

## Rendering and security

1. Save a Studio version.
2. POST `/api/creative/render` with `{creativeId}` and the user's Supabase bearer token.
3. The route authenticates, reads the creative through user-scoped RLS, and submits its stored composition. It never accepts executable HTML.
4. PostgreSQL enforces one active job per creative. An existing active job is returned on sequential resubmission; simultaneous insert races may return an error, but cannot create two active jobs.
5. The worker atomically claims one job using `FOR UPDATE SKIP LOCKED`. Rendering occurs in a temporary directory, outside page requests.
6. Only validated strings, allowlisted fonts, and hex colors reach the template. Copy is HTML-escaped. The fixed CLI command uses an argument array, never a shell. CSP permits the compiler's own inline/local runtime and embedded fonts, while external content is denied.
7. After actual MP4 creation, the worker uploads to the private `creative-renders` bucket at `owner/job.mp4`, then records completion. Owners get five-minute signed playback URLs; browsers have no storage-write grant.

Lifecycle: queued → rendering → completed/failed. SQL rejects other transitions and snapshot changes. Completed/failed jobs are immutable; retry creates a new job. A 20-minute expired worker lease is failed on the next claim. Rendering has a ten-minute process timeout. No automatic retry storm. Failed upload/status update can leave an orphaned object; periodic storage reconciliation is a production maintenance task. Queue remains queued when no worker is running; the UI states this explicitly.

## Database

Apply `supabase/migrations/20260917065654_creative_and_ads_engines.sql` after all existing migrations using the usual Supabase migration workflow. It adds render jobs and the Ads Intelligence tables, with composite ownership foreign keys and RLS. It creates the private output bucket and claim RPC. It does not replace `save_workspace` or alter production data in this implementation run.

Back up and apply in staging first. Use the Supabase CLI's current `db push --help`, link the intended project, inspect pending migrations, then run `supabase db push` against that project. Verify both owners' isolation in staging before production.

## Local development

```sh
npm install
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci --prefix services/render-worker
HYPERFRAMES_BROWSER_PATH=/path/to/chromium node --import tsx scripts/render-smoke.mts /tmp/otr-smoke.mp4
```

CUDA is unnecessary for this text renderer; the supported ONNX installer option skips that optional GPU download. Chromium and FFmpeg must be available. HyperFrames can download its browser automatically on unrestricted hosts. On restricted hosts set `HYPERFRAMES_BROWSER_PATH` to an installed executable.

Worker secrets (server-only, never `NEXT_PUBLIC_`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HYPERFRAMES_BROWSER_PATH` (optional if HyperFrames can install Chrome)

```sh
# With secrets loaded securely into the process environment:
cd services/render-worker
npm start
# One job for a smoke test:
npm start -- --once
```

## Deployment

Keep the Next.js app on its existing host. Run the worker as an always-on Node 22+ container, initially one instance and one job at a time. Railway is a suitable target; do not run full rendering in Vercel page/API requests.

Build context is repository root:

```sh
docker build -f services/render-worker/Dockerfile -t otr-render-worker .
```

On Railway: create a service from this branch, set Dockerfile path to `services/render-worker/Dockerfile`, set the three worker environment variables above (browser path is already `/usr/bin/chromium` in the image), and deploy. No public domain or incoming HTTP port is needed. Start with sufficient memory for Chromium (2 GB or more), monitor render duration/memory, then right-size. This run did not provision or deploy new infrastructure. The Docker image recipe has not been built in this environment.

## Current limitations

Text-led, equal-duration scene cuts only. Template presets share a small composition system, with layout variations; this is not a full timeline editor. `sourceAssets` has a forward-compatible schema, but uploads, logos, media compositing, audio, transitions, and AI-generated scene art are not implemented. A nonempty source-asset list is explicitly rejected by rendering. Only color/font/avoid-word DNA settings affect rendering; pacing is reserved metadata. The preview shows scene structure, not a full embedded HyperFrames player. Long copy should be reviewed at output size.

Creative approval is an owner-editable draft decision, not an authorization to publish. Future publishing must bind approval to a version/content hash and server-side authorization. No publishing endpoint exists.

## Verified in this run

A real HyperFrames render produced a 3.000-second, 1080×1080 H.264 MP4 (66,398 bytes). FFprobe verified the file, and a decoded frame was visually inspected. The initial restrictive CSP broke runtime readiness; the tested policy now permits HyperFrames' generated runtime without allowing caller-provided scripts. No cloud worker/storage integration was claimed as tested; credentials were not available locally.
