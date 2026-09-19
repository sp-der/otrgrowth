export const runtime = "nodejs";

export async function GET() {
  const aiConfigured = Boolean(process.env.AI_API_KEY?.trim());
  const studioHost = Boolean(
    (process.env.HYPERFRAMES_STUDIO_URL ||
      "https://hyperframes-host-production.up.railway.app").trim(),
  );

  return Response.json(
    {
      aiConfigured,
      studioHost,
      model: aiConfigured ? process.env.AI_MODEL || "auto:smart" : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
