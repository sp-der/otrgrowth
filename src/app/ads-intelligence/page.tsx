"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/workspace-provider";
import { PageHeader, Feedback, Badge } from "@/components/ui";
import {
  evidenceKeys,
  evidenceLabels,
  auditReportSchema,
  recommendationSchema,
  type AuditReport,
  type Recommendation,
} from "@/lib/ads/schemas";
import { engineDB, engineRequest } from "@/lib/engine-client";
import { replacementCreative } from "@/lib/ads/replacement";
type RecRow = {
  id: string;
  status: "Suggested" | "In review" | "Approved" | "Rejected";
  payload: Recommendation;
};
export default function AdsIntelligence() {
  const { business, data, update } = useWorkspace();
  const router = useRouter();
  const campaigns = data.campaigns.filter((c) => c.businessId === business.id);
  const [campaignId, setCampaignId] = useState("");
  const [evidence, setEvidence] = useState<Record<string, boolean | null>>({});
  const [note, setNote] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [recs, setRecs] = useState<RecRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const campaignFilter = campaignId
      ? `campaign_id=eq.${campaignId}`
      : "campaign_id=is.null";
    void engineDB<{ id: string; report: unknown }[]>(
      `/ad_audits?business_id=eq.${business.id}&${campaignFilter}&select=id,report&order=created_at.desc&limit=1`,
    )
      .then(async (rows) => {
        if (!active) return;
        if (rows.length) {
          setReport(auditReportSchema.parse(rows[0].report));
          const next = await engineDB<RecRow[]>(
            `/ad_recommendations?audit_id=eq.${rows[0].id}&select=id,status,payload`,
          );
          if (active) setRecs(next);
        } else {
          setReport(null);
          setRecs([]);
        }
      })
      .catch((e) => {
        if (active) {
          setFailed(true);
          setMessage(e instanceof Error ? e.message : "Could not load audits.");
        }
      });
    return () => {
      active = false;
    };
  }, [business.id, campaignId]);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  async function audit() {
    const result = await engineRequest<{ id: string; report: unknown }>(
      "/api/ads/audit",
      {
        method: "POST",
        body: JSON.stringify({
          businessId: business.id,
          campaignId: campaignId || null,
          evidence: { ...evidence, note },
        }),
      },
    );
    const parsed = auditReportSchema.parse(result.report);
    setReport(parsed);
    setRecs(
      parsed.recommendations.map((payload) => ({
        id: payload.id,
        status: "Suggested",
        payload,
      })),
    );
    setMessage("Audit and recommendations saved. No ad accounts were changed.");
  }
  async function decision(row: RecRow, status: RecRow["status"]) {
    await engineDB(`/ad_recommendations?id=eq.${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setRecs((r) => r.map((x) => (x.id === row.id ? { ...x, status } : x)));
    setMessage("Decision recorded. External execution remains disabled.");
  }
  async function replace(row: RecRow) {
    const rec = recommendationSchema.parse(row.payload);
    const campaign = campaigns.find((c) => c.id === rec.campaignId);
    if (!campaign)
      throw new Error("Select a valid campaign for replacement creative.");
    const existing = data.creatives.find(
      (c) => c.studio?.brief.recommendationId === rec.id,
    );
    if (!existing) {
      const creative = replacementCreative(rec, business, campaign);
      await update((w) => ({ ...w, creatives: [...w.creatives, creative] }));
    }
    router.push("/creative-studio");
  }
  return (
    <>
      <PageHeader
        eyebrow="ADS INTELLIGENCE / CLAUDE ADS CORE"
        title="Evidence before action."
        description="Audit supplied observations, see what is unknown, and prepare recommendations for human review."
      />
      <div className="engine-grid">
        <section className="form-section">
          <h2>Audit scope</h2>
          <label className="field">
            Campaign
            <select
              disabled={busy}
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                setEvidence({});
                setReport(null);
                setRecs([]);
              }}
            >
              <option value="">Business overview</option>
              {campaigns.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            Stored performance metrics are business-level context. These checks
            use your explicit observations; unknown is the default.
          </p>
          <div className="form-grid">
            {evidenceKeys.map((key, i) => (
              <label className="field" key={key}>
                {evidenceLabels[i]}
                <select
                  value={
                    evidence[key] === true
                      ? "yes"
                      : evidence[key] === false
                        ? "no"
                        : "unknown"
                  }
                  disabled={
                    busy || (key === "creativeFatigueObserved" && !campaignId)
                  }
                  onChange={(e) =>
                    setEvidence({
                      ...evidence,
                      [key]:
                        e.target.value === "unknown"
                          ? null
                          : e.target.value === "yes",
                    })
                  }
                >
                  <option value="unknown">Unknown / no evidence</option>
                  <option value="yes">Yes — observed</option>
                  <option value="no">No — observed</option>
                </select>
              </label>
            ))}
          </div>
          <label className="field">
            Evidence notes
            <textarea
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Source, date, reporting window, and what you observed"
            />
          </label>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void task(audit)}
          >
            {busy ? "Working…" : "Run & save audit"}
          </button>
          <p className="muted">
            Manual evidence is not independently verified. Demo metrics are
            labelled as demo. No live platform connections.
          </p>
        </section>
        <section className="form-section">
          <h2>Evidence coverage</h2>
          {report ? (
            <>
              <div className="engine-score">
                {Math.round(report.evidenceCoverage)}%
              </div>
              <progress value={report.evidenceCoverage} max={100} />
              <p>Audit status: {report.status.replaceAll("_", " ")}</p>
              <p>
                Health score:{" "}
                <strong>
                  {report.healthScore === null
                    ? "Unknown / insufficient evidence"
                    : `${report.healthScore}/100`}
                </strong>
              </p>
              <p>Sources: {report.sources.join(", ") || "None supplied"}</p>
              {report.metricContext && (
                <div className="engine-job">
                  <h3>Latest supplied period</h3>
                  <p>
                    {report.metricContext.periodStart} –{" "}
                    {report.metricContext.periodEnd} ·{" "}
                    {report.metricContext.source}
                  </p>
                  <p>
                    Spend: ${report.metricContext.spend.toFixed(2)} ·
                    Impressions:{" "}
                    {report.metricContext.impressions.toLocaleString()} ·
                    Clicks: {report.metricContext.clicks.toLocaleString()} ·
                    CTR:{" "}
                    {report.metricContext.impressions
                      ? (
                          (100 * report.metricContext.clicks) /
                          report.metricContext.impressions
                        ).toFixed(2) + "%"
                      : "Unknown"}
                  </p>
                  <p>
                    Context only; no benchmark or campaign attribution inferred.
                  </p>
                </div>
              )}
              <h3>Data gaps</h3>
              <ul>
                {report.dataGaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>No saved audit for this scope. Supply evidence to begin.</p>
          )}
        </section>
      </div>
      <Feedback message={message} error={failed} />
      {report && (
        <section className="form-section">
          <h2>Findings</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Control</th>
                  <th>Status</th>
                  <th>Severity</th>
                  <th>Confidence</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {report.findings.map((f) => (
                  <tr key={f.control_id}>
                    <td>{f.category}</td>
                    <td>
                      <Badge>{f.status}</Badge>
                    </td>
                    <td>{f.severity}</td>
                    <td>{f.confidence}</td>
                    <td>{f.observation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="form-section">
        <h2>Recommendations</h2>
        {!recs.length && (
          <p>No evidence-backed recommendations for this scope yet.</p>
        )}
        {recs.map((row) => (
          <article className="engine-recommendation" key={row.id}>
            <Badge>{row.status}</Badge>
            <h3>{row.payload.title}</h3>
            <p>{row.payload.description}</p>
            <small>
              {row.payload.severity} severity · {row.payload.confidence}{" "}
              confidence · approval required
            </small>
            <div className="engine-actions">
              {(["In review", "Approved", "Rejected"] as const).map((s) => (
                <button
                  className="button"
                  disabled={busy}
                  key={s}
                  onClick={() => void task(() => decision(row, s))}
                >
                  {s}
                </button>
              ))}
              {row.payload.proposedAction === "refresh_creative" &&
                row.status !== "Rejected" && (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void task(() => replace(row))}
                  >
                    Generate replacement creative
                  </button>
                )}
            </div>
          </article>
        ))}
        <p className="muted">
          Approval records a decision only. Spending changes, launch, apply, and
          rollback execution are disabled.
        </p>
      </section>
    </>
  );
}
