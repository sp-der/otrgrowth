import test from "node:test";
import assert from "node:assert/strict";
import { seedWorkspace } from "../src/lib/data/seed";
import {
  briefSchema,
  creativeDNASchema,
  type SourceAsset,
} from "../src/lib/creative/schemas";
import {
  buildComposition,
  compositionHTML,
} from "../src/lib/creative/composition-builder";
import { generateScenePlan } from "../src/lib/creative/planner";
import { otrServicesPortfolioBrief, OTR_PORTFOLIO_ASSETS } from "../src/lib/creative/otr-services-preset";
import { canTransition } from "../src/lib/creative/render-jobs";
import { replacementCreative } from "../src/lib/ads/replacement";
import { recommendationSchema } from "../src/lib/ads/schemas";
import { workspaceSchema } from "../src/lib/domain/schemas";

const brief = briefSchema.parse({
  platform: "Instagram",
  aspectRatio: "9:16",
  durationSeconds: 15,
  template: "Product Promo",
  hook: "Safe hook",
  bodyCopy: "A real offer",
  cta: "Learn more",
  scenes: [{ text: '<img src=x onerror="alert(1)">' }],
});

test("legacy workspace and new branded drafts both round-trip", () => {
  const w = seedWorkspace();
  const campaign = w.campaigns[0];
  const business = w.businesses.find((b) => b.id === campaign.businessId)!;
  business.profile.creativeDNA = creativeDNASchema.parse({
    accentColor: "#ff00aa",
  });
  const comp = buildComposition(business, campaign, brief);
  assert.equal(comp.version, 2);
  w.creatives.push({
    id: crypto.randomUUID(),
    businessId: business.id,
    campaignId: campaign.id,
    title: "Test",
    concept: "",
    format: "Video",
    status: "Concept",
    studio: { brief, composition: comp, approval: "Draft" },
  });
  assert.deepEqual(
    workspaceSchema.parse(w).creatives.at(-1)?.studio?.composition,
    comp,
  );
});

test("composition escapes executable copy and restricts CSS inputs", () => {
  const w = seedWorkspace();
  const campaign = w.campaigns[0];
  const business = w.businesses.find((b) => b.id === campaign.businessId)!;
  const html = compositionHTML(buildComposition(business, campaign, brief));
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<script"));
  assert.equal(
    creativeDNASchema.safeParse({
      accentColor: "red; background:url(https://evil)",
    }).success,
    false,
  );
  assert.equal(
    briefSchema.safeParse({ ...brief, durationSeconds: 100000 }).success,
    false,
  );
  assert.throws(() =>
    buildComposition(
      business,
      { ...campaign, businessId: crypto.randomUUID() },
      brief,
    ),
  );
});

test("V2 planner assigns media, logo, music and exact scene timing", () => {
  const w = seedWorkspace();
  const campaign = w.campaigns[0];
  const business = w.businesses.find((b) => b.id === campaign.businessId)!;
  const assets: SourceAsset[] = [
    {
      id: crypto.randomUUID(),
      label: "Hero",
      kind: "image",
      storagePath: "test/hero.webp",
      mimeType: "image/webp",
    },
    {
      id: crypto.randomUUID(),
      label: "Clip",
      kind: "video",
      storagePath: "test/clip.mp4",
      mimeType: "video/mp4",
    },
    {
      id: crypto.randomUUID(),
      label: "Logo",
      kind: "logo",
      storagePath: "test/logo.png",
      mimeType: "image/png",
    },
    {
      id: crypto.randomUUID(),
      label: "Music",
      kind: "audio",
      storagePath: "test/music.mp3",
      mimeType: "audio/mpeg",
    },
  ];

  const plan = generateScenePlan("Website Showcase", business, campaign, {
    assets,
    durationSeconds: 30,
    platform: "Instagram",
    aspectRatio: "9:16",
  });

  const total = plan.scenes.reduce(
    (sum, scene) => sum + scene.durationSeconds,
    0,
  );
  assert.equal(Number(total.toFixed(2)), 30);
  assert.ok(plan.scenes.some((scene) => scene.backgroundAssetId));
  assert.ok(plan.scenes.some((scene) => scene.logoEnabled));
  assert.equal(plan.audio.musicAssetId, assets[3].id);
  assert.deepEqual(plan.sourceAssets, assets);
});

test("V2 composition emits media, motion, transitions and end-card markup", () => {
  const w = seedWorkspace();
  const campaign = w.campaigns[0];
  const business = w.businesses.find((b) => b.id === campaign.businessId)!;
  const imageId = crypto.randomUUID();
  const logoId = crypto.randomUUID();
  const richBrief = briefSchema.parse({
    platform: "Instagram",
    aspectRatio: "9:16",
    durationSeconds: 15,
    template: "Service Promo",
    hook: "Built to represent you",
    bodyCopy: "Websites with movement",
    cta: "Start a project",
    sourceAssets: [
      {
        id: imageId,
        label: "Hero",
        kind: "image",
        storagePath: "test/hero.webp",
      },
      {
        id: logoId,
        label: "Logo",
        kind: "logo",
        storagePath: "test/logo.png",
      },
    ],
    scenes: [
      {
        type: "hook",
        durationSeconds: 7,
        text: "Built to represent you",
        backgroundAssetId: imageId,
        logoEnabled: true,
        animationPreset: "zoom-in",
        transitionIn: "zoom",
      },
      {
        type: "end-card",
        durationSeconds: 8,
        text: "OTR Services",
        cta: "Start a project",
        logoEnabled: true,
        animationPreset: "end-card-focus",
        transitionIn: "fade-through",
      },
    ],
  });
  const html = compositionHTML(buildComposition(business, campaign, richBrief));
  assert.ok(html.includes('class="scene-media motion-zoom-in"'));
  assert.ok(html.includes("transition-zoom"));
  assert.ok(html.includes("end-card-focus"));
  assert.ok(html.includes('class="scene-logo"'));
  assert.ok(html.includes("assets/" + imageId + ".webp"));
});

test("terminal render jobs cannot be rewritten", () => {
  assert.ok(canTransition("queued", "rendering"));
  assert.ok(canTransition("rendering", "completed"));
  assert.ok(canTransition("rendering", "failed"));
  assert.equal(canTransition("queued", "completed"), false);
  assert.equal(canTransition("completed", "rendering"), false);
  assert.equal(canTransition("failed", "queued"), false);
});

test("recommendation creates reviewable version with correct ownership", () => {
  const w = seedWorkspace();
  const campaign = w.campaigns[0];
  const business = w.businesses.find((b) => b.id === campaign.businessId)!;
  const rec = recommendationSchema.parse({
    id: crypto.randomUUID(),
    businessId: business.id,
    campaignId: campaign.id,
    title: "Refresh",
    description: "Manual fatigue observation",
    category: "Creative fatigue",
    severity: "medium",
    confidence: "medium",
    evidence: [{ source: "manual_attestation" }],
    proposedAction: "refresh_creative",
    requiresApproval: true,
    status: "Suggested",
  });
  const creative = replacementCreative(rec, business, campaign);
  assert.equal(creative.studio?.brief.recommendationId, rec.id);
  assert.equal(creative.studio?.approval, "Draft");
  assert.throws(() =>
    replacementCreative(
      { ...rec, businessId: crypto.randomUUID() },
      business,
      campaign,
    ),
  );
  assert.equal(
    recommendationSchema.safeParse({ ...rec, status: "Applied" }).success,
    false,
  );
  assert.equal(
    recommendationSchema.safeParse({ ...rec, requiresApproval: false }).success,
    false,
  );
});


test("OTR portfolio preset is a complete 30-second bundled-media reel", () => {
  const w = seedWorkspace();
  const campaign = w.campaigns[0];
  const business = w.businesses.find((b) => b.id === campaign.businessId)!;
  const preset = otrServicesPortfolioBrief();
  assert.equal(preset.platform, "Instagram");
  assert.equal(preset.aspectRatio, "9:16");
  assert.equal(preset.durationSeconds, 30);
  assert.equal(
    Number(preset.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0).toFixed(2)),
    30,
  );
  assert.equal(preset.sourceAssets.length, 5);
  assert.ok(preset.sourceAssets.every((asset) => asset.storagePath.startsWith("bundled/")));
  assert.equal(OTR_PORTFOLIO_ASSETS[0].kind, "logo");
  const composition = buildComposition(business, campaign, preset);
  const html = compositionHTML(composition);
  assert.ok(html.includes("assets/00000000-0000-4000-9000-000000000001.svg"));
  assert.ok(html.includes("Pressed In Pink"));
  assert.ok(html.includes("@otrservicesie"));
});
