import type { PerformanceMetric } from "../domain/schemas";
export const divide = (a: number, b: number) => (b > 0 ? a / b : null);
export function aggregateMetrics(records: PerformanceMetric[]) {
  const totals = records.reduce(
    (a, m) => ({
      spend: a.spend + m.spend,
      impressions: a.impressions + m.impressions,
      clicks: a.clicks + m.clicks,
      leads: a.leads + m.leads,
      customers: a.customers + m.customers,
      revenue: a.revenue + m.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, customers: 0, revenue: 0 },
  );
  return {
    ...totals,
    cpm: divide(totals.spend * 1000, totals.impressions),
    ctr: divide(totals.clicks * 100, totals.impressions),
    cpc: divide(totals.spend, totals.clicks),
    cpl: divide(totals.spend, totals.leads),
    roas: divide(totals.revenue, totals.spend),
  };
}
export const money = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(v);
export const number = (v: number) => new Intl.NumberFormat("en-US").format(v);
