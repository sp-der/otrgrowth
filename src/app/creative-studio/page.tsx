"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { PageHeader, Feedback, Empty, Badge } from "@/components/ui";
import {
  animationPresets,
  briefSchema,
  creativeAssetRowSchema,
  platforms,
  renderJobSchema,
  sceneSchema,
  sceneTypes,
  templates,
  transitionPresets,
  type CreativeAssetRow,
  type CreativeBrief,
  type CreativeScene,
  type RenderJob,
  type SourceAsset,
} from "@/lib/creative/schemas";
import { templateBrief } from "@/lib/creative/templates";
import { buildComposition } from "@/lib/creative/composition-builder";
import { creativeSchema, type Creative } from "@/lib/domain/schemas";
import { engineDB, engineRequest, signedRender } from "@/lib/engine-client";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/supabase/auth";

const initial = briefSchema.parse({
  platform: "Instagram",
  aspectRatio: "9:16",
  durationSeconds: 15,
  template: "Service Promo",
  hook: "",
  bodyCopy: "",
  cta: "Learn more",
  scenes: [{ text: "", durationSeconds: 3 }],
});

function sourceAsset(row: CreativeAssetRow): SourceAsset {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
  };
}

function extensionFor(file: File) {
  const byMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
  };
  return byMime[file.type] || file.name.split(".").at(-1)?.toLowerCase() || "bin";
}

function encodedPath(path: string) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export default function CreativeStudio() {
  const { business, data, update } = useWorkspace();
  const campaigns = data.campaigns.filter((c) => c.businessId === business.id);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [brief, setBrief] = useState<CreativeBrief>(initial);
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Creative | null>(null);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [assets, setAssets] = useState<CreativeAssetRow[]>([]);
  const [assetKind, setAssetKind] = useState<CreativeAssetRow["kind"]>("image");
  const [video, setVideo] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sceneIndex, setSceneIndex] = useState(0);

  const creatives = data.creatives.filter(
    (c) => c.businessId === business.id && c.studio,
  );

  const sourceAssets = useMemo(() => assets.map(sourceAsset), [assets]);
  const visualAssets = useMemo(
    () => sourceAssets.filter((asset) => asset.kind === "image" || asset.kind === "video"),
    [sourceAssets],
  );
  const logoAssets = useMemo(
    () => sourceAssets.filter((asset) => asset.kind === "logo"),
    [sourceAssets],
  );
  const audioAssets = useMemo(
    () => sourceAssets.filter((asset) => asset.kind === "audio"),
    [sourceAssets],
  );

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const [renderRows, assetRows] = await Promise.all([
          engineDB(
            `/creative_render_jobs?business_id=eq.${business.id}&select=id,creative_id,business_id,status,output_path,error,created_at&order=created_at.desc&limit=100`,
          ),
          engineDB(
            `/creative_assets?business_id=eq.${business.id}&select=id,business_id,kind,label,storage_path,mime_type,width,height,duration_seconds,created_at&order=created_at.desc`,
          ),
        ]);
        if (!active) return;
        setJobs(renderJobSchema.array().parse(renderRows));
        const parsedAssets = creativeAssetRowSchema.array().parse(assetRows);
        setAssets(parsedAssets);
        setBrief((current) => ({
          ...current,
          sourceAssets: parsedAssets.map(sourceAsset),
        }));
      } catch (error) {
        if (active) {
          setFailed(true);
          setMessage(
            error instanceof Error ? error.message : "Creative Studio data unavailable",
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
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Could not complete that action.");
    } finally {
      setBusy(false);
    }
  }

  function edit(creative: Creative) {
    setSelected(creative);
    setTitle(creative.title);
    setCampaignId(creative.campaignId);
    setBrief({
      ...creative.studio!.brief,
      sourceAssets,
    });
    setVideo("");
    setSceneIndex(0);
  }

  function updateScene(index: number, patch: Partial<CreativeScene>) {
    setBrief((current) => ({
      ...current,
      scenes: current.scenes.map((scene, i) =>
        i === index ? sceneSchema.parse({ ...scene, ...patch }) : scene,
      ),
    }));
  }

  function moveScene(index: number, direction: -1 | 1) {
    setBrief((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.scenes.length) return current;
      const scenes = current.scenes.slice();
      [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
      return { ...current, scenes };
    });
    setSceneIndex((current) => Math.max(0, current + direction));
  }

  async function uploadAsset(file: File) {
    const owner = await getCurrentUser();
    if (!owner) throw new Error("Sign in to upload creative assets.");
    const id = crypto.randomUUID();
    const ext = extensionFor(file);
    const storagePath = `${owner.id}/${business.id}/${id}.${ext}`;
    const inserted = creativeAssetRowSchema
      .array()
      .parse(
        await engineDB("/creative_assets", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            id,
            business_id: business.id,
            kind: assetKind,
            label: file.name.slice(0, 200),
            storage_path: storagePath,
            mime_type: file.type,
          }),
        }),
      )[0];
    if (!inserted) throw new Error("Asset metadata could not be created.");

    const { url, publishableKey } = getSupabaseConfig();
    await engineRequest(
      `${url}/storage/v1/object/creative-assets/${encodedPath(storagePath)}`,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "Content-Type": file.type,
          "x-upsert": "false",
        },
        body: file,
      },
    );

    const next = [inserted, ...assets];
    setAssets(next);
    setBrief((current) => ({
      ...current,
      sourceAssets: next.map(sourceAsset),
    }));
    setMessage(`${assetKind} uploaded and ready for scene planning.`);
  }

  async function save() {
    if (!campaign) throw new Error("Choose a campaign first.");
    const parsedBrief = briefSchema.parse({ ...brief, sourceAssets });
    const creative = creativeSchema.parse({
      id: crypto.randomUUID(),
      businessId: business.id,
      campaignId: campaign.id,
      title: title || `${parsedBrief.template} · ${campaign.name}`,
      concept: campaign.objective,
      format: "Video",
      status: "Concept",
      studio: {
        brief: parsedBrief,
        composition: buildComposition(business, campaign, parsedBrief),
        approval: "Draft",
        previousVersionId: selected?.id,
      },
    });
    await update((workspace) => ({
      ...workspace,
      creatives: [...workspace.creatives, creative],
    }));
    edit(creative);
    setMessage("New V2 draft saved. Previous versions are preserved.");
  }

  async function queue() {
    if (!selected || dirty) throw new Error("Save this version before rendering.");
    const job = renderJobSchema.parse(
      await engineRequest("/api/creative/render", {
        method: "POST",
        body: JSON.stringify({ creativeId: selected.id }),
      }),
    );
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
    setMessage("Queued for HyperFrames rendering. Status refreshes automatically.");
  }

  function generatePlan() {
    if (!campaign) return;
    setBrief(
      templateBrief(brief.template, business, campaign, {
        assets: sourceAssets,
        durationSeconds: brief.durationSeconds,
        platform: brief.platform,
        aspectRatio: brief.aspectRatio,
      }),
    );
    setSceneIndex(0);
    setMessage("Scene plan generated from campaign, Creative DNA, timing and uploaded assets.");
  }

  const dna =
    !dirty && selected?.studio
      ? selected.studio.composition.dna
      : business.profile.creativeDNA;
  const activeScene = brief.scenes[Math.min(sceneIndex, brief.scenes.length - 1)];

  return (
    <>
      <PageHeader
        eyebrow="CREATIVE ENGINE V2 / HYPERFRAMES"
        title="Creative Studio"
        description="Plan media-driven scenes, tune motion and sound, then render a reviewable branded ad."
      />

      {!campaigns.length ? (
        <Empty title="Create a campaign first">
          Creative drafts belong to a business and campaign. Add one in Campaigns to begin.
        </Empty>
      ) : (
        <div className="engine-grid">
          <section>
            <section className="form-section">
              <h2>Asset library</h2>
              <p className="muted">
                Upload images, MP4/WebM clips, logos, or music. Assets stay private in Supabase Storage.
              </p>
              <div className="engine-actions">
                <select
                  aria-label="Asset kind"
                  value={assetKind}
                  onChange={(event) =>
                    setAssetKind(event.target.value as CreativeAssetRow["kind"])
                  }
                >
                  {(["image", "video", "logo", "audio"] as const).map((kind) => (
                    <option key={kind}>{kind}</option>
                  ))}
                </select>
                <label className="button">
                  Upload {assetKind}
                  <input
                    hidden
                    type="file"
                    accept={
                      assetKind === "image"
                        ? "image/png,image/jpeg,image/webp"
                        : assetKind === "video"
                          ? "video/mp4,video/webm"
                          : assetKind === "logo"
                            ? "image/png,image/jpeg,image/webp"
                            : "audio/mpeg,audio/wav,audio/mp4,audio/ogg"
                    }
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void task(() => uploadAsset(file));
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
              <div className="engine-list">
                {assets.map((asset) => (
                  <div className="engine-version" key={asset.id}>
                    <strong>{asset.label}</strong>
                    <span>{asset.kind} · {asset.mime_type}</span>
                  </div>
                ))}
                {!assets.length && <p className="muted">No media assets yet.</p>}
              </div>
            </section>

            <section className="form-section">
              <h2>Creative brief</h2>
              <div className="form-grid">
                <label className="field full">
                  Version title
                  <input
                    value={title}
                    maxLength={200}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="field full">
                  Campaign
                  <select
                    value={campaignId}
                    onChange={(event) => setCampaignId(event.target.value)}
                  >
                    {campaigns.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Template
                  <select
                    value={brief.template}
                    onChange={(event) =>
                      setBrief({
                        ...brief,
                        template: event.target.value as CreativeBrief["template"],
                      })
                    }
                  >
                    {templates.map((template) => (
                      <option key={template}>{template}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Platform
                  <select
                    value={brief.platform}
                    onChange={(event) =>
                      setBrief({
                        ...brief,
                        platform: event.target.value as CreativeBrief["platform"],
                      })
                    }
                  >
                    {platforms.map((platform) => (
                      <option key={platform}>{platform}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Aspect ratio
                  <select
                    value={brief.aspectRatio}
                    onChange={(event) =>
                      setBrief({
                        ...brief,
                        aspectRatio: event.target.value as CreativeBrief["aspectRatio"],
                      })
                    }
                  >
                    {["9:16", "1:1", "16:9"].map((ratio) => (
                      <option key={ratio}>{ratio}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Duration
                  <input
                    type="number"
                    min={3}
                    max={60}
                    value={brief.durationSeconds}
                    onChange={(event) =>
                      setBrief({ ...brief, durationSeconds: Number(event.target.value) })
                    }
                  />
                </label>
                {(["hook", "bodyCopy", "cta"] as const).map((key) => (
                  <label className="field full" key={key}>
                    {key === "bodyCopy"
                      ? "Core message"
                      : key === "cta"
                        ? "Global call to action"
                        : "Hook"}
                    <textarea
                      value={brief[key]}
                      maxLength={600}
                      onChange={(event) =>
                        setBrief({ ...brief, [key]: event.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="engine-actions">
                <button className="button" disabled={!campaign || busy} onClick={generatePlan}>
                  Generate scene plan
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
            </section>

            <section className="form-section">
              <h2>Scene timeline</h2>
              <p className="muted">
                Each scene controls its own timing, media, motion, transition, text and overlay.
              </p>
              {brief.scenes.map((scene, index) => (
                <div
                  key={scene.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: 16,
                    marginTop: 14,
                  }}
                >
                  <div className="section-line">
                    <strong>Scene {index + 1} · {scene.type}</strong>
                    <div className="engine-actions" style={{ margin: 0 }}>
                      <button className="button quiet" disabled={index === 0} onClick={() => moveScene(index, -1)}>↑</button>
                      <button className="button quiet" disabled={index === brief.scenes.length - 1} onClick={() => moveScene(index, 1)}>↓</button>
                      {brief.scenes.length > 1 && (
                        <button
                          className="button quiet"
                          onClick={() => {
                            setBrief({
                              ...brief,
                              scenes: brief.scenes.filter((_, i) => i !== index),
                            });
                            setSceneIndex(0);
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="form-grid">
                    <label className="field">
                      Type
                      <select
                        value={scene.type}
                        onChange={(event) =>
                          updateScene(index, {
                            type: event.target.value as CreativeScene["type"],
                          })
                        }
                      >
                        {sceneTypes.map((type) => <option key={type}>{type}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      Seconds
                      <input
                        type="number"
                        min={0.75}
                        max={30}
                        step={0.25}
                        value={scene.durationSeconds}
                        onChange={(event) =>
                          updateScene(index, { durationSeconds: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label className="field full">
                      Headline
                      <textarea
                        value={scene.text}
                        onChange={(event) => updateScene(index, { text: event.target.value })}
                      />
                    </label>
                    <label className="field full">
                      Supporting text
                      <textarea
                        value={scene.subtext}
                        onChange={(event) => updateScene(index, { subtext: event.target.value })}
                      />
                    </label>
                    <label className="field full">
                      Scene CTA
                      <input
                        value={scene.cta}
                        onChange={(event) => updateScene(index, { cta: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      Background
                      <select
                        value={scene.backgroundAssetId ?? ""}
                        onChange={(event) =>
                          updateScene(index, {
                            backgroundAssetId: event.target.value || undefined,
                          })
                        }
                      >
                        <option value="">Animated brand background</option>
                        {visualAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>{asset.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Animation
                      <select
                        value={scene.animationPreset}
                        onChange={(event) =>
                          updateScene(index, {
                            animationPreset: event.target.value as CreativeScene["animationPreset"],
                          })
                        }
                      >
                        {animationPresets.map((preset) => <option key={preset}>{preset}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      Transition in
                      <select
                        value={scene.transitionIn}
                        onChange={(event) =>
                          updateScene(index, {
                            transitionIn: event.target.value as CreativeScene["transitionIn"],
                          })
                        }
                      >
                        {transitionPresets.map((preset) => <option key={preset}>{preset}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      Transition out
                      <select
                        value={scene.transitionOut}
                        onChange={(event) =>
                          updateScene(index, {
                            transitionOut: event.target.value as CreativeScene["transitionOut"],
                          })
                        }
                      >
                        {transitionPresets.map((preset) => <option key={preset}>{preset}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      Text position
                      <select
                        value={scene.textPosition}
                        onChange={(event) =>
                          updateScene(index, {
                            textPosition: event.target.value as CreativeScene["textPosition"],
                          })
                        }
                      >
                        {["top", "center", "bottom", "left", "right"].map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      Text align
                      <select
                        value={scene.textAlign}
                        onChange={(event) =>
                          updateScene(index, {
                            textAlign: event.target.value as CreativeScene["textAlign"],
                          })
                        }
                      >
                        {["left", "center", "right"].map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      Overlay
                      <input
                        type="range"
                        min={0}
                        max={0.85}
                        step={0.05}
                        value={scene.overlayOpacity}
                        onChange={(event) =>
                          updateScene(index, { overlayOpacity: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label className="field">
                      Emphasis
                      <select
                        value={scene.emphasis}
                        onChange={(event) =>
                          updateScene(index, {
                            emphasis: event.target.value as CreativeScene["emphasis"],
                          })
                        }
                      >
                        {["quiet", "standard", "strong"].map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </label>
                  </div>

                  {scene.type === "gallery" && visualAssets.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <small>Gallery media</small>
                      <div className="engine-actions">
                        {visualAssets.map((asset) => (
                          <label className="button quiet" key={asset.id}>
                            <input
                              type="checkbox"
                              checked={scene.mediaAssetIds.includes(asset.id)}
                              onChange={(event) => {
                                const ids = event.target.checked
                                  ? [...scene.mediaAssetIds, asset.id].slice(0, 6)
                                  : scene.mediaAssetIds.filter((id) => id !== asset.id);
                                updateScene(index, { mediaAssetIds: ids });
                              }}
                            />
                            {asset.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="engine-actions">
                    <label className="button quiet">
                      <input
                        type="checkbox"
                        checked={scene.logoEnabled}
                        disabled={!logoAssets.length}
                        onChange={(event) =>
                          updateScene(index, { logoEnabled: event.target.checked })
                        }
                      />
                      Logo overlay
                    </label>
                    <label className="button quiet">
                      <input
                        type="checkbox"
                        checked={scene.captionEnabled}
                        onChange={(event) =>
                          updateScene(index, { captionEnabled: event.target.checked })
                        }
                      />
                      Scene label
                    </label>
                  </div>
                </div>
              ))}
              <div className="engine-actions">
                <button
                  className="button"
                  disabled={brief.scenes.length >= 12}
                  onClick={() =>
                    setBrief({
                      ...brief,
                      scenes: [
                        ...brief.scenes,
                        sceneSchema.parse({ text: "New scene", durationSeconds: 3 }),
                      ],
                    })
                  }
                >
                  Add scene
                </button>
              </div>
            </section>

            <section className="form-section">
              <h2>Sound</h2>
              <div className="form-grid">
                <label className="field full">
                  Background music
                  <select
                    value={brief.audio.musicAssetId ?? ""}
                    onChange={(event) =>
                      setBrief({
                        ...brief,
                        audio: {
                          ...brief.audio,
                          musicAssetId: event.target.value || undefined,
                        },
                      })
                    }
                  >
                    <option value="">No music</option>
                    {audioAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>{asset.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Music volume
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={brief.audio.musicVolume}
                    onChange={(event) =>
                      setBrief({
                        ...brief,
                        audio: {
                          ...brief.audio,
                          musicVolume: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label className="field">
                  Fade out (seconds)
                  <input
                    type="number"
                    min={0}
                    max={3}
                    step={0.1}
                    value={brief.audio.fadeOut}
                    onChange={(event) =>
                      setBrief({
                        ...brief,
                        audio: {
                          ...brief.audio,
                          fadeOut: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
            </section>
          </section>

          <aside>
            <section className="form-section">
              <h2>Scene preview</h2>
              <p className="muted">
                {activeScene?.durationSeconds ?? 0}s · {activeScene?.animationPreset} · {activeScene?.transitionIn}
              </p>
              <div
                className="composition-preview"
                style={{
                  aspectRatio: brief.aspectRatio.replace(":", "/"),
                  background: dna?.primaryColor || "#181426",
                  color: dna?.secondaryColor || "#ffffff",
                  fontFamily: dna?.headingFont || "Arial",
                  textAlign: activeScene?.textAlign || "left",
                }}
              >
                <small style={{ color: dna?.accentColor || "#a78bfa" }}>
                  {business.profile.businessName}
                </small>
                <h2>{activeScene?.text || "Your scene headline"}</h2>
                {activeScene?.subtext && <p>{activeScene.subtext}</p>}
                {activeScene?.cta && <span className="button primary">{activeScene.cta}</span>}
                <span>
                  {Math.min(sceneIndex + 1, brief.scenes.length)} / {brief.scenes.length}
                </span>
              </div>
              <label className="field">
                Scene
                <input
                  aria-label="Preview scene"
                  type="range"
                  min={0}
                  max={Math.max(0, brief.scenes.length - 1)}
                  value={Math.min(sceneIndex, Math.max(0, brief.scenes.length - 1))}
                  onChange={(event) => setSceneIndex(Number(event.target.value))}
                />
              </label>
            </section>

            <section className="form-section">
              <h2>Review & render</h2>
              {selected && (
                <>
                  <Badge>{selected.studio!.approval}</Badge>
                  <div className="engine-actions">
                    {(["In review", "Approved", "Rejected"] as const).map((state) => (
                      <button
                        className="button"
                        disabled={busy || dirty}
                        key={state}
                        onClick={() =>
                          void task(async () => {
                            const changed = {
                              ...selected,
                              studio: { ...selected.studio!, approval: state },
                            };
                            await update((workspace) => ({
                              ...workspace,
                              creatives: workspace.creatives.map((creative) =>
                                creative.id === changed.id ? changed : creative,
                              ),
                            }));
                            setSelected(changed);
                            setMessage("Review recorded. No publishing action was performed.");
                          })
                        }
                      >
                        {state}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {jobs
                .filter((job) => job.creative_id === selected?.id)
                .map((job) => (
                  <div className="engine-job" key={job.id}>
                    <Badge>{job.status}</Badge>
                    <small>{new Date(job.created_at).toLocaleString()}</small>
                    {job.error && <p role="alert">{job.error}</p>}
                    {job.output_path && (
                      <button
                        className="text-link"
                        onClick={() =>
                          void task(async () =>
                            setVideo(await signedRender(job.output_path!)),
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
                HyperFrames renders media, motion and transitions; FFmpeg adds selected audio. Human review remains mandatory.
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
              .map((creative) => (
                <button
                  className="engine-version"
                  key={creative.id}
                  onClick={() => edit(creative)}
                >
                  <strong>{creative.title}</strong>
                  <span>
                    {creative.studio!.brief.platform} · {creative.studio!.brief.aspectRatio} · {creative.studio!.approval}
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
