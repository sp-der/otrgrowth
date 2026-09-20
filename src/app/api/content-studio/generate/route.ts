import { z } from "zod";
import { readLimited } from "@/lib/ai/read-limited";
import {
  generateHyperframesProject,
  videoGeneratorInputSchema,
} from "@/lib/ai/hyperframes";
import { resolveCreativeWebsites } from "@/lib/ai/asset-scout";
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
      html: generated.html,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(150_000),
  });
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
    let generated = await generateHyperframesProject(
      resolvedInput,
      context.profile,
      context.campaigns,
    );

    let install = await installProject(token, resolvedInput, generated);
    let result = (await install.json()) as {
      ok?: boolean;
      error?: string;
      findings?: string;
      captures?: Array<{ url: string; path: string }>;
      check?: unknown;
    };

    if (!install.ok && result.findings && install.status === 422) {
      generated = await generateHyperframesProject(
        resolvedInput,
        context.profile,
        context.campaigns,
        { html: generated.html, findings: result.findings },
      );
      install = await installProject(token, resolvedInput, generated);
      result = (await install.json()) as typeof result;
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

    return json({
      ok: true,
      title: generated.title,
      summary: generated.summary,
      captures: result.captures ?? [],
      assetMode: resolvedInput.autoAssets ? "auto" : "manual",
      websites: resolvedInput.websites,
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
