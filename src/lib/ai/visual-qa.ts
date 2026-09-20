import "server-only";

import { z } from "zod";
import type { VideoGeneratorInput } from "./hyperframes";
import { AIError } from "./types";
import {
  getVercelGatewayOidcHeaders,
  getVercelRuntimeOidcToken,
} from "./vercel-oidc";

const reviewSchema = z.object({
  approved: z.boolean(),
  summary: z.string().trim().min(1).max(800),
  findings: z.array(z.string().trim().min(1).max(500)).max(8),
});

export type VisualQaReview = z.infer<typeof reviewSchema>;

function authHeaders() {
  const explicitKey = process.env.AI_GATEWAY_API_KEY?.trim() || "";
  if (explicitKey) {
    return {
      Authorization: `Bearer ${explicitKey}`,
      "ai-gateway-protocol-version": "0.0.1",
    };
  }
  const oidc = getVercelRuntimeOidcToken();
  if (!oidc) {
    throw new AIError(
      "GATEWAY_NOT_CONFIGURED",
      "Vercel AI Gateway is not available for visual quality review.",
    );
  }
  return getVercelGatewayOidcHeaders(oidc);
}

const responseSchema = z
  .object({
    content: z.array(
      z
        .object({
          type: z.string(),
          text: z.string().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export async function reviewContactSheet(
  input: VideoGeneratorInput,
  contactSheetBase64: string,
  checkFindings: string,
  fetcher: typeof fetch = fetch,
): Promise<VisualQaReview> {
  if (!contactSheetBase64 || contactSheetBase64.length > 8_000_000) {
    throw new AIError(
      "VISUAL_QA_FAILED",
      "HyperFrames did not provide a usable visual QA contact sheet.",
      502,
    );
  }

  const model =
    process.env.AI_VISUAL_QA_MODEL || "google/gemini-3.1-pro-preview";
  const response = await fetcher(
    "https://ai-gateway.vercel.sh/v4/ai/language-model",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        "ai-language-model-specification-version": "4",
        "ai-language-model-id": model,
        "ai-language-model-streaming": "false",
      },
      body: JSON.stringify({
        prompt: [
          {
            role: "system",
            content:
              "You are OTR Growth's final visual QA director. Review the supplied HyperFrames contact sheet as a professional paid social advertisement. Return only strict JSON with keys approved, summary, findings. Approve only when the sampled frames are visually coherent, readable, on-brand, free of blank/loading/error states, and suitable for final rendering. Flag cropped or unreadable text, broken website framing, weak hierarchy, bad generated-footage integration, missing CTA/brand identity, obvious visual defects, and slideshow-like composition. Do not reject merely because you would prefer a different subjective style. Findings must be concrete repair instructions.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  creativeRequest: {
                    prompt: input.prompt,
                    style: input.style,
                    cta: input.cta,
                    durationSeconds: input.durationSeconds,
                    aspectRatio: input.aspectRatio,
                  },
                  hyperframesCheck: checkFindings.slice(0, 8_000),
                }),
              },
              {
                type: "file",
                filename: "otr-growth-contact-sheet.jpg",
                mediaType: "image/jpeg",
                data: { type: "data", data: contactSheetBase64 },
              },
            ],
          },
        ],
        maxOutputTokens: 1_200,
        responseFormat: { type: "json" },
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!response.ok) {
    await response.body?.cancel();
    throw new AIError(
      "VISUAL_QA_FAILED",
      `The visual QA model could not review the draft (${response.status}).`,
      502,
    );
  }

  let text = "";
  try {
    const payload = responseSchema.parse(await response.json());
    text = payload.content
      .filter(
        (part): part is typeof part & { text: string } =>
          part.type === "text" && typeof part.text === "string",
      )
      .map((part) => part.text)
      .join("");
  } catch {
    throw new AIError(
      "VISUAL_QA_FAILED",
      "The visual QA model returned an unreadable response.",
      502,
    );
  }

  try {
    return reviewSchema.parse(JSON.parse(text));
  } catch {
    throw new AIError(
      "VISUAL_QA_FAILED",
      "The visual QA model returned invalid review JSON.",
      502,
    );
  }
}
