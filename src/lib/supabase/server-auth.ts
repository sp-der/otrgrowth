import "server-only";

import { getSupabaseConfig } from "./config";

export async function verifyAccessToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;

  const token = authorization.slice(7).trim();
  if (!token) return null;

  const { url, publishableKey } = getSupabaseConfig();
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return null;
    const id = (payload as Record<string, unknown>).id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}
