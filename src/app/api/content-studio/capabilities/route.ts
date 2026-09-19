export const runtime = "nodejs";

export async function GET() {
  const explicitKey = process.env.AI_API_KEY?.trim() || "";
  const vercelOidc = process.env.VERCEL_OIDC_TOKEN?.trim() || "";
  const usingVercelGateway = !explicitKey && Boolean(vercelOidc);
  const aiConfigured = Boolean(explicitKey || vercelOidc);
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
          ? "vercel-ai-gateway"
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
