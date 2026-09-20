import "server-only";
import { z } from "zod";
import { getAIProvider } from "./provider";
import type { AIMessage } from "./types";
import type { BusinessProfile, Campaign } from "../domain/schemas";

export const videoGeneratorInputSchema = z.object({
  businessId: z.uuid(),
  prompt: z.string().trim().min(10).max(5000),
  durationSeconds: z.union([z.literal(15), z.literal(30), z.literal(45)]),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
  style: z.string().trim().min(1).max(500),
  cta: z.string().trim().max(500),
  autoAssets: z.boolean().default(true),
  aiVideo: z.boolean().default(true),
  videoBudgetUsd: z.number().min(0).max(0.5).default(0.5),
  websites: z
    .array(z.url().refine((value) => value.startsWith("https://"), "Use HTTPS URLs"))
    .max(8)
    .default([]),
  logo: z
    .object({
      name: z.string().trim().min(1).max(200),
      mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
      dataBase64: z.string().min(1).max(3_000_000),
    })
    .optional(),
});

export type VideoGeneratorInput = z.infer<typeof videoGeneratorInputSchema>;

const generatedSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(1000),
  html: z.string().min(500).max(160_000),
});

export type GeneratedHyperframesProject = z.infer<typeof generatedSchema>;

function canvas(aspectRatio: VideoGeneratorInput["aspectRatio"]) {
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
}

function assetManifest(
  input: VideoGeneratorInput,
  generatedAssets: string[] = [],
) {
  return [
    ...(input.logo ? ["assets/brand-logo." + input.logo.mimeType.split("/")[1].replace("jpeg", "jpg")] : []),
    ...input.websites.map((_, index) => `assets/site-${String(index + 1).padStart(2, "0")}.png`),
    ...generatedAssets,
  ];
}

function systemMessage(
  input: VideoGeneratorInput,
  generatedAssets: string[] = [],
): string {
  const { width, height } = canvas(input.aspectRatio);
  return `You are OTR Growth's video creative director and a native HyperFrames composition author.

Return ONLY one JSON object with keys: title, summary, html.

Your html becomes the real index.html inside an official HyperFrames 0.8.48 project. HyperFrames Studio must remain able to edit it and the official HyperFrames check/render pipeline must accept it.

HARD REQUIREMENTS:
- One root composition element with id="main", data-composition-id="main", data-start="0", data-duration="${input.durationSeconds}", data-width="${width}", data-height="${height}".
- Use scene elements with class="clip", data-start, data-duration, and data-track-index.
- Timeline scene durations must fit completely inside ${input.durationSeconds} seconds.
- Use only local project assets from this manifest: ${JSON.stringify(assetManifest(input, generatedAssets))}.
- If "assets/ai-hero.mp4" is present, it is a short cinematic support shot. Use it only where it meaningfully elevates the hook, hero beat, or transition. Never treat generated footage as proof of a real client result or as the source of logos, website UI, prices, URLs, claims, or readable brand copy.
- Website screenshot assets are full-page captures. Crop/position them with CSS to create device/browser-window shots, pans, zooms, layered cards, and dynamic reveals.
- When automatic asset scouting is enabled, the website captures are candidate proof selected from Business DNA, campaign context, and approved portfolio sources. Use only the captures that strengthen the requested story; do not force every candidate into the edit.
- If a logo asset exists, use it for the intro/end card. Never redraw or reinterpret the logo.
- Do not fetch remote media at playback time. Do not use iframes, forms, network fetch, WebSockets, localStorage, cookies, or navigation.
- External code is limited to GSAP from https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js when motion needs it.
- For GSAP, create one paused timeline synchronously and assign it to window.__timelines["main"]. The timeline must be seekable and deterministic.
- Do not use setTimeout, setInterval, requestAnimationFrame loops, random values, Date.now, autoplay APIs, or user interaction.
- Everything visible must remain inside the canvas and safe margins.
- Use semantic HTML/CSS and keep text editable in Studio.
- Avoid a slideshow. Each scene should have layered motion, hierarchy, transitions, and a deliberate visual idea.
- Use the full duration with a clear opening hook, proof/showcase body, service/benefit beat, and CTA end card.
- Typography must be readable on a phone.
- Build polished agency-ad quality, not a wireframe.
- No invented testimonials, performance claims, clients, awards, prices, or results.
- Return no markdown fences.

The user asked for an editable video, not an explanation.`;
}

function userMessage(
  input: VideoGeneratorInput,
  profile: BusinessProfile,
  campaigns: Campaign[],
  repair?: { html: string; findings: string },
  generatedAssets: string[] = [],
): string {
  const context = {
    business: profile,
    campaigns: campaigns.slice(0, 5),
    creativeRequest: {
      prompt: input.prompt,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      style: input.style,
      cta: input.cta,
      autoAssets: input.autoAssets,
      aiVideo: input.aiVideo,
      videoBudgetUsd: input.videoBudgetUsd,
      websites: input.websites,
      logoProvided: Boolean(input.logo),
      assetManifest: assetManifest(input, generatedAssets),
    },
  };

  if (repair) {
    return `Repair the HyperFrames composition below. Preserve the creative intent, but fix every actionable validation issue. Return the complete corrected JSON object.

CONTEXT:
${JSON.stringify(context)}

HYPERFRAMES CHECK FINDINGS:
${repair.findings.slice(0, 12_000)}

CURRENT HTML:
${repair.html}`;
  }

  return `Create a complete native HyperFrames video composition from this OTR Growth context.

${JSON.stringify(context)}

Make the scenes feel intentionally directed. Website captures should be presented with browser/device framing, depth, movement, cropping and transitions rather than simply filling the screen.`;
}

function parseGenerated(raw: string, input: VideoGeneratorInput) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The AI returned invalid JSON.");
  }
  const result = generatedSchema.parse(parsed);
  const { width, height } = canvas(input.aspectRatio);
  const required = [
    'data-composition-id="main"',
    `data-duration="${input.durationSeconds}"`,
    `data-width="${width}"`,
    `data-height="${height}"`,
  ];
  for (const token of required) {
    if (!result.html.includes(token)) {
      throw new Error(`The generated composition is missing required HyperFrames metadata: ${token}`);
    }
  }
  return result;
}

export async function generateHyperframesProject(
  input: VideoGeneratorInput,
  profile: BusinessProfile,
  campaigns: Campaign[],
  repair?: { html: string; findings: string },
  generatedAssets: string[] = [],
) {
  const provider = getAIProvider({ timeoutMs: 90_000, maxTokens: 12_000 });
  const messages: AIMessage[] = [
    { role: "system", content: systemMessage(input, generatedAssets) },
    {
      role: "user",
      content: userMessage(
        input,
        profile,
        campaigns,
        repair,
        generatedAssets,
      ),
    },
  ];
  return parseGenerated(await provider.complete(messages), input);
}
