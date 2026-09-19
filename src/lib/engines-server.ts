import "server-only";
import { verifyAccessToken } from "./supabase/server-auth";
import { getSupabaseConfig } from "./supabase/config";
import { readLimited } from "./ai/read-limited";
export async function engineContext(request: Request) {
  const owner = await verifyAccessToken(request);
  if (!owner) throw new Error("UNAUTHORIZED");
  const { url, publishableKey } = getSupabaseConfig();
  const headers = {
    apikey: publishableKey,
    Authorization: request.headers.get("authorization")!,
    "Content-Type": "application/json",
  };
  async function db<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${url}/rest/v1${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok)
      throw new Error(
        "Database request failed. Check migrations and workspace access.",
      );
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }
  return { owner, db };
}
export async function inputJSON(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("Send application/json.");
  return JSON.parse(await readLimited(request.body, 128000)) as unknown;
}
export function engineError(error: unknown) {
  const unauth = error instanceof Error && error.message === "UNAUTHORIZED";
  return Response.json(
    {
      error: unauth
        ? "Sign in to continue."
        : error instanceof Error
          ? error.message
          : "Engine request failed.",
    },
    { status: unauth ? 401 : 400 },
  );
}
