import {
  AUTONOMOUS_VIDEO_ESTIMATED_COST_USD,
  AUTONOMOUS_VIDEO_MODEL,
} from "@/lib/ai/video-gateway";
import {
  getVercelRuntimeOidcToken,
  inspectVercelGatewayOidc,
} from "@/lib/ai/vercel-oidc";

export const runtime = "nodejs";

export async function GET() {
  const explicitKey = process.env.AI_API_KEY?.trim() || "";
  const vercelOidc = getVercelRuntimeOidcToken();
  const usingVercelGateway = !explicitKey && Boolean(vercelOidc);
  const model =
    process.env.AI_MODEL ||
    (usingVercelGateway ? "openai/gpt-5.6-sol" : "auto:smart");
  const [gateway, videoGateway] = usingVercelGateway
    ? await Promise.all([
        inspectVercelGatewayOidc(vercelOidc, model),
        inspectVercelGatewayOidc(vercelOidc, AUTONOMOUS_VIDEO_MODEL),
      ])
    : [null, null];
  const aiConfigured = Boolean(
    explicitKey || (gateway?.authenticated && gateway.modelAvailable),
  );
  const videoConfigured = Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      (videoGateway?.authenticated && videoGateway.modelAvailable),
  );
  const studioHost = Boolean(
    (process.env.HYPERFRAMES_STUDIO_URL ||
      "https://hyperframes-host-production.up.railway.app").trim(),
  );

  return Response.json(
    {
      aiConfigured,
      studioHost,
      provider: aiConfigured
        ? usingVercelGateway
          ? "vercel-ai-gateway-native-v4"
          : "custom-openai-compatible"
        : null,
      model: aiConfigured ? model : null,
      gatewayAuthenticated: gateway?.authenticated ?? null,
      gatewayModelAvailable: gateway?.modelAvailable ?? null,
      gatewayCreditsStatus: gateway?.creditsStatus ?? null,
      gatewayConfigStatus: gateway?.configStatus ?? null,
      videoConfigured,
      videoModel: AUTONOMOUS_VIDEO_MODEL,
      videoModelAvailable: videoGateway?.modelAvailable ?? null,
      maximumPaidVideoCostUsd: AUTONOMOUS_VIDEO_ESTIMATED_COST_USD,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
