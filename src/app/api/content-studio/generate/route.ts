import { z } from "zod";
import { readLimited } from "@/lib/ai/read-limited";
import {
  generateHyperframesProject,
  videoGeneratorInputSchema,
} from "@/lib/ai/hyperframes";
import { resolveCreativeWebsites } from "@/lib/ai/asset-scout";
import { planGeneratedShot } from "@/lib/ai/video-director";
import {
  AUTONOMOUS_VIDEO_ESTIMATED_COST_USD,
  generateAutonomousVideo,
} from "@/lib/ai/video-gateway";
import { reviewContactSheet } from "@/lib/ai/visual-qa";
import { AIError } from "@/lib/ai/types";
import { businessProfileSchema, campaignSchema } from "@/lib/domain/schemas";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { verifyAccessToken } from "@/lib/supabase/server-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

function studioHost() {
  return (
    process.env.HYPERFRAMES_STUDIO_URL ||
    "https://hyperframes-host-production.up.railway.app"
  ).replace(/\/+$/, "");
}

function bearer(request: Request) {
  const value = request.headers.get("authorization")?.trim() ?? "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

async function businessContext(token: string, businessId: string) {
  const { url, publishableKey } = getSupabaseConfig();
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
  };
  const [businessResponse, profileResponse, campaignsResponse] = await Promise.all([
    fetch(`${url}/rest/v1/businesses?id=eq.${encodeURIComponent(businessId)}&select=id&limit=1`, {
      headers,
      cache: "no-store",
    }),
    fetch(`${url}/rest/v1/business_profiles?business_id=eq.${encodeURIComponent(businessId)}&select=profile&limit=1`, {
      headers,
      cache: "no-store",
    }),
    fetch(`${url}/rest/v1/campaigns?business_id=eq.${encodeURIComponent(businessId)}&select=payload&order=updated_at.desc&limit=25`, {
      headers,
      cache: "no-store",
    }),
  ]);

  if (!businessResponse.ok || !profileResponse.ok || !campaignsResponse.ok) {
    throw new Error("Business context could not be loaded.");
  }
  const businesses = (await businessResponse.json()) as Array<{ id?: unknown }>;
  if (businesses[0]?.id !== businessId) throw new Error("Business not available.");

  const profiles = (await profileResponse.json()) as Array<{ profile?: unknown }>;
  const campaigns = (await campaignsResponse.json()) as Array<{ payload?: unknown }>;
  return {
    profile: businessProfileSchema.parse(profiles[0]?.profile),
    campaigns: campaigns
      .map((row) => campaignSchema.safeParse(row.payload))
      .filter((result) => result.success)
      .map((result) => result.data),
  };
}

async function installProject(
  token: string,
  input: z.infer<typeof videoGeneratorInputSchema>,
  generated: { title: string; summary: string; html: string },
  generatedAssets: string[],
) {
  return fetch(`${studioHost()}/otr/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      businessId: input.businessId,
      websites: input.websites,
      logo: input.logo,
      title: generated.title,
      summary: generated.summary,
      prompt: input.prompt,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      generatedAssets,
      html: generated.html,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(150_000),
  });
}

async function storeGeneratedVideo(
  token: string,
  businessId: string,
  video:
    | { type: "url"; url: string; mediaType: string }
    | { type: "base64"; data: string; mediaType: string },
) {
  let response: Response;
  if (video.type === "url") {
    response = await fetch(`${studioHost()}/otr/generated-asset`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ businessId, url: video.url }),
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
  } else {
    const bytes = Buffer.from(video.data, "base64");
    if (!bytes.length || bytes.length > 25_000_000) {
      throw new AIError(
        "VIDEO_GENERATION_FAILED",
        "The generated video was outside the accepted delivery size.",
        502,
      );
    }
    response = await fetch(`${studioHost()}/otr/generated-asset`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": video.mediaType || "video/mp4",
        "x-otr-business-id": businessId,
      },
      body: bytes,
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
  }

  const payload = (await response.json()) as {
    ok?: boolean;
    path?: string;
    error?: string;
  };
  if (!response.ok || !payload.ok || payload.path !== "assets/ai-hero.mp4") {
    throw new AIError(
      "VIDEO_GENERATION_FAILED",
      payload.error || "The generated video could not be stored in HyperFrames.",
      502,
    );
  }
  return payload.path;
}

async function renderProject(token: string, businessId: string) {
  const response = await fetch(`${studioHost()}/otr/render`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ businessId }),
    cache: "no-store",
    signal: AbortSignal.timeout(275_000),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    bytes?: number;
    fps?: number;
    quality?: string;
    error?: string;
    findings?: string;
  };
  if (!response.ok || !payload.ok) {
    throw new AIError(
      "VIDEO_GENERATION_FAILED",
      payload.error || "The final HyperFrames render failed.",
      502,
    );
  }
  return payload;
}

export async function POST(request: Request) {
  const userId = await verifyAccessToken(request);
  const token = bearer(request);
  if (!userId || !token) {
    return json({ code: "UNAUTHORIZED", error: "Sign in to generate a video." }, 401);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readLimited(request.body, 4_000_000));
  } catch (error) {
    return json(
      {
        code: "INVALID_INPUT",
        error: error instanceof RangeError ? "The generator request is too large." : "Invalid generator request.",
      },
      error instanceof RangeError ? 413 : 400,
    );
  }

  const parsed = videoGeneratorInputSchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { code: "INVALID_INPUT", error: "Check the video brief.", fields: parsed.error.flatten().fieldErrors },
      400,
    );
  }

  try {
    const context = await businessContext(token, parsed.data.businessId);
    const resolvedInput = {
      ...parsed.data,
      websites: resolveCreativeWebsites(
        parsed.data,
        context.profile,
        context.campaigns,
      ),
    };
    const shotPlan = await planGeneratedShot(
      resolvedInput,
      context.profile,
      context.campaigns,
    );

    const generatedAssets: string[] = [];
    let videoGeneration: {
      used: boolean;
      reason: string;
      model?: string;
      durationSeconds?: number;
      estimatedCostUsd?: number;
    } = {
      used: false,
      reason: shotPlan.reason,
    };

    if (shotPlan.useGeneratedVideo && shotPlan.shot) {
      const generatedVideo = await generateAutonomousVideo(
        {
          prompt: shotPlan.shot.prompt,
          aspectRatio: resolvedInput.aspectRatio as "9:16" | "16:9",
          maxBudgetUsd: resolvedInput.videoBudgetUsd,
        },
        { pollTimeoutMs: 150_000 },
      );
      const assetPath = await storeGeneratedVideo(
        token,
        resolvedInput.businessId,
        generatedVideo.video,
      );
      generatedAssets.push(assetPath);
      videoGeneration = {
        used: true,
        reason: shotPlan.reason,
        model: generatedVideo.model,
        durationSeconds: generatedVideo.durationSeconds,
        estimatedCostUsd: generatedVideo.estimatedCostUsd,
      };
    }

    let generated = await generateHyperframesProject(
      resolvedInput,
      context.profile,
      context.campaigns,
      undefined,
      generatedAssets,
    );

    type InstallResult = {
      ok?: boolean;
      error?: string;
      findings?: string;
      captures?: Array<{ url: string; path: string }>;
      check?: string;
      qa?: {
        findings?: string;
        contactSheetBase64?: string;
        mediaType?: string;
      };
    };

    let repairUsed = false;
    let install = await installProject(
      token,
      resolvedInput,
      generated,
      generatedAssets,
    );
    let result = (await install.json()) as InstallResult;

    if (!install.ok && result.findings && install.status === 422) {
      repairUsed = true;
      generated = await generateHyperframesProject(
        resolvedInput,
        context.profile,
        context.campaigns,
        { html: generated.html, findings: result.findings },
        generatedAssets,
      );
      install = await installProject(
        token,
        resolvedInput,
        generated,
        generatedAssets,
      );
      result = (await install.json()) as InstallResult;
    }

    if (!install.ok) {
      return json(
        {
          code: "HYPERFRAMES_VALIDATION_FAILED",
          error: result.error || "HyperFrames rejected the generated project.",
          findings: result.findings,
        },
        install.status >= 400 && install.status < 600 ? install.status : 502,
      );
    }

    let visualQa = await reviewContactSheet(
      resolvedInput,
      result.qa?.contactSheetBase64 || "",
      [result.check, result.qa?.findings].filter(Boolean).join("\n"),
    );

    if (!visualQa.approved && !repairUsed) {
      repairUsed = true;
      generated = await generateHyperframesProject(
        resolvedInput,
        context.profile,
        context.campaigns,
        {
          html: generated.html,
          findings: `VISUAL QA:\n${visualQa.summary}\n${visualQa.findings.join("\n")}`,
        },
        generatedAssets,
      );
      install = await installProject(
        token,
        resolvedInput,
        generated,
        generatedAssets,
      );
      result = (await install.json()) as InstallResult;

      if (!install.ok) {
        return json(
          {
            code: "HYPERFRAMES_VALIDATION_FAILED",
            error:
              result.error ||
              "HyperFrames rejected the visual-QA repair pass.",
            findings: result.findings,
          },
          install.status >= 400 && install.status < 600 ? install.status : 502,
        );
      }

      visualQa = await reviewContactSheet(
        resolvedInput,
        result.qa?.contactSheetBase64 || "",
        [result.check, result.qa?.findings].filter(Boolean).join("\n"),
      );
    }

    if (!visualQa.approved) {
      throw new AIError(
        "VISUAL_QA_FAILED",
        `The autonomous ad still needs review after its single repair pass: ${visualQa.findings.join(
          " ",
        )}`,
        422,
      );
    }

    const rendered = await renderProject(token, resolvedInput.businessId);
    return json({
      ok: true,
      title: generated.title,
      summary: generated.summary,
      captures: result.captures ?? [],
      assetMode: resolvedInput.autoAssets ? "auto" : "manual",
      websites: resolvedInput.websites,
      videoGeneration,
      visualQa: {
        approved: visualQa.approved,
        summary: visualQa.summary,
        repairUsed,
      },
      render: {
        bytes: rendered.bytes,
        fps: rendered.fps,
        quality: rendered.quality,
      },
      deliveryUrl: `/otr/delivery?businessId=${encodeURIComponent(
        resolvedInput.businessId,
      )}`,
      maximumPaidVideoCostUsd: resolvedInput.aiVideo
        ? AUTONOMOUS_VIDEO_ESTIMATED_COST_USD
        : 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AIError) {
      return json({ code: error.code, error: error.message }, error.status);
    }
    return json(
      {
        code: "GENERATION_FAILED",
        error: error instanceof Error ? error.message : "Video generation failed.",
      },
      500,
    );
  }
}
