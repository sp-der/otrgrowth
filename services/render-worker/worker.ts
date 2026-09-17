import { renderComposition } from "./hyperframes";
import { z } from "zod";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error("Worker requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${url}/rest/v1${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Worker database request failed: ${res.status}`);
  return res.status === 204 ? null : res.json();
}
const jobSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  composition: z.unknown(),
});
let stop = false;
process.on("SIGTERM", () => {
  stop = true;
});
process.on("SIGINT", () => {
  stop = true;
});
while (!stop) {
  try {
    const rows = await db("/rpc/claim_creative_render", {
      method: "POST",
      body: "{}",
    });
    if (!rows.length) {
      if (process.argv.includes("--once")) break;
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    const job = jobSchema.parse(rows[0]);
    try {
      const output = await renderComposition(job.composition);
      const path = `${job.owner_id}/${job.id}.mp4`;
      const uploaded = await fetch(
        `${url}/storage/v1/object/creative-renders/${path}`,
        {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "video/mp4",
          },
          body: new Uint8Array(output),
          signal: AbortSignal.timeout(120000),
        },
      );
      if (!uploaded.ok) throw new Error("Output upload failed");
      await db(`/creative_render_jobs?id=eq.${job.id}&status=eq.rendering`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "completed",
          output_path: path,
          finished_at: new Date().toISOString(),
        }),
      });
      console.info(`Completed render ${job.id}`);
    } catch {
      // Do not persist CLI stderr, local paths, credentials, or upstream response bodies.
      await db(`/creative_render_jobs?id=eq.${job.id}&status=eq.rendering`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "failed",
          error:
            "Render failed. Check worker runtime, Chromium and FFmpeg; submit a new job to retry.",
          finished_at: new Date().toISOString(),
        }),
      });
      console.error(`Failed render ${job.id}`);
    }
  } catch {
    console.error(
      "Worker could not claim or update a job; check database connectivity.",
    );
    if (!process.argv.includes("--once"))
      await new Promise((r) => setTimeout(r, 5000));
  }
  if (process.argv.includes("--once")) break;
}
