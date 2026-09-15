"use client";
import { useState, type FormEvent } from "react";
import { campaignSchema, type Campaign } from "@/lib/domain/schemas";
import { Feedback } from "./ui";
export function CampaignEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Campaign;
  onSave: (item: Campaign) => Promise<void>;
  onCancel: () => void;
}) {
  const [item, setItem] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = campaignSchema.safeParse(item);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch {
      setError("Could not save campaign to the cloud workspace. Reload and retry.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="form-section" onSubmit={submit}>
      <h2 className="mb-5">Build the campaign brief</h2>
      <div className="form-grid">
        {(
          [
            { key: "name", label: "Campaign name" },
            { key: "channel", label: "Channel" },
            { key: "objective", label: "Objective" },
            { key: "audience", label: "Audience" },
            { key: "offer", label: "Offer" },
            { key: "adCopy", label: "Ad copy" },
          ] as const
        ).map((f) => (
          <label
            className={`field ${f.key === "adCopy" ? "full" : ""}`}
            key={f.key}
          >
            {f.label}
            {["name", "channel"].includes(f.key) ? (
              <input
                required={f.key === "name"}
                maxLength={200}
                value={item[f.key]}
                onChange={(e) => setItem({ ...item, [f.key]: e.target.value })}
              />
            ) : (
              <textarea
                aria-label={f.label}
                maxLength={5000}
                value={item[f.key]}
                onChange={(e) => setItem({ ...item, [f.key]: e.target.value })}
              />
            )}
          </label>
        ))}
        <label className="field">
          Creative status
          <select
            value={item.creativeStatus}
            onChange={(e) =>
              setItem({
                ...item,
                creativeStatus: e.target.value as Campaign["creativeStatus"],
              })
            }
          >
            {["Concept", "In production", "Ready"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Campaign status (tracking only)
          <select
            value={item.status}
            onChange={(e) =>
              setItem({ ...item, status: e.target.value as Campaign["status"] })
            }
          >
            {[
              "Draft",
              "In review",
              "Ready",
              "Active",
              "Paused",
              "Completed",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <Feedback message={error} error />
      <p className="mt-5 text-xs muted">
        Saving a status never creates, launches, or spends money on a real ad
        campaign.
      </p>
      <div className="form-actions">
        <button type="button" className="button quiet" onClick={onCancel}>
          Cancel
        </button>
        <button disabled={saving} className="button primary">
          {saving ? "Saving…" : "Save campaign"}
        </button>
      </div>
    </form>
  );
}
