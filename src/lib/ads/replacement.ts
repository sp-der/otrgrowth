import type { Business, Campaign, Creative } from "../domain/schemas";
import { buildComposition } from "../creative/composition-builder";
import { briefSchema } from "../creative/schemas";
import { recommendationSchema, type Recommendation } from "./schemas";
export function replacementCreative(
  input: Recommendation,
  business: Business,
  campaign: Campaign,
): Creative {
  const rec = recommendationSchema.parse(input);
  if (
    rec.businessId !== business.id ||
    rec.campaignId !== campaign.id ||
    campaign.businessId !== business.id ||
    rec.proposedAction !== "refresh_creative"
  )
    throw new Error("Recommendation and campaign do not match this business.");
  const brief = briefSchema.parse({
    platform: "Generic",
    aspectRatio: "9:16",
    durationSeconds: 15,
    template: "Service Promo",
    hook:
      campaign.offer || business.profile.usp || business.profile.businessName,
    bodyCopy:
      campaign.adCopy || business.profile.description || "Add your message",
    cta: "Learn more",
    scenes: [{ text: campaign.objective || "Add a new creative angle" }],
    recommendationId: rec.id,
  });
  return {
    id: crypto.randomUUID(),
    businessId: business.id,
    campaignId: campaign.id,
    title: `Replacement · ${campaign.name}`.slice(0, 200),
    concept: rec.description,
    format: "Video",
    status: "Concept",
    studio: {
      brief,
      composition: buildComposition(business, campaign, brief),
      approval: "Draft",
    },
  };
}
