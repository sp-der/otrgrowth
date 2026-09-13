"use client";
import { useState, type FormEvent } from "react";
import { contentItemSchema, type ContentItem } from "@/lib/domain/schemas";
import { Feedback } from "./ui";
export function ContentEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: ContentItem;
  onSave: (item: ContentItem) => Promise<void>;
  onCancel: () => void;
}) {
  const [item, setItem] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = contentItemSchema.safeParse(item);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch {
      setError("Could not save content. Check browser storage and retry.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-section">
      <h2 className="mb-5">Shape your content</h2>
      <div className="form-grid">
        <label className="field full">
          Title
          <input
            autoFocus
            required
            maxLength={200}
            value={item.title}
            onChange={(e) => setItem({ ...item, title: e.target.value })}
          />
        </label>
        <label className="field">
          Type
          <select
            value={item.kind}
            onChange={(e) =>
              setItem({ ...item, kind: e.target.value as ContentItem["kind"] })
            }
          >
            {["Idea", "Caption", "Reel"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Channel
          <input
            required
            maxLength={200}
            value={item.channel}
            onChange={(e) => setItem({ ...item, channel: e.target.value })}
          />
        </label>
        <label className="field full">
          Copy / creative direction
          <textarea
            aria-label="Copy / creative direction"
            maxLength={5000}
            value={item.body}
            onChange={(e) => setItem({ ...item, body: e.target.value })}
          />
        </label>
        <label className="field">
          Approval status
          <select
            value={item.status}
            onChange={(e) =>
              setItem({
                ...item,
                status: e.target.value as ContentItem["status"],
              })
            }
          >
            {["Idea", "Draft", "In review", "Approved"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Planned date
          <input
            type="date"
            value={item.scheduledFor}
            onChange={(e) => setItem({ ...item, scheduledFor: e.target.value })}
          />
        </label>
      </div>
      <Feedback message={error} error />
      <div className="form-actions">
        <button className="button quiet" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button disabled={saving} className="button primary">
          {saving ? "Saving…" : "Save content"}
        </button>
      </div>
    </form>
  );
}
