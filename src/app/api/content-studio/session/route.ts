import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseConfig } from "@/lib/supabase/config";

const requestSchema = z.object({
  businessId: z.uuid(),
});

const COOKIE = "otr_hf_session";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid business." }, { status: 400 });
  }

  const { url, publishableKey } = getSupabaseConfig();
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
  };

  const [userResponse, businessResponse] = await Promise.all([
    fetch(`${url}/auth/v1/user`, { headers, cache: "no-store" }),
    fetch(
      `${url}/rest/v1/businesses?id=eq.${encodeURIComponent(input.businessId)}&select=id&limit=1`,
      { headers, cache: "no-store" },
    ),
  ]);

  if (!userResponse.ok) {
    return NextResponse.json({ error: "Authentication expired." }, { status: 401 });
  }
  if (!businessResponse.ok) {
    return NextResponse.json({ error: "Business lookup failed." }, { status: 502 });
  }

  const businesses = (await businessResponse.json()) as Array<{ id?: unknown }>;
  if (businesses[0]?.id !== input.businessId) {
    return NextResponse.json({ error: "Business not available." }, { status: 403 });
  }

  const payload = Buffer.from(
    JSON.stringify({
      accessToken: token,
      businessId: input.businessId,
      issuedAt: Date.now(),
    }),
    "utf8",
  ).toString("base64url");

  const response = NextResponse.json({
    ok: true,
    studioPath: "/hyperframes-studio",
  });
  response.cookies.set(COOKIE, payload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 55 * 60,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
