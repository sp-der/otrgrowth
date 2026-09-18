import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { compositionHTML } from "../../src/lib/creative/composition-builder";
import {
  briefSchema,
  compositionSchema,
  type SourceAsset,
} from "../../src/lib/creative/schemas";

const execute = promisify(execFile);

function extension(asset: SourceAsset) {
  return asset.storagePath.split(".").at(-1) || "bin";
}

function requiredAssetIds(
  assets: SourceAsset[],
  brief: ReturnType<typeof briefSchema.parse>,
) {
  const ids = new Set<string>();
  for (const scene of brief.scenes) {
    if (scene.backgroundAssetId) ids.add(scene.backgroundAssetId);
    for (const id of scene.mediaAssetIds) ids.add(id);
    if (scene.logoEnabled) {
      const logo = assets.find((asset) => asset.kind === "logo");
      if (logo) ids.add(logo.id);
    }
  }
  if (brief.audio.musicAssetId) ids.add(brief.audio.musicAssetId);
  if (brief.audio.voiceoverAssetId) ids.add(brief.audio.voiceoverAssetId);
  return ids;
}

async function mixAudio(
  silentVideo: string,
  output: string,
  duration: number,
  brief: ReturnType<typeof briefSchema.parse>,
  files: Map<string, string>,
) {
  const music = brief.audio.musicAssetId
    ? files.get(brief.audio.musicAssetId)
    : undefined;
  const voice = brief.audio.voiceoverAssetId
    ? files.get(brief.audio.voiceoverAssetId)
    : undefined;
  if (!music && !voice) return false;

  const args = ["-y", "-i", silentVideo];
  const filters: string[] = [];
  let inputIndex = 1;
  let musicLabel = "";
  let voiceLabel = "";

  if (music) {
    args.push("-stream_loop", "-1", "-i", music);
    let chain = "[" + inputIndex + ":a]volume=" + brief.audio.musicVolume;
    if (brief.audio.fadeIn > 0) {
      chain += ",afade=t=in:st=0:d=" + brief.audio.fadeIn;
    }
    if (brief.audio.fadeOut > 0) {
      chain +=
        ",afade=t=out:st=" +
        Math.max(0, duration - brief.audio.fadeOut) +
        ":d=" +
        brief.audio.fadeOut;
    }
    musicLabel = "music";
    filters.push(chain + "[" + musicLabel + "]");
    inputIndex += 1;
  }

  if (voice) {
    args.push("-i", voice);
    voiceLabel = "voice";
    filters.push(
      "[" +
        inputIndex +
        ":a]volume=" +
        brief.audio.voiceoverVolume +
        ",apad=pad_dur=" +
        duration +
        "[" +
        voiceLabel +
        "]",
    );
  }

  let outputLabel = "";
  if (musicLabel && voiceLabel) {
    outputLabel = "mix";
    filters.push(
      "[" +
        musicLabel +
        "][" +
        voiceLabel +
        "]amix=inputs=2:duration=longest:dropout_transition=0[" +
        outputLabel +
        "]",
    );
  } else {
    outputLabel = musicLabel || voiceLabel;
  }

  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[" + outputLabel + "]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    String(duration),
    "-movflags",
    "+faststart",
    output,
  );

  await execute(process.env.FFMPEG_PATH || "ffmpeg", args, {
    timeout: 180000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return true;
}

export async function renderComposition(
  input: unknown,
  loadAsset?: (storagePath: string) => Promise<Buffer>,
): Promise<Buffer> {
  const composition = compositionSchema.parse(input);
  const brief = briefSchema.parse(composition.brief);
  const dir = await mkdtemp(join(tmpdir(), "otr-render-"));
  try {
    const assetDir = join(dir, "assets");
    await mkdir(assetDir, { recursive: true });
    const needed = requiredAssetIds(brief.sourceAssets, brief);
    const localFiles = new Map<string, string>();

    for (const asset of brief.sourceAssets) {
      if (!needed.has(asset.id)) continue;
      if (!loadAsset) {
        throw new Error("This render references media but no asset loader is configured.");
      }
      const file = join(assetDir, asset.id + "." + extension(asset));
      await writeFile(file, await loadAsset(asset.storagePath));
      localFiles.set(asset.id, file);
    }

    await writeFile(join(dir, "index.html"), compositionHTML(composition));
    const cli = resolve(
      import.meta.dirname,
      "node_modules/hyperframes/bin/hyperframes.mjs",
    );
    const silent = join(dir, "silent.mp4");
    await execute(
      process.execPath,
      [
        cli,
        "render",
        dir,
        "--output",
        silent,
        "--fps",
        "24",
        "--quality",
        "draft",
        "--workers",
        "1",
      ],
      {
        timeout: 600000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, DO_NOT_TRACK: "1" },
      },
    );

    const final = join(dir, "output.mp4");
    const mixed = await mixAudio(
      silent,
      final,
      brief.durationSeconds,
      brief,
      localFiles,
    );
    const output = await readFile(mixed ? final : silent);
    if (output.length < 100 || output.toString("ascii", 4, 8) !== "ftyp") {
      throw new Error("Renderer did not produce an MP4.");
    }
    return output;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
