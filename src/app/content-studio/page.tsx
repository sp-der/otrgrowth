"use client";

import { useEffect, useState } from "react";
import { Clapperboard, RefreshCw, ShieldCheck } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { PageHeader } from "@/components/ui";
import { getAccessToken } from "@/lib/supabase/auth";

type SessionResponse = {
  ok?: boolean;
  studioPath?: string;
  error?: string;
};

export default function ContentStudioPage() {
  const { business } = useWorkspace();
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSrc("");

    async function connect() {
      const token = await getAccessToken();
      if (!token) throw new Error("Your OTR Growth session has expired.");

      const response = await fetch("/api/content-studio/session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ businessId: business.id }),
        cache: "no-store",
      });
      const payload = (await response.json()) as SessionResponse;
      if (!response.ok || !payload.studioPath) {
        throw new Error(payload.error || "Content Studio could not start.");
      }

      if (active) {
        setSrc(`${payload.studioPath}?business=${business.id}&r=${revision}`);
        setLoading(false);
      }
    }

    void connect().catch((reason: unknown) => {
      if (!active) return;
      setLoading(false);
      setError(reason instanceof Error ? reason.message : "Content Studio could not start.");
    });

    return () => {
      active = false;
    };
  }, [business.id, revision]);

  return (
    <>
      <PageHeader
        eyebrow="CONTENT PORTAL / OFFICIAL HYPERFRAMES"
        title="Content Studio"
        description={`The full HyperFrames Studio workspace for ${business.profile.businessName}, embedded inside OTR Growth.`}
        action={
          <button
            className="button"
            type="button"
            onClick={() => setRevision((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} /> Refresh Studio
          </button>
        }
      />

      <div className="studio-status-bar">
        <span>
          <ShieldCheck size={16} />
          OTR authentication active
        </span>
        <span>
          <Clapperboard size={16} />
          HyperFrames 0.8.48
        </span>
        <span className="muted">
          Project: {business.profile.businessName} · #{String(business.number).padStart(3, "0")}
        </span>
      </div>

      <section className="studio-frame-shell" aria-busy={loading}>
        {loading && (
          <div className="studio-frame-state" role="status">
            <span className="status-dot" />
            Connecting the official HyperFrames Studio…
          </div>
        )}
        {error && (
          <div className="studio-frame-state error" role="alert">
            <strong>Content Studio unavailable</strong>
            <span>{error}</span>
            <button className="button" onClick={() => setRevision((value) => value + 1)}>
              Try again
            </button>
          </div>
        )}
        {src && !error && (
          <iframe
            key={src}
            className="studio-frame"
            src={src}
            title={`HyperFrames Studio for ${business.profile.businessName}`}
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        )}
      </section>

      <p className="studio-footnote">
        OTR Growth supplies the authenticated business context. Editing, timeline behavior,
        preview, checks, media handling, and rendering are provided by the official
        HyperFrames project.
      </p>
    </>
  );
}
