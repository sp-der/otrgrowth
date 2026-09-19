import { getVercelRuntimeOidcToken } from "@/lib/ai/vercel-oidc";

export const runtime = "nodejs";

export async function GET() {
  const customKey = process.env.AI_API_KEY?.trim() || "";
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim() || "";
  const vercelOidc = getVercelRuntimeOidcToken();
  const usingGatewayKey = Boolean(gatewayKey) && !customKey;
  const usingVercelOidc = !customKey && !gatewayKey && Boolean(vercelOidc);
  const usingVercelGateway = usingGatewayKey || usingVercelOidc;
  const aiConfigured = Boolean(customKey || gatewayKey || vercelOidc);
  const studioHost = Boolean(
    (process.env.HYPERFRAMES_STUDIO_URL ||
      "https://hyperframes-host-production.up.railway.app").trim(),
  );

  return Response.json(
    {
      aiConfigured,
      studioHost,
      provider: aiConfigured
        ? usingGatewayKey
          ? "vercel-ai-gateway-key"
          : usingVercelOidc
            ? "vercel-ai-gateway-oidc"
            : "custom-openai-compatible"
        : null,
      model: aiConfigured
        ? process.env.AI_MODEL ||
          (usingVercelGateway ? "openai/gpt-5.6-sol" : "auto:smart")
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
