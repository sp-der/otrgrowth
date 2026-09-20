import "server-only";

import { z } from "zod";
import { AIError } from "./types";
import {
  getVercelGatewayOidcHeaders,
  getVercelRuntimeOidcToken,
} from "./vercel-oidc";

export const AUTONOMOUS_VIDEO_MODEL = "google/veo-3.1-fast-generate-001";
export const AUTONOMOUS_VIDEO_SECONDS = 4;
export const AUTONOMOUS_VIDEO_PRICE_PER_SECOND_USD = 0.1;
export const AUTONOMOUS_VIDEO_ESTIMATED_COST_USD =
  AUTONOMOUS_VIDEO_SECONDS * AUTONOMOUS_VIDEO_PRICE_PER_SECOND_USD;

const videoResultSchema = z.union([
  z.object({
    type: z.literal("url"),
    url: z.url(),
    mediaType: z.string().min(1),
  }),
  z.object({
    type: z.literal("base64"),
    data: z.string().min(1),
    mediaType: z.string().min(1),
  }),
]);

const startSchema = z.object({
  operation: z.unknown(),
});

const statusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }).passthrough(),
  z
    .object({
      status: z.literal("completed"),
      videos: z.array(videoResultSchema).min(1),
    })
    .passthrough(),
  z.object({ status: z.literal("error"), error: z.string() }).passthrough(),
  z.object({ status: z.literal("cancelled") }).passthrough(),
]);

type GatewayVideoResult = z.infer<typeof videoResultSchema>;

function gatewayHeaders() {
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
      "Vercel AI Gateway is not available for video generation.",
    );
  }
  return getVercelGatewayOidcHeaders(oidc);
}

async function safeDetail(response: Response) {
  try {
    return (await response.text()).slice(0, 1500);
  } catch {
    return "";
  }
}

async function gatewayBalance(fetcher: typeof fetch) {
  const response = await fetcher("https://ai-gateway.vercel.sh/v1/credits", {
    method: "GET",
    headers: gatewayHeaders(),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new AIError(
      "PROVIDER_UNAVAILABLE",
      `Could not verify AI Gateway credits before video generation (${response.status}).`,
    );
  }
  const raw = (await response.json()) as { balance?: string | number };
  const balance = Number(raw.balance);
  if (!Number.isFinite(balance) || balance < 0) {
    throw new AIError(
      "PROVIDER_UNAVAILABLE",
      "AI Gateway returned an unreadable credit balance.",
    );
  }
  return balance;
}

function assertBudget(maxBudgetUsd: number) {
  if (
    !Number.isFinite(maxBudgetUsd) ||
    maxBudgetUsd < AUTONOMOUS_VIDEO_ESTIMATED_COST_USD
  ) {
    throw new AIError(
      "BUDGET_EXCEEDED",
      `The autonomous video shot requires up to $${AUTONOMOUS_VIDEO_ESTIMATED_COST_USD.toFixed(
        2,
      )}, above this generation's video budget.`,
      402,
    );
  }
}

export async function generateAutonomousVideo(
  input: {
    prompt: string;
    aspectRatio: "9:16" | "16:9";
    maxBudgetUsd: number;
  },
  options: {
    fetcher?: typeof fetch;
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
    sleep?: (milliseconds: number) => Promise<void>;
    idempotencyKey?: string;
  } = {},
): Promise<{
  video: GatewayVideoResult;
  model: string;
  durationSeconds: number;
  estimatedCostUsd: number;
}> {
  assertBudget(input.maxBudgetUsd);

  const fetcher = options.fetcher ?? fetch;
  const balance = await gatewayBalance(fetcher);
  if (balance < AUTONOMOUS_VIDEO_ESTIMATED_COST_USD) {
    throw new AIError(
      "BUDGET_EXCEEDED",
      `AI Gateway has $${balance.toFixed(
        2,
      )} remaining, below the $${AUTONOMOUS_VIDEO_ESTIMATED_COST_USD.toFixed(
        2,
      )} maximum for this video shot.`,
      402,
    );
  }

  const commonHeaders = {
    "Content-Type": "application/json",
    ...gatewayHeaders(),
    "ai-video-model-specification-version": "4",
    "ai-model-id": AUTONOMOUS_VIDEO_MODEL,
  };
  const idempotencyKey = options.idempotencyKey ?? crypto.randomUUID();

  const started = await fetcher(
    "https://ai-gateway.vercel.sh/v4/ai/video-model/start",
    {
      method: "POST",
      headers: {
        ...commonHeaders,
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        prompt: input.prompt,
        n: 1,
        aspectRatio: input.aspectRatio,
        resolution: "720p",
        duration: AUTONOMOUS_VIDEO_SECONDS,
        generateAudio: false,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!started.ok) {
    const detail = await safeDetail(started);
    throw new AIError(
      started.status === 401 || started.status === 403
        ? "GATEWAY_NOT_CONFIGURED"
        : "VIDEO_GENERATION_FAILED",
      detail
        ? `AI Gateway video generation was rejected (${started.status}): ${detail}`
        : `AI Gateway video generation was rejected (${started.status}).`,
      started.status === 401 || started.status === 403 ? 503 : 502,
    );
  }

  let operation: unknown;
  try {
    operation = startSchema.parse(await started.json()).operation;
  } catch {
    throw new AIError(
      "MALFORMED_RESPONSE",
      "AI Gateway returned an invalid video operation.",
      502,
    );
  }

  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  const pollTimeoutMs = options.pollTimeoutMs ?? 210_000;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = Date.now() + pollTimeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const statusResponse = await fetcher(
      "https://ai-gateway.vercel.sh/v4/ai/video-model/status",
      {
        method: "POST",
        headers: commonHeaders,
        body: JSON.stringify({ operation }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!statusResponse.ok) {
      const detail = await safeDetail(statusResponse);
      throw new AIError(
        "VIDEO_GENERATION_FAILED",
        detail
          ? `AI Gateway video status failed (${statusResponse.status}): ${detail}`
          : `AI Gateway video status failed (${statusResponse.status}).`,
        502,
      );
    }

    let status: z.infer<typeof statusSchema>;
    try {
      status = statusSchema.parse(await statusResponse.json());
    } catch {
      throw new AIError(
        "MALFORMED_RESPONSE",
        "AI Gateway returned an invalid video status.",
        502,
      );
    }

    if (status.status === "pending") continue;
    if (status.status === "completed") {
      return {
        video: status.videos[0],
        model: AUTONOMOUS_VIDEO_MODEL,
        durationSeconds: AUTONOMOUS_VIDEO_SECONDS,
        estimatedCostUsd: AUTONOMOUS_VIDEO_ESTIMATED_COST_USD,
      };
    }
    if (status.status === "cancelled") {
      throw new AIError(
        "VIDEO_GENERATION_FAILED",
        "AI Gateway cancelled the video generation.",
        502,
      );
    }
    throw new AIError("VIDEO_GENERATION_FAILED", status.error, 502);
  }

  throw new AIError(
    "VIDEO_GENERATION_FAILED",
    "AI Gateway video generation did not finish within the autonomous job window. OTR Growth will not start a paid retry.",
    504,
  );
}
