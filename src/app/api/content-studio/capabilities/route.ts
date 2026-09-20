import { getVercelRuntimeOidcToken } from "@/lib/ai/vercel-oidc";

export const runtime = "nodejs";

export async function GET() {
  const customKey = process.env.AI_API_KEY?.trim() || "";
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim() || "";
  const vercelOidc = getVercelRuntimeOidcToken();
  const usingVercelGateway = Boolean(gatewayKey || (!customKey && vercelOidc));
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
        ? usingVercelGateway
          ? gatewayKey
            ? "vercel-ai-gateway-key"
            : "vercel-ai-gateway-oidc"
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
