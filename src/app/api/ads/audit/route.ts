import { z } from "zod";
import { engineContext, engineError, inputJSON } from "@/lib/engines-server";
import { auditReportSchema, evidenceSchema } from "@/lib/ads/schemas";
import { performanceMetricSchema } from "@/lib/domain/schemas";
import { readLimited } from "@/lib/ai/read-limited";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { db } = await engineContext(request);
    const input = z
      .object({
        businessId: z.uuid(),
        campaignId: z.uuid().nullable(),
        evidence: evidenceSchema,
      })
      .strict()
      .parse(await inputJSON(request));
    const businesses = await db<{ id: string }[]>(
      `/businesses?id=eq.${input.businessId}&select=id`,
    );
    if (!businesses.length) throw new Error("Business not found.");
    if (input.campaignId) {
      const campaigns = await db<{ id: string }[]>(
        `/campaigns?id=eq.${input.campaignId}&business_id=eq.${input.businessId}&select=id`,
      );
      if (!campaigns.length)
        throw new Error("Campaign not found for this business.");
    }
    const service = process.env.ADS_ENGINE_URL,
      secret = process.env.ADS_ENGINE_SECRET;
    if (!service || !secret || secret.length < 32)
      return Response.json(
        {
          error:
            "Ads Engine is not configured. Set the private service URL and secret.",
        },
        { status: 503 },
      );
    const endpoint = new URL(service);
    if (
      endpoint.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(endpoint.hostname)
    )
      throw new Error("Ads Engine requires HTTPS outside localhost.");
    const rows = await db<{ payload: unknown }[]>(
      `/performance_metrics?business_id=eq.${input.businessId}&select=payload&limit=100`,
    );
    const metrics = rows.map((r) => {
      const m = performanceMetricSchema.parse(r.payload);
      return {
        source: m.source,
        periodStart: m.periodStart,
        periodEnd: m.periodEnd,
        spend: m.spend,
        impressions: m.impressions,
        clicks: m.clicks,
        leads: m.leads,
        customers: m.customers,
        revenue: m.revenue,
      };
    });
    const response = await fetch(new URL("/audit", endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ ...input, metrics }),
      signal: AbortSignal.timeout(20000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        "Ads Engine rejected the request. Check service configuration and evidence.",
      );
    const report = auditReportSchema.parse(
      JSON.parse(await readLimited(response.body, 256000)),
    );
    if (
      report.recommendations.some(
        (r) =>
          r.businessId !== input.businessId ||
          r.campaignId !== input.campaignId,
      )
    )
      throw new Error("Engine returned mismatched recommendations.");
    const id = await db<string>("/rpc/save_ad_audit", {
      method: "POST",
      body: JSON.stringify({
        p_business_id: input.businessId,
        p_campaign_id: input.campaignId,
        p_report: report,
      }),
    });
    return Response.json({ id, report });
  } catch (e) {
    return engineError(e);
  }
}
