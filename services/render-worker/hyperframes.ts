import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { compositionHTML } from "../../src/lib/creative/composition-builder";
import { compositionSchema } from "../../src/lib/creative/schemas";
const execute = promisify(execFile);
export async function renderComposition(input: unknown): Promise<Buffer> {
  const composition = compositionSchema.parse(input);
  if (composition.brief.sourceAssets.length)
    throw new Error(
      "Media compositing is not supported in this renderer version.",
    );
  const dir = await mkdtemp(join(tmpdir(), "otr-render-"));
  try {
    await writeFile(join(dir, "index.html"), compositionHTML(composition));
    // Fixed executable and argument vector: no shell, URL, or caller-provided executable content.
    const cli = resolve(
      import.meta.dirname,
      "node_modules/hyperframes/bin/hyperframes.mjs",
    );
    await execute(
      process.execPath,
      [
        cli,
        "render",
        dir,
        "--output",
        join(dir, "output.mp4"),
        "--fps",
        "24",
        "--quality",
        "draft",
        "--workers",
        "1",
      ],
      {
        timeout: 600000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, DO_NOT_TRACK: "1" },
      },
    );
    const output = await readFile(join(dir, "output.mp4"));
    if (output.length < 100 || output.toString("ascii", 4, 8) !== "ftyp")
      throw new Error("Renderer did not produce an MP4.");
    return output;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
