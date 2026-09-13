"use client";
import { useWorkspace } from "@/components/workspace-provider";
import { aggregateMetrics, money, number } from "@/lib/data/metrics";
import { DemoNote, Empty, PageHeader } from "@/components/ui";
export default function Analytics() {
  const { data, business } = useWorkspace();
  const records = data.metrics.filter((m) => m.businessId === business.id);
  const m = aggregateMetrics(records);
  const rows = [
    ["Spend", money(m.spend), "Total advertising investment"],
    ["Impressions", number(m.impressions), "Number of times ads were shown"],
    ["CPM", money(m.cpm), "Spend ÷ impressions × 1,000"],
    ["Clicks", number(m.clicks), "Visits initiated by the ad"],
    [
      "CTR",
      m.ctr === null ? "—" : `${m.ctr.toFixed(2)}%`,
      "Clicks ÷ impressions × 100",
    ],
    ["CPC", money(m.cpc), "Spend ÷ clicks"],
    ["Leads", number(m.leads), "Inquiries attributed to marketing"],
    ["CPL", money(m.cpl), "Spend ÷ leads"],
    ["Customers", number(m.customers), "Leads converted to customers"],
    ["Revenue", money(m.revenue), "Revenue attributed to those customers"],
    [
      "ROAS",
      m.roas === null ? "—" : `${m.roas.toFixed(2)}×`,
      "Revenue ÷ spend",
    ],
  ];
  return (
    <>
      <PageHeader
        eyebrow="FOLLOW THE FULL PICTURE"
        title="Attention is only the beginning."
        description="Understand the path from your first advertising dollar to a new customer."
        action={<span className="period-chip">DEMO / SEP 01–13, 2026</span>}
      />
      <div className="section-line">
        <span className="eyebrow">
          {business.profile.businessName} / PERFORMANCE
        </span>
        <DemoNote />
      </div>
      {!records.length ? (
        <Empty title="Your funnel starts here.">
          No performance data for this business yet. Platform ingestion will
          arrive in a later milestone.
        </Empty>
      ) : (
        <>
          <div className="stat-grid">
            {[
              ["Spend", money(m.spend), "Illustrative advertising cost"],
              ["Qualified inquiries", number(m.leads), "Demo leads"],
              ["Cost per lead", money(m.cpl), "Spend divided by leads"],
              [
                "Return on ad spend",
                `${m.roas?.toFixed(1) ?? "—"}×`,
                "Illustrative attributed return",
              ],
            ].map(([label, value, note]) => (
              <div className="stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>
          <div className="panel-heading px-0">
            <div>
              <p className="eyebrow">THE MARKETING FUNNEL</p>
              <h2>Every stage, accounted for.</h2>
            </div>
            <span className="badge">USD</span>
          </div>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">
                Illustrative marketing funnel for September 1–13, 2026
              </caption>
              <thead>
                <tr>
                  <th scope="col">Funnel stage</th>
                  <th scope="col">Demo value</th>
                  <th scope="col">What it tells you</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, value, explanation], i) => (
                  <tr key={label}>
                    <td>
                      <span className="muted mr-4 text-xs">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {label}
                    </td>
                    <td>{value}</td>
                    <td>{explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="analytics-note">
            <strong>Sample data, not OTR Services financials.</strong>
            <p>
              These figures demonstrate the funnel only. They are not tied to
              the draft campaign, and no live results or actual customer values
              have been entered. Rates are derived from totals; a missing
              denominator displays “—”.
            </p>
          </div>
          <div className="analytics-grid">
            {[
              [
                "01 / CAPTURE",
                "Platform-ready records",
                "Metrics include business, source, and reporting period for future ingestion.",
              ],
              [
                "02 / CONNECT",
                "One consistent funnel",
                "Spend, engagement, leads, and revenue follow the same domain model.",
              ],
              [
                "03 / LEARN",
                "Interpret before acting",
                "Future recommendations will build on verified data and human review.",
              ],
            ].map(([e, t, d]) => (
              <section className="strategy-block" key={e}>
                <p className="eyebrow">{e}</p>
                <h2>{t}</h2>
                <p>{d}</p>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
