"use client";

import { getSupabaseConfig } from "./config";

export type AuthUser = {
  id: string;
  email?: string | null;
};

type StoredSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
};

type AuthPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  expires_at?: unknown;
  user?: unknown;
  msg?: unknown;
  error?: unknown;
  error_description?: unknown;
};

const SESSION_KEY = "otr-growth:supabase-session:v1";
let refreshPromise: Promise<StoredSession | null> | null = null;

function storageAvailable() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readSession(): StoredSession | null {
  if (!storageAvailable()) return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      !parsed.user ||
      typeof parsed.user.id !== "string"
    ) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed as StoredSession;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function writeSession(session: StoredSession | null) {
  if (!storageAvailable()) return;
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function parseUser(value: unknown): AuthUser | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string") return null;
  return {
    id: record.id,
    email: typeof record.email === "string" ? record.email : null,
  };
}

function sessionFromPayload(payload: AuthPayload): StoredSession | null {
  if (
    typeof payload.access_token !== "string" ||
    typeof payload.refresh_token !== "string"
  ) {
    return null;
  }
  const user = parseUser(payload.user);
  if (!user) return null;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt =
    typeof payload.expires_at === "number"
      ? payload.expires_at
      : now +
        (typeof payload.expires_in === "number" ? payload.expires_in : 3600);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt,
    user,
  };
}

async function authFetch(path: string, init: RequestInit) {
  const { url, publishableKey } = getSupabaseConfig();
  return fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
}

async function readAuthError(response: Response) {
  let payload: AuthPayload = {};
  try {
    payload = (await response.json()) as AuthPayload;
  } catch {}
  for (const value of [payload.msg, payload.error_description, payload.error]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "Authentication request failed. Please try again.";
}

async function refreshSession(current: StoredSession) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const response = await authFetch("/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: current.refreshToken }),
    });
    if (!response.ok) {
      writeSession(null);
      return null;
    }
    const payload = (await response.json()) as AuthPayload;
    const next = sessionFromPayload(payload);
    writeSession(next);
    return next;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function getAccessToken() {
  const session = readSession();
  if (!session) return null;
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt - now > 60) return session.accessToken;
  return (await refreshSession(session))?.accessToken ?? null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const response = await authFetch("/user", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    writeSession(null);
    return null;
  }
  return parseUser(await response.json());
}

export async function signIn(email: string, password: string) {
  const response = await authFetch("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await readAuthError(response));
  const session = sessionFromPayload((await response.json()) as AuthPayload);
  if (!session) throw new Error("Supabase did not return a valid session.");
  writeSession(session);
  return session.user;
}

export async function signUp(email: string, password: string) {
  const response = await authFetch("/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await readAuthError(response));
  const payload = (await response.json()) as AuthPayload;
  const session = sessionFromPayload(payload);
  if (session) writeSession(session);
  return {
    user: session?.user ?? parseUser(payload.user),
    authenticated: Boolean(session),
    needsConfirmation: !session,
  };
}

export async function signOut() {
  const token = await getAccessToken();
  if (token) {
    try {
      await authFetch("/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }
  writeSession(null);
}
