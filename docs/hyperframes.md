# HyperFrames Creative Engine V2

## Architecture

OTR Growth keeps HyperFrames as the renderer and now uses a richer validated composition system in `src/lib/creative/`.

Creative Studio stores immutable versioned creative snapshots. V2 compositions support:
- per-scene timing
- image and video backgrounds
- gallery media
- logo overlays
- animated typography
- motion presets
- transition presets
- branded end cards
- background music and optional voiceover
- portrait, square, and landscape output

Existing V1 creative records remain readable.

## Creative planning

`planner.ts` generates a structured scene plan from Business DNA, campaign context, template, duration, platform, aspect ratio, and available assets.

Templates intentionally use different scene strategies:
- Product Promo
- Service Promo
- Offer / Sale
- Website Showcase
- Testimonial
- Announcement

Scenes can use hook, product, service, gallery, testimonial, feature, offer, social-proof, announcement, CTA, and end-card roles.

## Media and audio

Creative assets are stored privately in Supabase Storage under `creative-assets` and described by `public.creative_assets`.

Supported asset kinds:
- image
- video
- logo
- audio

The browser may upload authenticated owner-scoped assets. Render workers use the Supabase service role to retrieve only storage paths referenced by an immutable composition snapshot.

HyperFrames renders the visual MP4. FFmpeg then mixes selected music and optional voiceover, including volume and fade controls, into the final MP4.

## Motion

Available animation presets:
- fade-up
- fade-in
- slide-left
- slide-right
- zoom-in
- zoom-out
- subtle-pan
- reveal
- pop-in
- end-card-focus

Available transition presets:
- cut
- crossfade
- fade-through
- slide
- zoom
- blur-fade

Composition HTML is generated from validated data. User copy is HTML-escaped and callers cannot submit executable HTML or JavaScript.

## Render lifecycle

1. Save a Creative Studio version.
2. POST `/api/creative/render` with the authenticated creative ID.
3. The API reads the owner-scoped persisted creative and queues its immutable composition.
4. PostgreSQL permits one active job per creative.
5. Railway's render worker atomically claims a job.
6. Required private media assets are downloaded to a temporary directory.
7. HyperFrames renders the visual timeline with Chromium.
8. FFmpeg mixes selected audio when present.
9. The final MP4 is uploaded to private `creative-renders` storage.
10. The job is marked completed and the owner can request a short-lived signed playback URL.

Lifecycle: queued → rendering → completed/failed.

## Supabase migrations

Engine foundation:
- `20260917065654_creative_and_ads_engines.sql`

Creative Engine V2 assets:
- `20260917222010_creative_assets_v2.sql`
- `20260917222213_creative_assets_explicit_grants.sql`

The asset model is append-only so historical composition snapshots remain reproducible.

## Deployment

Next.js remains on Vercel.

The HyperFrames worker runs separately on Railway with:
- Node 22
- Chromium
- FFmpeg
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional `HYPERFRAMES_BROWSER_PATH`

Rendering stays outside Vercel page/API request execution.

## Current limits

- Voiceover can be mixed when an audio asset is supplied, but automatic voice generation is not implemented.
- No live ad publishing or spend mutation exists.
- Creative approval remains a human workflow.
- Creative Studio preview is a structural scene preview, not a frame-accurate embedded HyperFrames editor.
- Asset deletion is intentionally omitted so old creative snapshots do not silently lose referenced media.

## Validation

The original hosted 15-second queue/render/storage path is proven against production Supabase and Railway.

Creative Engine V2 now has automated coverage for:
- exact scene timing
- media assignment
- logo assignment
- music assignment
- motion/transition markup
- V1/V2 compatibility
- HTML escaping

CI validates lint, typecheck, tests, production build, and the separate Python Ads Engine suite.
