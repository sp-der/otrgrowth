"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { recordActivity, useWorkspace } from "@/components/workspace-provider";
import { Badge, DemoNote, Empty, PageHeader } from "@/components/ui";
import { CampaignEditor } from "@/components/campaign-editor";
import type { Campaign } from "@/lib/domain/schemas";
export default function Campaigns() {
  const { data, business, update } = useWorkspace();
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [filter, setFilter] = useState("All campaigns");
  const campaigns = data.campaigns.filter(
    (c) =>
      c.businessId === business.id &&
      (filter === "All campaigns" || c.status === filter),
  );
  async function save(campaign: Campaign) {
    await update((w) =>
      recordActivity(
        {
          ...w,
          campaigns: w.campaigns.some((c) => c.id === campaign.id)
            ? w.campaigns.map((c) => (c.id === campaign.id ? campaign : c))
            : [...w.campaigns, campaign],
        },
        business.id,
        "Campaign brief updated",
      ),
    );
    setEditing(null);
  }
  return (
    <>
      <PageHeader
        eyebrow="IDEAS WITH INTENT"
        title="Give every campaign a purpose."
        description="Bring the objective, audience, offer, and creative together before anything goes live."
        action={
          <button
            className="button primary"
            onClick={() =>
              setEditing({
                id: crypto.randomUUID(),
                businessId: business.id,
                name: "",
                objective: "",
                audience: "",
                offer: "",
                channel: "",
                adCopy: "",
                creativeStatus: "Concept",
                status: "Draft",
              })
            }
          >
            <Plus size={16} /> New campaign
          </button>
        }
      />
      <div className="toolbar">
        <div className="tabs" aria-label="Campaign filters">
          {[
            "All campaigns",
            "Draft",
            "In review",
            "Ready",
            "Active",
            "Paused",
            "Completed",
          ].map((s) => (
            <button
              key={s}
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="section-line">
        <span className="eyebrow">CAMPAIGN WORKSPACE</span>
        <DemoNote />
      </div>
      {editing && (
        <CampaignEditor
          key={editing.id}
          initial={editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
      {campaigns.map((c) => (
        <article className="campaign-card" key={c.id}>
          <header>
            <div>
              <p className="eyebrow">{c.channel || "CHANNEL NOT SET"}</p>
              <h2>{c.name}</h2>
            </div>
            <Badge>{c.status}</Badge>
          </header>
          <div className="campaign-detail-grid">
            {[
              ["Objective", c.objective],
              ["Audience", c.audience],
              ["Offer", c.offer],
              ["Creative status", c.creativeStatus],
              ["Ad copy", c.adCopy],
            ].map(([label, value]) => (
              <div className={label === "Ad copy" ? "full" : ""} key={label}>
                <h3>{label}</h3>
                <p>{value || "Not yet defined"}</p>
              </div>
            ))}
            {data.creatives
              .filter((cr) => cr.campaignId === c.id)
              .map((cr) => (
                <div className="full" key={cr.id}>
                  <h3>
                    {cr.format} concept / {cr.title}
                  </h3>
                  <p>{cr.concept}</p>
                </div>
              ))}
          </div>
          <footer>
            <p>Local brief only. No ad account connected. No spend enabled.</p>
            <button
              className="button"
              onClick={() => {
                setEditing(c);
                window.scrollTo({ top: 0, behavior: "instant" });
              }}
            >
              Edit brief
            </button>
          </footer>
        </article>
      ))}
      {campaigns.length === 0 && (
        <Empty title="Make room for the next campaign.">
          Create a campaign brief or select a different status.
        </Empty>
      )}
    </>
  );
}
