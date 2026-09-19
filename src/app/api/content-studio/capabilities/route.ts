import {
  getVercelRuntimeOidcToken,
  inspectVercelGatewayOidc,
} from "@/lib/ai/vercel-oidc";
import { getAIProvider } from "@/lib/ai/provider";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const explicitKey = process.env.AI_API_KEY?.trim() || "";
  const vercelOidc = getVercelRuntimeOidcToken();
  const usingVercelGateway = !explicitKey && Boolean(vercelOidc);
  const model =
    process.env.AI_MODEL ||
    (usingVercelGateway ? "openai/gpt-5.6-sol" : "auto:smart");
  const gateway = usingVercelGateway
    ? await inspectVercelGatewayOidc(vercelOidc, model)
    : null;
  const aiConfigured = Boolean(
    explicitKey || (gateway?.authenticated && gateway.modelAvailable),
  );
  const studioHost = Boolean(
    (process.env.HYPERFRAMES_STUDIO_URL ||
      "https://hyperframes-host-production.up.railway.app").trim(),
  );

  let completionProbe: { ok: boolean; error?: string } | null = null;
  const wantsCompletionProbe =
    process.env.VERCEL_ENV === "preview" &&
    new URL(request.url).searchParams.get("completionProbe") === "1";
  if (wantsCompletionProbe) {
    try {
      const result = await getAIProvider({
        timeoutMs: 15_000,
        maxTokens: 16,
      }).complete([
        {
          role: "user",
          content: 'Return only this JSON object: {"ok":true}',
        },
      ]);
      completionProbe = { ok: result.includes('"ok"') };
    } catch (error) {
      completionProbe = {
        ok: false,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }

  return Response.json(
    {
      aiConfigured,
      studioHost,
      provider: aiConfigured
        ? usingVercelGateway
          ? "vercel-ai-gateway"
          : "custom-openai-compatible"
        : null,
      model: aiConfigured ? model : null,
      gatewayAuthenticated: gateway?.authenticated ?? null,
      gatewayModelAvailable: gateway?.modelAvailable ?? null,
      gatewayCreditsStatus: gateway?.creditsStatus ?? null,
      gatewayConfigStatus: gateway?.configStatus ?? null,
      completionProbe,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
