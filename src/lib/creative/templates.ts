import type { Business, Campaign } from "../domain/schemas";
import type { CreativeBrief, SourceAsset } from "./schemas";
import { generateScenePlan } from "./planner";

export function templateBrief(
  template: CreativeBrief["template"],
  business: Business,
  campaign: Campaign,
  options: {
    assets?: SourceAsset[];
    durationSeconds?: number;
    platform?: CreativeBrief["platform"];
    aspectRatio?: CreativeBrief["aspectRatio"];
  } = {},
): CreativeBrief {
  return generateScenePlan(template, business, campaign, options);
}
