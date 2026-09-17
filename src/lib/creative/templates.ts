import type { Business, Campaign } from "../domain/schemas";
import { briefSchema, type CreativeBrief } from "./schemas";
/** Deterministic starting copy from supplied DNA/campaign fields; no invented claims. */
export function templateBrief(
  template: CreativeBrief["template"],
  business: Business,
  campaign: Campaign,
): CreativeBrief {
  const profile = business.profile;
  const subject =
    template === "Product Promo"
      ? profile.services
      : template === "Service Promo"
        ? profile.usp
        : template === "Offer / Sale"
          ? campaign.offer
          : template === "Website Showcase"
            ? profile.website
            : template === "Testimonial"
              ? "Add an approved customer quote"
              : "Add your announcement";
  return briefSchema.parse({
    template,
    platform: "Generic",
    aspectRatio: "9:16",
    durationSeconds: 15,
    hook: (subject || profile.businessName).slice(0, 600),
    bodyCopy: (
      campaign.adCopy ||
      profile.description ||
      "Add your message"
    ).slice(0, 600),
    cta:
      template === "Website Showcase"
        ? "Visit our website"
        : template === "Offer / Sale"
          ? "Explore the offer"
          : "Learn more",
    scenes: [
      {
        text: (template === "Testimonial"
          ? "Add the customer attribution"
          : campaign.objective ||
            profile.services ||
            "Add your supporting message"
        ).slice(0, 600),
      },
    ],
  });
}
