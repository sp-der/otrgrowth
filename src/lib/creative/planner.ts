import type { Business, Campaign } from "../domain/schemas";
import {
  briefSchema,
  fitSceneDurations,
  type CreativeBrief,
  type CreativeScene,
  type SourceAsset,
} from "./schemas";

type PlanOptions = {
  assets?: SourceAsset[];
  durationSeconds?: number;
  platform?: CreativeBrief["platform"];
  aspectRatio?: CreativeBrief["aspectRatio"];
};

const trim = (value: string, fallback: string) =>
  (value.trim() || fallback).slice(0, 600);

function scene(
  type: CreativeScene["type"],
  durationSeconds: number,
  text: string,
  overrides: Partial<CreativeScene> = {},
): CreativeScene {
  return {
    id: crypto.randomUUID(),
    type,
    durationSeconds,
    text: text.slice(0, 600),
    subtext: "",
    cta: "",
    mediaAssetIds: [],
    logoEnabled: false,
    textPosition: "center",
    textAlign: "left",
    overlayOpacity: 0.34,
    animationPreset: "fade-up",
    transitionIn: "crossfade",
    transitionOut: "crossfade",
    emphasis: "standard",
    captionEnabled: true,
    ...overrides,
  };
}

function visualAssets(assets: SourceAsset[]) {
  return assets.filter((asset) => asset.kind === "image" || asset.kind === "video");
}

function assignMedia(
  scenes: CreativeScene[],
  assets: SourceAsset[],
): CreativeScene[] {
  const visual = visualAssets(assets);
  const logo = assets.find((asset) => asset.kind === "logo");
  if (!visual.length && !logo) return scenes;
  return scenes.map((item, index) => {
    const preferred = visual[index % Math.max(visual.length, 1)];
    const gallery = item.type === "gallery" ? visual.slice(0, 4).map((a) => a.id) : [];
    return {
      ...item,
      backgroundAssetId:
        item.type !== "end-card" && preferred ? preferred.id : item.backgroundAssetId,
      mediaAssetIds: gallery.length ? gallery : item.mediaAssetIds,
      logoEnabled: Boolean(logo) && (item.type === "hook" || item.type === "end-card"),
    };
  });
}

export function generateScenePlan(
  template: CreativeBrief["template"],
  business: Business,
  campaign: Campaign,
  options: PlanOptions = {},
): CreativeBrief {
  const profile = business.profile;
  const assets = options.assets ?? [];
  const total = options.durationSeconds ?? 15;
  const service = trim(profile.services, profile.usp || profile.businessName);
  const proof = trim(profile.usp, profile.description || "Built around your needs");
  const offer = trim(campaign.offer, profile.typicalOffer || "Explore what is available");
  const message = trim(campaign.adCopy, profile.description || service);
  const website = trim(profile.website, "See the full experience");
  const objective = trim(campaign.objective, "Built to move the right audience");
  let scenes: CreativeScene[];

  switch (template) {
    case "Product Promo":
      scenes = [
        scene("hook", 2.1, service, {
          emphasis: "strong",
          animationPreset: "pop-in",
          transitionIn: "zoom",
          textAlign: "center",
        }),
        scene("product", 3.7, message, {
          animationPreset: "zoom-in",
          textPosition: "bottom",
        }),
        scene("gallery", 3.8, "See the details", {
          subtext: proof,
          animationPreset: "subtle-pan",
          transitionIn: "slide",
        }),
        scene("feature", 2.8, proof, { animationPreset: "reveal" }),
        scene("end-card", 2.6, campaign.name, {
          cta: "Learn more",
          textAlign: "center",
          textPosition: "center",
          animationPreset: "end-card-focus",
          transitionIn: "fade-through",
          logoEnabled: true,
        }),
      ];
      break;
    case "Offer / Sale":
      scenes = [
        scene("hook", 2, offer, {
          emphasis: "strong",
          animationPreset: "pop-in",
          transitionIn: "zoom",
          textAlign: "center",
        }),
        scene("offer", 3.2, message, {
          emphasis: "strong",
          animationPreset: "slide-left",
        }),
        scene("feature", 3.1, objective, { animationPreset: "reveal" }),
        scene("offer", 3, offer, {
          subtext: "Available now",
          animationPreset: "zoom-in",
          textAlign: "center",
        }),
        scene("end-card", 3.7, campaign.name, {
          cta: "Explore the offer",
          logoEnabled: true,
          textAlign: "center",
          animationPreset: "end-card-focus",
          transitionIn: "fade-through",
        }),
      ];
      break;
    case "Website Showcase":
      scenes = [
        scene("hook", 2.3, profile.businessName, {
          subtext: website,
          animationPreset: "fade-up",
        }),
        scene("gallery", 4, "See the experience", {
          subtext: service,
          animationPreset: "subtle-pan",
          transitionIn: "slide",
        }),
        scene("feature", 3.1, proof, {
          animationPreset: "slide-right",
          textPosition: "bottom",
        }),
        scene("feature", 2.7, message, { animationPreset: "reveal" }),
        scene("end-card", 2.9, website, {
          cta: "Visit our website",
          logoEnabled: true,
          textAlign: "center",
          animationPreset: "end-card-focus",
          transitionIn: "zoom",
        }),
      ];
      break;
    case "Testimonial":
      scenes = [
        scene("hook", 2.2, "What customers remember", {
          textAlign: "center",
          animationPreset: "fade-in",
        }),
        scene("testimonial", 5, "Add an approved customer quote", {
          subtext: "Customer testimonial",
          textAlign: "center",
          emphasis: "strong",
          animationPreset: "reveal",
          transitionIn: "blur-fade",
        }),
        scene("social-proof", 3.8, proof, {
          textAlign: "center",
          animationPreset: "fade-up",
        }),
        scene("end-card", 4, profile.businessName, {
          cta: "Learn more",
          logoEnabled: true,
          textAlign: "center",
          animationPreset: "end-card-focus",
        }),
      ];
      break;
    case "Announcement":
      scenes = [
        scene("hook", 2.4, "Something new", {
          textAlign: "center",
          emphasis: "strong",
          animationPreset: "pop-in",
        }),
        scene("announcement", 5.2, message, {
          textAlign: "center",
          animationPreset: "reveal",
          transitionIn: "fade-through",
        }),
        scene("feature", 3.6, objective, {
          textAlign: "center",
          animationPreset: "fade-up",
        }),
        scene("end-card", 3.8, profile.businessName, {
          cta: "Learn more",
          logoEnabled: true,
          textAlign: "center",
          animationPreset: "end-card-focus",
        }),
      ];
      break;
    default:
      scenes = [
        scene("hook", 2.2, proof, {
          emphasis: "strong",
          animationPreset: "fade-up",
        }),
        scene("service", 4, service, {
          animationPreset: "slide-left",
          textPosition: "bottom",
        }),
        scene("feature", 3.2, message, {
          animationPreset: "reveal",
          transitionIn: "blur-fade",
        }),
        scene("social-proof", 2.7, objective, {
          animationPreset: "fade-in",
        }),
        scene("end-card", 2.9, profile.businessName, {
          cta: "Learn more",
          logoEnabled: true,
          textAlign: "center",
          animationPreset: "end-card-focus",
          transitionIn: "fade-through",
        }),
      ];
  }

  scenes = fitSceneDurations(assignMedia(scenes, assets), total);
  const music = assets.find((asset) => asset.kind === "audio");
  return briefSchema.parse({
    template,
    platform: options.platform ?? "Generic",
    aspectRatio: options.aspectRatio ?? "9:16",
    durationSeconds: total,
    hook: scenes[0]?.text || profile.businessName,
    bodyCopy: message,
    cta:
      template === "Website Showcase"
        ? "Visit our website"
        : template === "Offer / Sale"
          ? "Explore the offer"
          : "Learn more",
    scenes,
    sourceAssets: assets,
    audio: music ? { musicAssetId: music.id } : {},
    motion: {
      pacing: profile.creativeDNA?.pacing ?? "Balanced",
      transitionStyle: profile.creativeDNA?.transitionStyle ?? "Clean",
      visualStyle: profile.creativeDNA?.visualStyle ?? "Clean",
      motionIntensity: profile.creativeDNA?.motionIntensity ?? "Balanced",
    },
  });
}
