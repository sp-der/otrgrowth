import { getAIProvider } from "@/lib/ai/provider";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response("Not found", { status: 404 });
  }

  try {
    const text = await getAIProvider({
      timeoutMs: 20_000,
      maxTokens: 32,
    }).complete([
      {
        role: "user",
        content: 'Return only this JSON object: {"ok":true}',
      },
    ]);

    return Response.json(
      { ok: text.includes('"ok"'), sample: text.slice(0, 200) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
