"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Fingerprint, Save } from "lucide-react";
import { useWorkspace, recordActivity } from "@/components/workspace-provider";
import { Feedback, PageHeader } from "@/components/ui";
import {
  businessProfileSchema,
  profileSections,
  type BusinessProfile,
} from "@/lib/domain/schemas";
export default function BusinessDNA() {
  const { business, update } = useWorkspace();
  const [profile, setProfile] = useState<BusinessProfile>(business.profile);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(profile) !== JSON.stringify(business.profile);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (dirty) e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setFailed(false);
    setErrors({});
    const parsed = businessProfileSchema.safeParse(profile);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
        ),
      );
      setFailed(true);
      setMessage("Check the highlighted fields before saving.");
      return;
    }
    setSaving(true);
    try {
      await update((w) =>
        recordActivity(
          {
            ...w,
            businesses: w.businesses.map((b) =>
              b.id === business.id
                ? {
                    ...b,
                    profile: parsed.data,
                    updatedAt: new Date().toISOString(),
                  }
                : b,
            ),
          },
          business.id,
          "Business DNA updated",
        ),
      );
      setProfile(parsed.data);
      setMessage(
        "Business DNA saved. Your next strategy will use this profile.",
      );
    } catch {
      setFailed(true);
      setMessage(
        "Your edits could not be saved to the cloud workspace. Reload and try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  const completion = Math.round(
    (Object.values(profile).filter(Boolean).length /
      Object.keys(profile).length) *
      100,
  );
  return (
    <>
      <PageHeader
        eyebrow={`CLIENT #${String(business.number).padStart(3, "0")} / BUSINESS DNA`}
        title="The foundation of your growth."
        description="Tell the whole story. A stronger profile leads to more useful strategy."
      />
      <div className="dna-layout">
        <form onSubmit={save} noValidate>
          {profileSections.map((section, idx) => (
            <section className="form-section" key={section.title}>
              <header>
                <p className="eyebrow">0{idx + 1} / BUSINESS DNA</p>
                <h2 className="mt-2">{section.title}</h2>
                <p>{section.description}</p>
              </header>
              <div className="form-grid">
                {section.fields.map((f) => (
                  <label
                    key={f.key}
                    className={`field ${f.multiline ? "full" : ""}`}
                    htmlFor={f.key}
                  >
                    {f.label}
                    {f.multiline ? (
                      <textarea
                        aria-label={f.label}
                        id={f.key}
                        maxLength={5000}
                        value={profile[f.key]}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, [f.key]: e.target.value }))
                        }
                        aria-invalid={!!errors[f.key]}
                        aria-describedby={
                          errors[f.key] ? `${f.key}-error` : undefined
                        }
                      />
                    ) : (
                      <input
                        id={f.key}
                        value={profile[f.key]}
                        maxLength={f.key === "website" ? 2000 : 200}
                        placeholder={f.placeholder ?? "Not yet provided"}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, [f.key]: e.target.value }))
                        }
                        aria-invalid={!!errors[f.key]}
                        aria-describedby={
                          errors[f.key] ? `${f.key}-error` : undefined
                        }
                        inputMode={
                          f.key === "averageCustomerValue"
                            ? "decimal"
                            : undefined
                        }
                      />
                    )}{" "}
                    {errors[f.key] && (
                      <span className="field-error" id={`${f.key}-error`}>
                        {errors[f.key]}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </section>
          ))}
          <Feedback message={message} error={failed} />
          <div className="save-bar">
            <span>
              {dirty
                ? "Unsaved changes · save before leaving this page"
                : "Profile synced to Supabase"}
            </span>
            <button disabled={saving || !dirty} className="button primary">
              <Save size={15} />
              {saving ? "Saving…" : "Save Business DNA"}
            </button>
          </div>
        </form>
        <aside className="dna-aside">
          <Fingerprint size={28} className="accent" strokeWidth={1.4} />
          <h2>{business.profile.businessName}</h2>
          <p>
            Only the business name is required. Leave anything unknown blank and
            refine it as you learn.
          </p>
          <ul>
            <li>Be specific about your customer</li>
            <li>Write in your own voice</li>
            <li>Keep offers grounded in reality</li>
          </ul>
          <div className="progress-label mt-5">
            <span>Profile completeness</span>
            <strong>{completion}%</strong>
          </div>
          <progress value={completion} max={100} aria-label="DNA completion" />
          <Link href="/strategist" className="text-link mt-4">
            Open Strategist <ArrowUpRight size={15} />
          </Link>
        </aside>
      </div>
    </>
  );
}
