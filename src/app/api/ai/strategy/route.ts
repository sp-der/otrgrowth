import { businessProfileSchema } from "@/lib/domain/schemas";
import { generateStrategy } from "@/lib/ai/client";
import { AIError } from "@/lib/ai/types";
import { readLimited } from "@/lib/ai/read-limited";
export const runtime = "nodejs";
export const maxDuration = 60;
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json(
      { code: "FORBIDDEN", error: "Cross-origin requests are not allowed." },
      403,
    );
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return json(
      {
        code: "INVALID_INPUT",
        error: "Send Business DNA as application/json.",
      },
      415,
    );
  let input: unknown;
  try {
    input = JSON.parse(await readLimited(request.body, 64_000));
  } catch (error) {
    return json(
      {
        code: "INVALID_INPUT",
        error:
          error instanceof RangeError
            ? "Business DNA exceeds the 64 KB request limit."
            : "The request must contain valid JSON.",
      },
      error instanceof RangeError ? 413 : 400,
    );
  }
  const profile = businessProfileSchema.safeParse(input);
  if (!profile.success)
    return json(
      {
        code: "INVALID_INPUT",
        error: "Check your Business DNA before generating.",
        fields: profile.error.flatten().fieldErrors,
      },
      400,
    );
  try {
    return json({
      strategy: await generateStrategy(profile.data),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AIError)
      return json({ code: error.code, error: error.message }, error.status);
    return json(
      {
        code: "INTERNAL_ERROR",
        error: "Strategy generation could not be completed. Please retry.",
      },
      500,
    );
  }
}
