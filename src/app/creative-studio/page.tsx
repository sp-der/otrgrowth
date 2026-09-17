"use client";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { PageHeader, Feedback, Empty, Badge } from "@/components/ui";
import {
  briefSchema,
  templates,
  platforms,
  renderJobSchema,
  type CreativeBrief,
  type RenderJob,
} from "@/lib/creative/schemas";
import { templateBrief } from "@/lib/creative/templates";
import { buildComposition } from "@/lib/creative/composition-builder";
import { creativeSchema, type Creative } from "@/lib/domain/schemas";
import { engineDB, engineRequest, signedRender } from "@/lib/engine-client";
const initial: CreativeBrief = {
  platform: "Instagram",
  aspectRatio: "9:16",
  durationSeconds: 15,
  template: "Service Promo",
  hook: "",
  bodyCopy: "",
  cta: "Learn more",
  scenes: [{ text: "" }],
  sourceAssets: [],
};
export default function CreativeStudio() {
  const { business, data, update } = useWorkspace();
  const campaigns = data.campaigns.filter((c) => c.businessId === business.id);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [brief, setBrief] = useState<CreativeBrief>(initial);
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Creative | null>(null);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [video, setVideo] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sceneIndex, setSceneIndex] = useState(0);
  const creatives = data.creatives.filter(
    (c) => c.businessId === business.id && c.studio,
  );
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const rows = renderJobSchema
          .array()
          .parse(
            await engineDB(
              `/creative_render_jobs?business_id=eq.${business.id}&select=id,creative_id,business_id,status,output_path,error,created_at&order=created_at.desc&limit=100`,
            ),
          );
        if (active) setJobs(rows);
      } catch (e) {
        if (active) {
          setFailed(true);
          setMessage(
            e instanceof Error ? e.message : "Render status unavailable",
          );
        }
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [business.id]);
  const campaign = campaigns.find((c) => c.id === campaignId);
  const dirty =
    !selected ||
    title !== selected.title ||
    campaignId !== selected.campaignId ||
    JSON.stringify(brief) !== JSON.stringify(selected.studio?.brief);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  function edit(c: Creative) {
    setSelected(c);
    setTitle(c.title);
    setCampaignId(c.campaignId);
    setBrief(c.studio!.brief);
    setVideo("");
    setSceneIndex(0);
  }
  async function save() {
    if (!campaign) throw new Error("Choose a campaign first.");
    const b = briefSchema.parse(brief);
    const c = creativeSchema.parse({
      id: crypto.randomUUID(),
      businessId: business.id,
      campaignId: campaign.id,
      title: title || `${b.template} · ${campaign.name}`,
      concept: campaign.objective,
      format: "Video",
      status: "Concept",
      studio: {
        brief: b,
        composition: buildComposition(business, campaign, b),
        approval: "Draft",
        previousVersionId: selected?.id,
      },
    });
    await update((w) => ({ ...w, creatives: [...w.creatives, c] }));
    edit(c);
    setMessage("New draft version saved. Previous versions are preserved.");
  }
  async function queue() {
    if (!selected || dirty)
      throw new Error("Save this version before rendering.");
    const job = renderJobSchema.parse(
      await engineRequest("/api/creative/render", {
        method: "POST",
        body: JSON.stringify({ creativeId: selected.id }),
      }),
    );
    setJobs((j) => [job, ...j.filter((x) => x.id !== job.id)]);
    setMessage(
      "Queued. A running render worker is required; status will refresh automatically.",
    );
  }
  const preview = [
    brief.hook,
    ...brief.scenes.map((s) => s.text),
    brief.bodyCopy,
    brief.cta,
  ];
  const dna =
    !dirty && selected?.studio
      ? selected.studio.composition.dna
      : business.profile.creativeDNA;
  return (
    <>
      <PageHeader
        eyebrow="CREATIVE ENGINE / HYPERFRAMES"
        title="Creative Studio"
        description="Build a branded video draft, review its scenes, and render a new version."
      />
      {!campaigns.length ? (
        <Empty title="Create a campaign first">
          Creative drafts belong to a business and campaign. Add one in
          Campaigns to begin.
        </Empty>
      ) : (
        <div className="engine-grid">
          <section className="form-section">
            <h2>Creative brief</h2>
            <div className="form-grid">
              <label className="field full">
                Version title
                <input
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="field full">
                Campaign
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                >
                  {campaigns.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Template
                <select
                  value={brief.template}
                  onChange={(e) =>
                    setBrief({
                      ...brief,
                      template: e.target.value as CreativeBrief["template"],
                    })
                  }
                >
                  {templates.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Platform
                <select
                  value={brief.platform}
                  onChange={(e) =>
                    setBrief({
                      ...brief,
                      platform: e.target.value as CreativeBrief["platform"],
                    })
                  }
                >
                  {platforms.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Aspect ratio
                <select
                  value={brief.aspectRatio}
                  onChange={(e) =>
                    setBrief({
                      ...brief,
                      aspectRatio: e.target
                        .value as CreativeBrief["aspectRatio"],
                    })
                  }
                >
                  {["9:16", "1:1", "16:9"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Duration (3–60 seconds)
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={brief.durationSeconds}
                  onChange={(e) =>
                    setBrief({
                      ...brief,
                      durationSeconds: Number(e.target.value),
                    })
                  }
                />
              </label>
              {(["hook", "bodyCopy", "cta"] as const).map((k) => (
                <label className="field full" key={k}>
                  {k === "bodyCopy"
                    ? "Message"
                    : k === "cta"
                      ? "Call to action"
                      : "Hook"}
                  <textarea
                    value={brief[k]}
                    maxLength={600}
                    onChange={(e) =>
                      setBrief({ ...brief, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
              {brief.scenes.map((s, i) => (
                <label className="field full" key={i}>
                  Scene {i + 1}
                  <textarea
                    value={s.text}
                    maxLength={600}
                    onChange={(e) =>
                      setBrief({
                        ...brief,
                        scenes: brief.scenes.map((v, n) =>
                          n === i ? { text: e.target.value } : v,
                        ),
                      })
                    }
                  />
                  {brief.scenes.length > 1 && (
                    <button
                      className="text-link"
                      onClick={() => {
                        setBrief({
                          ...brief,
                          scenes: brief.scenes.filter((_, n) => n !== i),
                        });
                        setSceneIndex(0);
                      }}
                    >
                      Remove scene
                    </button>
                  )}
                </label>
              ))}
            </div>
            <div className="engine-actions">
              <button
                className="button"
                disabled={!campaign || busy}
                onClick={() => {
                  if (campaign) {
                    setBrief(templateBrief(brief.template, business, campaign));
                    setSceneIndex(0);
                  }
                }}
              >
                Fill from campaign & DNA
              </button>
              <button
                className="button"
                disabled={brief.scenes.length >= 8}
                onClick={() =>
                  setBrief({
                    ...brief,
                    scenes: [...brief.scenes, { text: "" }],
                  })
                }
              >
                Add scene
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void task(save)}
              >
                Save new version
              </button>
              <button
                className="button"
                disabled={busy || dirty}
                onClick={() => void task(queue)}
              >
                Submit render
              </button>
            </div>
            <p className="muted">
              This first renderer creates text-led videos. Uploaded images,
              music, and logo compositing are not enabled.
            </p>
          </section>
          <aside>
            <section className="form-section">
              <h2>Composition preview</h2>
              <p>
                Scene structure preview · equal scene timing · {brief.template}
              </p>
              <div
                className="composition-preview"
                style={{
                  aspectRatio: brief.aspectRatio.replace(":", "/"),
                  background: dna?.primaryColor || "#181426",
                  color: dna?.secondaryColor || "#ffffff",
                  fontFamily: dna?.headingFont || "Arial",
                }}
              >
                <small style={{ color: dna?.accentColor || "#a78bfa" }}>
                  {business.profile.businessName}
                </small>
                <h2>{preview[sceneIndex] || "Your scene copy"}</h2>
                <span>
                  {sceneIndex + 1} / {preview.length}
                </span>
              </div>
              <label className="field">
                Scene
                <input
                  aria-label="Preview scene"
                  type="range"
                  min={0}
                  max={preview.length - 1}
                  value={sceneIndex}
                  onChange={(e) => setSceneIndex(Number(e.target.value))}
                />
              </label>
            </section>
            <section className="form-section">
              <h2>Review & render</h2>
              {selected && (
                <>
                  <Badge>{selected.studio!.approval}</Badge>
                  <div className="engine-actions">
                    {(["In review", "Approved", "Rejected"] as const).map(
                      (state) => (
                        <button
                          className="button"
                          disabled={busy || dirty}
                          key={state}
                          onClick={() =>
                            void task(async () => {
                              const changed = {
                                ...selected,
                                studio: {
                                  ...selected.studio!,
                                  approval: state,
                                },
                              };
                              await update((w) => ({
                                ...w,
                                creatives: w.creatives.map((c) =>
                                  c.id === changed.id ? changed : c,
                                ),
                              }));
                              setSelected(changed);
                              setMessage(
                                "Review recorded. No publishing or ad-account action was performed.",
                              );
                            })
                          }
                        >
                          {state}
                        </button>
                      ),
                    )}
                  </div>
                </>
              )}
              {jobs
                .filter((j) => j.creative_id === selected?.id)
                .map((j) => (
                  <div className="engine-job" key={j.id}>
                    <Badge>{j.status}</Badge>
                    <small>{new Date(j.created_at).toLocaleString()}</small>
                    {j.error && <p role="alert">{j.error}</p>}
                    {j.output_path && (
                      <button
                        className="text-link"
                        onClick={() =>
                          void task(async () =>
                            setVideo(await signedRender(j.output_path!)),
                          )
                        }
                      >
                        View video
                      </button>
                    )}
                  </div>
                ))}
              {video && <video controls src={video} className="render-video" />}
              <p className="muted">
                Human review is mandatory. No publishing controls are enabled.
              </p>
            </section>
          </aside>
        </div>
      )}
      <Feedback message={message} error={failed} />
      <section className="form-section">
        <h2>Saved versions</h2>
        <div className="engine-list">
          {creatives.length ? (
            creatives
              .slice()
              .reverse()
              .map((c) => (
                <button
                  className="engine-version"
                  key={c.id}
                  onClick={() => edit(c)}
                >
                  <strong>{c.title}</strong>
                  <span>
                    {c.studio!.brief.platform} · {c.studio!.brief.aspectRatio} ·{" "}
                    {c.studio!.approval}
                  </span>
                </button>
              ))
          ) : (
            <p>No video drafts yet.</p>
          )}
        </div>
      </section>
    </>
  );
}
