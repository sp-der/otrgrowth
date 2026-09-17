"use client";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Fingerprint,
  Sparkles,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Badge, DemoNote, PageHeader } from "@/components/ui";
import { aggregateMetrics, money, number } from "@/lib/data/metrics";
export default function Dashboard() {
  const { data, business } = useWorkspace();
  const content = data.content.filter((i) => i.businessId === business.id);
  const campaigns = data.campaigns.filter((i) => i.businessId === business.id);
  const metrics = aggregateMetrics(
    data.metrics.filter((i) => i.businessId === business.id),
  );
  const filled = Object.values(business.profile).filter((v) => typeof v === "string" && v.trim()).length;
  const completion = Math.round(
    (filled / Object.keys(business.profile).length) * 100,
  );
  return (
    <>
      <PageHeader
        eyebrow="YOUR BUSINESS. IN FOCUS."
        title="Make your next move count."
        description={`The strategy, content, and campaigns behind ${business.profile.businessName}.`}
        action={
          <Link className="button primary" href="/strategist">
            <Sparkles size={16} /> Open Strategist <ArrowUpRight size={16} />
          </Link>
        }
      />
      <div className="section-line">
        <span className="eyebrow">WORKSPACE OVERVIEW</span>
        <DemoNote />
      </div>
      <div className="stat-grid">
        {[
          [
            "Total businesses",
            String(data.businesses.length),
            "Across your workspace",
          ],
          [
            "Active campaigns",
            String(campaigns.filter((c) => c.status === "Active").length),
            `${campaigns.filter((c) => c.status === "Draft").length} draft ready to shape`,
          ],
          [
            "Awaiting approval",
            String(
              content.filter((c) => c.status === "In review").length,
            ).padStart(2, "0"),
            "Content in your review queue",
          ],
          ["Current leads", number(metrics.leads), "Demo · Sep 1–13, 2026"],
        ].map(([label, value, note], i) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>
              {value}
              <ArrowUpRight
                size={21}
                className={i === 3 ? "accent" : "muted"}
              />
            </strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-main">
        <section className="panel performance-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">FROM ATTENTION TO ACTION</p>
              <h2>Performance snapshot</h2>
            </div>
            <Link href="/analytics" className="text-link">
              View analytics <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="snapshot-top">
            <div>
              <span className="muted">Illustrative return on ad spend</span>
              <strong>
                {metrics.roas?.toFixed(1) ?? "—"}
                <span>×</span>
              </strong>
            </div>
            <span className="period-chip">SEP 01 — SEP 13</span>
          </div>
          <div
            className="funnel-bars"
            aria-label="Demo funnel: impressions, clicks, leads, customers"
          >
            {[
              ["Impressions", metrics.impressions, 100],
              ["Clicks", metrics.clicks, 73],
              ["Leads", metrics.leads, 46],
              ["Customers", metrics.customers, 22],
            ].map(([label, value, width]) => (
              <div className="funnel-row" key={label}>
                <span>{label}</span>
                <div className="bar-track">
                  <div style={{ width: `${width}%` }} />
                </div>
                <strong>{number(Number(value))}</strong>
              </div>
            ))}
          </div>
          <p className="chart-note">
            Stage widths are illustrative; exact volumes are shown.
          </p>
          <div className="snapshot-bottom">
            <div>
              <small>Demo spend</small>
              <strong>{money(metrics.spend)}</strong>
            </div>
            <div>
              <small>Cost per lead</small>
              <strong>{money(metrics.cpl)}</strong>
            </div>
            <div>
              <small>Demo revenue</small>
              <strong>{money(metrics.revenue)}</strong>
            </div>
          </div>
        </section>
        <section className="dna-callout">
          <div className="dna-callout-top">
            <Fingerprint size={29} strokeWidth={1.3} />
            <span className="eyebrow">
              CLIENT #{String(business.number).padStart(3, "0")}
            </span>
          </div>
          <div>
            <p className="eyebrow">GOOD STRATEGY STARTS HERE</p>
            <h2>
              Know the business.
              <br />
              Build the advantage.
            </h2>
            <p>
              Your Business DNA gives every marketing decision a better starting
              point.
            </p>
          </div>
          <div>
            <div className="progress-label">
              <span>Profile completeness</span>
              <strong>{completion}%</strong>
            </div>
            <progress
              max="100"
              value={completion}
              aria-label="Profile completeness"
            />
            <Link href="/business-dna" className="button light">
              Shape your Business DNA <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>
      </div>
      <div className="dashboard-lower">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">KEEP THINGS MOVING</p>
              <h2>Up next for review</h2>
            </div>
            <Link className="text-link" href="/content">
              All content <ArrowRight size={16} />
            </Link>
          </div>
          {content
            .filter((c) => c.status === "In review")
            .map((item) => (
              <Link href="/content" className="review-row" key={item.id}>
                <span className="content-symbol">
                  <ArrowDownRight size={20} />
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <small>
                    {item.kind} <span>·</span> {item.channel}
                  </small>
                </div>
                <Badge>{item.status}</Badge>
              </Link>
            ))}
          {!content.some((c) => c.status === "In review") && (
            <p className="inline-empty">
              All clear. No content is waiting for approval.
            </p>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">THE LATEST</p>
              <h2>Workspace activity</h2>
            </div>
            <span className="status-dot" />
          </div>
          <div className="activity-list">
            {data.activity
              .filter((a) => a.businessId === business.id)
              .slice(0, 4)
              .map((a) => (
                <div className="activity" key={a.id}>
                  <span />
                  <div>
                    <p>{a.title}</p>
                    <small>
                      {new Date(a.at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                    </small>
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>
    </>
  );
}
