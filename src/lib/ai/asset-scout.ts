import "server-only";

import type { BusinessProfile, Campaign } from "../domain/schemas";
import type { VideoGeneratorInput } from "./hyperframes";

const OTR_SERVICES_PORTFOLIO = [
  "https://pacificstayproperties.com",
  "https://mdhgrill.com",
  "https://pressedinpink.com",
  "https://jmb2creations.com",
] as const;

function normalizeHttpsUrl(value: string) {
  const trimmed = value.trim().replace(/[),.;!?]+$/g, "");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function urlsFromText(value: string) {
  const matches = value.match(/https:\/\/[^\s"'<>]+/gi) ?? [];
  return matches
    .map(normalizeHttpsUrl)
    .filter((url): url is string => Boolean(url));
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function resolveCreativeWebsites(
  input: VideoGeneratorInput,
  profile: BusinessProfile,
  campaigns: Campaign[],
) {
  const manual = unique(
    input.websites
      .map(normalizeHttpsUrl)
      .filter((url): url is string => Boolean(url)),
  ).slice(0, 8);

  if (!input.autoAssets) return manual;

  const contextText = [
    input.prompt,
    input.style,
    input.cta,
    profile.website,
    profile.description,
    profile.services,
    profile.additionalContext,
    profile.instagram,
    profile.facebook,
    profile.tiktok,
    ...campaigns.flatMap((campaign) => [
      campaign.name,
      campaign.objective,
      campaign.audience,
      campaign.offer,
      campaign.channel,
      campaign.adCopy,
    ]),
  ]
    .filter(Boolean)
    .join("\n");

  const discovered = urlsFromText(contextText);
  const businessSpecific =
    profile.businessName.trim().toLowerCase() === "otr services"
      ? OTR_SERVICES_PORTFOLIO.map(normalizeHttpsUrl).filter(
          (url): url is string => Boolean(url),
        )
      : [];

  return unique([...manual, ...discovered, ...businessSpecific]).slice(0, 8);
}

export const otrServicesPortfolioSites = [...OTR_SERVICES_PORTFOLIO];
