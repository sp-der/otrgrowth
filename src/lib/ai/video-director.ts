import "server-only";

import { z } from "zod";
import type { BusinessProfile, Campaign } from "../domain/schemas";
import type { VideoGeneratorInput } from "./hyperframes";
import { getAIProvider } from "./provider";
import type { AIMessage } from "./types";
import {
  AUTONOMOUS_VIDEO_ESTIMATED_COST_USD,
  AUTONOMOUS_VIDEO_SECONDS,
} from "./video-gateway";

const shotPlanSchema = z.object({
  useGeneratedVideo: z.boolean(),
  reason: z.string().trim().min(1).max(600),
  shot: z
    .object({
      purpose: z.enum(["hook", "hero", "transition"]),
      prompt: z.string().trim().min(20).max(1800),
      durationSeconds: z.literal(AUTONOMOUS_VIDEO_SECONDS),
    })
    .optional(),
});

export type GeneratedShotPlan = z.infer<typeof shotPlanSchema>;

export async function planGeneratedShot(
  input: VideoGeneratorInput,
  profile: BusinessProfile,
  campaigns: Campaign[],
): Promise<GeneratedShotPlan> {
  if (
    !input.aiVideo ||
    input.videoBudgetUsd < AUTONOMOUS_VIDEO_ESTIMATED_COST_USD ||
    input.aspectRatio === "1:1"
  ) {
    return {
      useGeneratedVideo: false,
      reason:
        input.aspectRatio === "1:1"
          ? "The controlled first video lane supports portrait or landscape output only."
          : "Paid AI footage is disabled or outside the generation budget.",
    };
  }

  const provider = getAIProvider({ timeoutMs: 45_000, maxTokens: 1_200 });
  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are OTR Growth's autonomous footage director.

Decide whether ONE four-second generative-video shot materially improves the requested ad.

Return ONLY JSON:
{
  "useGeneratedVideo": boolean,
  "reason": string,
  "shot": {
    "purpose": "hook" | "hero" | "transition",
    "prompt": string,
    "durationSeconds": 4
  }
}

Rules:
- One generated shot maximum.
- The fixed paid-video ceiling is $0.40.
- Prefer real website captures, real logos and deterministic HyperFrames graphics whenever they can tell the story accurately.
- Generated footage is for cinematic atmosphere, a hero beat, or a transition that makes the commercial feel more premium.
- Never ask the video model to render logos, UI copy, prices, phone numbers, URLs, testimonials, legal copy, performance numbers or readable text.
- Do not invent products, customers, client results, offices, staff or claims.
- If generated footage would only duplicate real portfolio proof, set useGeneratedVideo=false.
- If useGeneratedVideo=false, omit shot.
- If useGeneratedVideo=true, write a production-ready visual prompt with camera movement, lighting, environment and motion. Explicitly require no visible text or logos.`,
    },
    {
      role: "user",
      content: JSON.stringify({
        business: profile,
        campaigns: campaigns.slice(0, 5),
        request: {
          prompt: input.prompt,
          style: input.style,
          cta: input.cta,
          durationSeconds: input.durationSeconds,
          aspectRatio: input.aspectRatio,
          websites: input.websites,
        },
      }),
    },
  ];

  let raw: unknown;
  try {
    raw = JSON.parse(await provider.complete(messages));
  } catch {
    return {
      useGeneratedVideo: false,
      reason:
        "The footage planning pass was unavailable, so OTR Growth preserved the budget and continued with real assets only.",
    };
  }

  const parsed = shotPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      useGeneratedVideo: false,
      reason:
        "The footage plan was invalid, so OTR Growth preserved the budget and continued with real assets only.",
    };
  }
  if (parsed.data.useGeneratedVideo && !parsed.data.shot) {
    return {
      useGeneratedVideo: false,
      reason:
        "The footage plan did not contain a valid shot, so no paid generation was started.",
    };
  }
  return parsed.data;
}
