"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { recordActivity, useWorkspace } from "@/components/workspace-provider";
import { Badge, DemoNote, Empty, Feedback, PageHeader } from "@/components/ui";
import { ContentEditor } from "@/components/content-editor";
import type { ContentItem } from "@/lib/domain/schemas";
const tabs = [
  "All content",
  "Ideas",
  "Captions",
  "Reels",
  "Calendar",
  "In review",
] as const;
export default function Content() {
  const { data, business, update } = useWorkspace();
  const [tab, setTab] = useState<string>("All content");
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [error, setError] = useState("");
  const [month, setMonth] = useState("2026-09");
  const items = data.content.filter((c) => c.businessId === business.id);
  const filtered = items.filter(
    (c) =>
      tab === "All content" ||
      (tab === "In review" && c.status === "In review") ||
      tab === `${c.kind}s`,
  );
  async function save(item: ContentItem) {
    await update((w) =>
      recordActivity(
        {
          ...w,
          content: w.content.some((c) => c.id === item.id)
            ? w.content.map((c) => (c.id === item.id ? item : c))
            : [...w.content, item],
        },
        business.id,
        "Content updated in the workspace",
      ),
    );
    setEditing(null);
  }
  const [year, mo] = month.split("-").map(Number);
  const days = new Date(year, mo, 0).getDate();
  const offset = (new Date(year, mo - 1, 1).getDay() + 6) % 7;
  function moveMonth(delta: number) {
    const d = new Date(year, mo - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return (
    <>
      <PageHeader
        eyebrow="MAKE THE BRAND SHOW UP"
        title="Good ideas. Ready for their moment."
        description="Shape concepts, write captions, plan reels, and keep approvals moving."
        action={
          <button
            className="button primary"
            onClick={() =>
              setEditing({
                id: crypto.randomUUID(),
                businessId: business.id,
                title: "",
                body: "",
                kind: "Idea",
                channel: "Instagram",
                status: "Idea",
                scheduledFor: "",
              })
            }
          >
            <Plus size={16} /> New content
          </button>
        }
      />
      <div className="toolbar">
        <div className="tabs" aria-label="Content views">
          {tabs.map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="section-line">
        <span className="eyebrow">{business.profile.businessName}</span>
        <DemoNote />
      </div>
      <Feedback message={error} error />
      {editing && (
        <ContentEditor
          key={editing.id}
          initial={editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
      {tab === "Calendar" ? (
        <>
          <div className="calendar-title">
            <h2>
              {new Date(year, mo - 1, 1).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <div>
              <button
                className="button quiet"
                aria-label="Previous month"
                onClick={() => moveMonth(-1)}
              >
                Previous
              </button>
              <button
                className="button quiet"
                aria-label="Next month"
                onClick={() => moveMonth(1)}
              >
                Next
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="calendar-head">
                {d}
              </div>
            ))}
            {Array.from({ length: offset + days }, (_, i) => {
              const day = i - offset + 1;
              const date = `${month}-${String(day).padStart(2, "0")}`;
              return (
                <div
                  key={i}
                  className={`calendar-day ${day < 1 ? "blank" : ""}`}
                >
                  {day > 0 && (
                    <>
                      <span>{day}</span>
                      {items
                        .filter((c) => c.scheduledFor === date)
                        .map((c) => (
                          <button
                            key={c.id}
                            className="calendar-event"
                            onClick={() => {
                              setEditing(c);
                              window.scrollTo({ top: 0, behavior: "instant" });
                            }}
                          >
                            {c.title}
                            <span className="block mt-1">{c.status}</span>
                          </button>
                        ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="analytics-note">
            {items.filter((c) => !c.scheduledFor).length} unscheduled item(s).
            Planned dates are reminders only; no automatic publishing.
          </p>
        </>
      ) : (
        <div className="content-list">
          {filtered.map((c) => (
            <article key={c.id} className="content-card">
              <header>
                <span className="eyebrow">
                  {c.kind} / {c.channel}
                </span>
                <Badge>{c.status}</Badge>
              </header>
              <h2>{c.title}</h2>
              <p>
                {c.body ||
                  "Add copy or creative direction to develop this idea."}
              </p>
              <footer>
                <small>
                  {c.scheduledFor
                    ? `Planned for ${c.scheduledFor}`
                    : "Unscheduled"}{" "}
                  · not published
                </small>
                <div className="flex items-center gap-3">
                  <label className="status-control">
                    Status
                    <select
                      aria-label={`Status for ${c.title}`}
                      value={c.status}
                      onChange={(e) => {
                        setError("");
                        void save({
                          ...c,
                          status: e.target.value as ContentItem["status"],
                        }).catch(() =>
                          setError("Status could not be saved. Please retry."),
                        );
                      }}
                    >
                      {["Idea", "Draft", "In review", "Approved"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button quiet"
                    onClick={() => {
                      setEditing(c);
                      window.scrollTo({ top: 0, behavior: "instant" });
                    }}
                  >
                    Edit
                  </button>
                </div>
              </footer>
            </article>
          ))}
          {filtered.length === 0 && (
            <Empty title="A little space for your next idea.">
              Create content or choose another view to keep planning.
            </Empty>
          )}
        </div>
      )}
    </>
  );
}
