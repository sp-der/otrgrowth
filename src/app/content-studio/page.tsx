"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clapperboard,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
  Upload,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { PageHeader } from "@/components/ui";
import { getAccessToken } from "@/lib/supabase/auth";

type SessionResponse = {
  ok?: boolean;
  studioPath?: string;
  error?: string;
};

type GenerateResponse = {
  ok?: boolean;
  title?: string;
  summary?: string;
  error?: string;
  findings?: string;
};

const OTR_SITES = [
  "https://pressedinpink.com",
  "https://pacificstayproperties.com",
  "https://jmb2creations.com",
  "https://mdhgrill.com",
];

function StudioFrame({
  businessId,
  businessName,
  revision,
}: {
  businessId: string;
  businessName: string;
  revision: number;
}) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function connect() {
      const token = await getAccessToken();
      if (!token) throw new Error("Your OTR Growth session has expired.");

      const response = await fetch("/api/content-studio/session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ businessId }),
        cache: "no-store",
      });
      const payload = (await response.json()) as SessionResponse;
      if (!response.ok || !payload.studioPath) {
        throw new Error(payload.error || "Content Studio could not start.");
      }

      if (active) {
        setSrc(
          `${payload.studioPath}?business=${encodeURIComponent(businessId)}&r=${revision}`,
        );
        setLoading(false);
      }
    }

    void connect().catch((reason: unknown) => {
      if (!active) return;
      setLoading(false);
      setError(
        reason instanceof Error
          ? reason.message
          : "Content Studio could not start.",
      );
    });

    return () => {
      active = false;
    };
  }, [businessId, revision]);

  return (
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
        </div>
      )}
      {src && !error && (
        <iframe
          className="studio-frame"
          src={src}
          title={`HyperFrames Studio for ${businessName}`}
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      )}
    </section>
  );
}

async function fileAsBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function GeneratorPanel({
  businessId,
  businessName,
  onClose,
  onGenerated,
}: {
  businessId: string;
  businessName: string;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const isOtr = businessName.trim().toLowerCase() === "otr services";
  const [prompt, setPrompt] = useState(
    isOtr
      ? "Create a premium 30-second Instagram Reel for OTR Services. Open with the OTR logo, showcase our published websites with energetic browser and device motion, then finish with our website design, management and branding services plus a strong OTR end card."
      : `Create a polished promotional video for ${businessName} using the supplied Business DNA and website captures.`,
  );
  const [durationSeconds, setDurationSeconds] = useState<15 | 30 | 45>(30);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [style, setStyle] = useState(
    isOtr
      ? "Premium modern agency reel. Black and white foundation, restrained purple accents, crisp typography, fast but controlled motion, layered browser windows, depth and seamless transitions. Never a slideshow."
      : "Modern, polished, brand-consistent, cinematic and mobile-readable.",
  );
  const [cta, setCta] = useState(
    isOtr ? "Built to represent your business right. @otrservicesie" : "",
  );
  const [websitesText, setWebsitesText] = useState(
    isOtr ? OTR_SITES.join("\n") : "",
  );
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const websites = useMemo(
    () =>
      websitesText
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
    [websitesText],
  );

  async function generate() {
    setBusy(true);
    setError("");
    setStatus("Preparing business context and creative brief…");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Your OTR Growth session has expired.");

      let encodedLogo:
        | { name: string; mimeType: "image/png" | "image/jpeg" | "image/webp"; dataBase64: string }
        | undefined;
      if (logo) {
        if (!["image/png", "image/jpeg", "image/webp"].includes(logo.type)) {
          throw new Error("Use a PNG, JPG, or WebP logo.");
        }
        if (logo.size > 2_200_000) {
          throw new Error("Logo must be 2.2 MB or smaller.");
        }
        setStatus("Reading logo…");
        encodedLogo = {
          name: logo.name,
          mimeType: logo.type as "image/png" | "image/jpeg" | "image/webp",
          dataBase64: await fileAsBase64(logo),
        };
      }

      setStatus("AI is directing the native HyperFrames composition…");
      const response = await fetch("/api/content-studio/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          businessId,
          prompt,
          durationSeconds,
          aspectRatio,
          style,
          cta,
          websites,
          logo: encodedLogo,
        }),
        cache: "no-store",
      });
      const payload = (await response.json()) as GenerateResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(
          [payload.error, payload.findings].filter(Boolean).join("\n\n") ||
            "Video generation failed.",
        );
      }

      setStatus(
        payload.title
          ? `${payload.title} is ready. Reloading Studio…`
          : "Video project is ready. Reloading Studio…",
      );
      onGenerated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Video generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="generator-backdrop" role="dialog" aria-modal="true" aria-label="Generate video">
      <section className="generator-panel">
        <div className="generator-head">
          <div>
            <span className="eyebrow">OTR AI VIDEO DIRECTOR</span>
            <h2>Generate a HyperFrames video</h2>
            <p>
              AI authors the native project. HyperFrames checks, edits and renders it.
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="generator-grid">
          <label className="generator-wide">
            <span>Creative prompt</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} />
          </label>

          <label>
            <span>Length</span>
            <select value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value) as 15 | 30 | 45)}>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={45}>45 seconds</option>
            </select>
          </label>

          <label>
            <span>Format</span>
            <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as "9:16" | "16:9" | "1:1")}>
              <option value="9:16">Instagram Reel / Story · 9:16</option>
              <option value="16:9">Landscape · 16:9</option>
              <option value="1:1">Square · 1:1</option>
            </select>
          </label>

          <label className="generator-wide">
            <span>Visual direction</span>
            <textarea value={style} onChange={(event) => setStyle(event.target.value)} rows={3} />
          </label>

          <label className="generator-wide">
            <span>Website URLs · one per line</span>
            <textarea
              value={websitesText}
              onChange={(event) => setWebsitesText(event.target.value)}
              rows={4}
              placeholder="https://example.com"
            />
            <small>OTR captures these into local project assets before HyperFrames validates the composition.</small>
          </label>

          <label className="generator-wide">
            <span>CTA / end card</span>
            <input value={cta} onChange={(event) => setCta(event.target.value)} placeholder="Book now · Learn more · @handle" />
          </label>

          <label className="generator-wide generator-upload">
            <span>Logo · optional</span>
            <div>
              <Upload size={16} />
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setLogo(event.target.files?.[0] ?? null)}
              />
              <strong>{logo?.name || "Choose PNG, JPG or WebP"}</strong>
            </div>
          </label>
        </div>

        {status && <p className="generator-status">{status}</p>}
        {error && <pre className="generator-error">{error}</pre>}

        <div className="generator-actions">
          <button className="button" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="button primary"
            type="button"
            onClick={() => void generate()}
            disabled={busy || prompt.trim().length < 10 || websites.length > 8}
          >
            <Sparkles size={16} />
            {busy ? "Generating…" : "Generate video"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function ContentStudioPage() {
  const { business } = useWorkspace();
  const [revision, setRevision] = useState(0);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/content-studio/capabilities", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { aiConfigured?: boolean }) => {
        if (active) setAiReady(Boolean(payload.aiConfigured));
      })
      .catch(() => {
        if (active) setAiReady(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="CONTENT PORTAL / OFFICIAL HYPERFRAMES"
        title="Content Studio"
        description={`The full HyperFrames Studio workspace for ${business.profile.businessName}, embedded inside OTR Growth.`}
        action={
          <div className="studio-head-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => setGeneratorOpen(true)}
              disabled={aiReady === false}
              title={aiReady === false ? "Configure AI_API_KEY on the OTR Growth deployment first." : undefined}
            >
              <Sparkles size={16} /> Generate Video
            </button>
            <button className="button" type="button" onClick={() => setRevision((value) => value + 1)}>
              <RefreshCw size={16} /> Refresh Studio
            </button>
          </div>
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
          Project: {business.profile.businessName} · #
          {String(business.number).padStart(3, "0")}
        </span>
        <span className={aiReady === false ? "studio-ai-state is-off" : "studio-ai-state"}>
          <Sparkles size={14} />
          {aiReady === null ? "Checking AI…" : aiReady ? "AI director ready" : "AI gateway not configured"}
        </span>
      </div>

      <StudioFrame
        key={`${business.id}:${revision}`}
        businessId={business.id}
        businessName={business.profile.businessName}
        revision={revision}
      />

      <p className="studio-footnote">
        OTR Growth supplies the authenticated business context and AI direction.
        Editing, timeline behavior, validation, media handling and rendering are
        provided by the official HyperFrames project.
      </p>

      {generatorOpen && (
        <GeneratorPanel
          businessId={business.id}
          businessName={business.profile.businessName}
          onClose={() => setGeneratorOpen(false)}
          onGenerated={() => {
            setGeneratorOpen(false);
            setRevision((value) => value + 1);
          }}
        />
      )}
    </>
  );
}
