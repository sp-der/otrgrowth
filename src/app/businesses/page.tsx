"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, Building2, Plus } from "lucide-react";
import { useWorkspace, recordActivity } from "@/components/workspace-provider";
import { Badge, Feedback, PageHeader } from "@/components/ui";
import { emptyProfile } from "@/lib/data/seed";
import { businessSchema } from "@/lib/domain/schemas";
export default function Businesses() {
  const { data, business, update, select } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function add(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const entry = businessSchema.parse({
        id: crypto.randomUUID(),
        number: Math.max(...data.businesses.map((b) => b.number)) + 1,
        profile: emptyProfile(name),
        createdAt: now,
        updatedAt: now,
      });
      await update((w) =>
        recordActivity(
          {
            ...w,
            businesses: [...w.businesses, entry],
            selectedBusinessId: entry.id,
          },
          entry.id,
          "Business added to the workspace",
        ),
      );
      setName("");
      setAdding(false);
    } catch {
      setMessage(
        "Could not add this business. Check its name and cloud connection, then retry.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="THE BUSINESSES BEHIND THE WORK"
        title="Every brand. A clear direction."
        description="A focused home for each business you help grow."
        action={
          <button className="button primary" onClick={() => setAdding(!adding)}>
            <Plus size={16} /> Add business
          </button>
        }
      />
      <Feedback message={message} error />
      {adding && (
        <form onSubmit={add} className="form-section inline-form">
          <h2>Add a business</h2>
          <label className="field">
            Business name
            <input
              autoFocus
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter the business name"
            />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="button quiet"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
            <button disabled={saving} className="button primary">
              {saving ? "Adding…" : "Create business"}
            </button>
          </div>
        </form>
      )}
      <div className="section-line">
        <span className="eyebrow">
          {data.businesses.length}{" "}
          {data.businesses.length === 1 ? "BUSINESS" : "BUSINESSES"}
        </span>
        <small>Synced to Supabase</small>
      </div>
      <div className="business-list">
        {data.businesses.map((b) => (
          <article className="business-card" key={b.id}>
            <div className="business-card-main">
              <span className="business-emblem">
                <Building2 size={26} strokeWidth={1.3} />
              </span>
              <div>
                <p className="eyebrow">
                  CLIENT #{String(b.number).padStart(3, "0")}
                </p>
                <h2>{b.profile.businessName}</h2>
                <p>{b.profile.industry || "Industry not yet added"}</p>
                <p className="mt-3">
                  {b.profile.description ||
                    "Add Business DNA to give this business its starting point."}
                </p>
              </div>
            </div>
            <div className="business-actions">
              {b.id === business.id ? (
                <>
                  <Badge>Selected</Badge>
                  <Link className="button" href="/business-dna">
                    Edit DNA <ArrowUpRight size={15} />
                  </Link>
                </>
              ) : (
                <button
                  className="button"
                  onClick={() =>
                    void select(b.id).catch(() =>
                      setMessage(
                        "Could not select this business. Check the cloud connection.",
                      ),
                    )
                  }
                >
                  Select business <ArrowUpRight size={15} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
