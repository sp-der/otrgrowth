"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, LoaderCircle, LockKeyhole } from "lucide-react";
import {
  getCurrentUser,
  signIn,
  signUp,
  type AuthUser,
} from "@/lib/supabase/auth";

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((current) => {
        if (active) setUser(current);
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Authentication could not be checked.",
          );
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signin") {
        setUser(await signIn(email.trim(), password));
        return;
      }
      const result = await signUp(email.trim(), password);
      if (result.authenticated && result.user) {
        setUser(result.user);
        return;
      }
      setMessage(
        "Account created. Check your email to confirm it, then sign in here.",
      );
      setMode("signin");
      setPassword("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Authentication failed. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (checking)
    return (
      <div className="load-screen" role="status">
        <span className="brand-mark">
          <ArrowUpRight size={25} />
        </span>
        <p>Securing your workspace…</p>
      </div>
    );

  if (!user)
    return (
      <main className="min-h-screen grid place-items-center px-5 py-10">
        <section className="panel w-full max-w-md p-7 sm:p-9">
          <div className="mb-7 flex items-start justify-between gap-6">
            <div>
              <span className="eyebrow">OTR GROWTH / SECURE ACCESS</span>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                Marketing command center.
              </h1>
              <p className="mt-3 muted">
                Sign in to load your synced Business DNA, strategies, content,
                campaigns and analytics.
              </p>
            </div>
            <span className="brand-mark shrink-0">
              <LockKeyhole size={22} />
            </span>
          </div>

          <form className="grid gap-4" onSubmit={submit}>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Password</span>
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>

            {error && (
              <p className="feedback error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="feedback" role="status">
                {message}
              </p>
            )}

            <button className="button primary mt-2" disabled={submitting}>
              {submitting && <LoaderCircle className="spin" size={16} />}
              {submitting
                ? mode === "signin"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <button
            className="text-link mt-5"
            type="button"
            onClick={() => {
              setMode((current) =>
                current === "signin" ? "signup" : "signin",
              );
              setError("");
              setMessage("");
            }}
          >
            {mode === "signin"
              ? "First time here? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </section>
      </main>
    );

  return children;
}
