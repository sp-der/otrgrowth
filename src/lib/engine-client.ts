"use client";
import { getAccessToken } from "./supabase/auth";
import { getSupabaseConfig } from "./supabase/config";
export async function engineRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.message || "Request failed.");
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}
export function engineDB<T>(path: string, init: RequestInit = {}) {
  const { url, publishableKey } = getSupabaseConfig();
  return engineRequest<T>(`${url}/rest/v1${path}`, {
    ...init,
    headers: { apikey: publishableKey, ...init.headers },
  });
}
