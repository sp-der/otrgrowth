import { businessProfileSchema } from "@/lib/domain/schemas";
import { generateStrategy } from "@/lib/ai/client";
import { AIError } from "@/lib/ai/types";
import { readLimited } from "@/lib/ai/read-limited";
import { verifyAccessToken } from "@/lib/supabase/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

const firstHeaderValue = (value: string | null) => value?.split(",")[0]?.trim();

const isSameOrigin = (request: Request) => {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return true;

  let origin: URL;
  let requestUrl: URL;
  try {
    origin = new URL(originHeader);
    requestUrl = new URL(request.url);
  } catch {
    return false;
  }

  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    request.headers.get("host");
  const protocol =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    requestUrl.protocol.replace(":", "");

  if (host) return origin.host === host && origin.protocol === `${protocol}:`;

  return origin.origin === requestUrl.origin;
};

type Authenticator = (request: Request) => Promise<string | null>;

export async function handleStrategyRequest(
  request: Request,
  authenticate: Authenticator = verifyAccessToken,
) {
  if (!isSameOrigin(request))
    return json(
      { code: "FORBIDDEN", error: "Cross-origin requests are not allowed." },
      403,
    );

  if (!(await authenticate(request)))
    return json(
      { code: "UNAUTHORIZED", error: "Sign in to generate a strategy." },
      401,
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

export async function POST(request: Request) {
  return handleStrategyRequest(request);
}
