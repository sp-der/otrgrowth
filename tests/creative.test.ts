import test from "node:test";
import assert from "node:assert/strict";
import { seedWorkspace } from "../src/lib/data/seed";
import { briefSchema, creativeDNASchema } from "../src/lib/creative/schemas";
import {
  buildComposition,
  compositionHTML,
} from "../src/lib/creative/composition-builder";
import { canTransition } from "../src/lib/creative/render-jobs";
import { replacementCreative } from "../src/lib/ads/replacement";
import { recommendationSchema } from "../src/lib/ads/schemas";
import { workspaceSchema } from "../src/lib/domain/schemas";
const brief = briefSchema.parse({
  platform: "Instagram",
  aspectRatio: "9:16",
  durationSeconds: 15,
  template: "Product Promo",
  hook: '<img src=x onerror="alert(1)">',
  bodyCopy: "A real offer",
  cta: "Learn more",
  scenes: [{ text: "Scene one" }],
});
test("legacy workspace and new branded drafts both round-trip", () => {
  const w = seedWorkspace();
  const campaign = w.campaigns[0];
  const business = w.businesses.find((b) => b.id === campaign.businessId)!;
  business.profile.creativeDNA = creativeDNASchema.parse({
    accentColor: "#ff00aa",
  });
  const comp = buildComposition(business, campaign, brief);
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
  assert.ok(!html.includes("<img"));
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
