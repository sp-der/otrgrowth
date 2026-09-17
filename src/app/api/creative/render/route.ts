import { z } from "zod";
import { engineContext, engineError, inputJSON } from "@/lib/engines-server";
import { creativeSchema } from "@/lib/domain/schemas";
export async function POST(request: Request) {
  try {
    const { db } = await engineContext(request);
    const { creativeId } = z
      .object({ creativeId: z.uuid() })
      .strict()
      .parse(await inputJSON(request));
    const rows = await db<{ payload: unknown }[]>(
      `/creatives?id=eq.${creativeId}&select=payload`,
    );
    if (!rows.length) throw new Error("Creative not found.");
    const creative = creativeSchema.parse(rows[0].payload);
    if (!creative.studio) throw new Error("Save a Studio composition first.");
    if (creative.studio.brief.sourceAssets.length)
      throw new Error(
        "Media compositing is not enabled yet. Remove source assets before rendering.",
      );
    const active = await db<unknown[]>(
      `/creative_render_jobs?creative_id=eq.${creativeId}&status=in.(queued,rendering)&select=*&limit=1`,
    );
    if (active.length) return Response.json(active[0]);
    const jobs = await db<unknown[]>("/creative_render_jobs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        business_id: creative.businessId,
        creative_id: creative.id,
        composition: creative.studio.composition,
      }),
    });
    return Response.json(jobs[0], { status: 202 });
  } catch (e) {
    return engineError(e);
  }
}
