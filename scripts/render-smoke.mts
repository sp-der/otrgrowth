import { renderComposition } from "../services/render-worker/hyperframes";
import { compositionSchema } from "../src/lib/creative/schemas";
import { writeFile } from "node:fs/promises";
const input = compositionSchema.parse({
  version: 1,
  brand: "OTR Growth",
  dna: {},
  brief: {
    platform: "Generic",
    aspectRatio: "1:1",
    durationSeconds: 3,
    template: "Announcement",
    hook: "A fresh perspective",
    bodyCopy: "Built for your business",
    cta: "Learn more",
    scenes: [{ text: "Human review comes first" }],
  },
});
const video = await renderComposition(input);
await writeFile(process.argv[2] || "/tmp/otr-render-smoke.mp4", video);
console.info(`Real HyperFrames MP4 rendered: ${video.length} bytes`);
