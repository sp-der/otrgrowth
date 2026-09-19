import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { POST } from "../src/app/api/content-studio/session/route";
import { POST as GENERATE } from "../src/app/api/content-studio/generate/route";
import { videoGeneratorInputSchema } from "../src/lib/ai/hyperframes";

test("Content Studio session requires OTR authentication", async () => {
  const response = await POST(
    new Request("http://localhost/api/content-studio/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: "00000000-0000-4000-8000-000000000001",
      }),
    }),
  );
  assert.equal(response.status, 401);
});

test("HyperFrames host is pinned to the official upstream package", async () => {
  const manifest = JSON.parse(
    await readFile("services/hyperframes-host/package.json", "utf8"),
  ) as { dependencies?: Record<string, string> };
  const upstream = JSON.parse(
    await readFile("services/hyperframes-host/upstream.json", "utf8"),
  ) as { repository?: string; package?: string; version?: string };

  assert.equal(manifest.dependencies?.hyperframes, "0.8.48");
  assert.equal(upstream.repository, "https://github.com/heygen-com/hyperframes");
  assert.equal(upstream.package, "hyperframes");
  assert.equal(upstream.version, "0.8.48");
});

test("Content Studio host contains no custom rendering engine", async () => {
  const source = await readFile("services/hyperframes-host/server.mjs", "utf8");
  assert.match(source, /preview/);
  assert.match(source, /node_modules\/\.bin\/hyperframes/);
  assert.doesNotMatch(source, /ffmpeg.*spawn|puppeteer.*launch|compositionHTML|renderComposition/);
});


test("Video generator requires authentication before AI or Railway work", async () => {
  const response = await GENERATE(
    new Request("http://localhost/api/content-studio/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: "00000000-0000-4000-8000-000000000001",
        prompt: "Create a polished OTR Services portfolio video.",
        durationSeconds: 30,
        aspectRatio: "9:16",
        style: "premium",
        cta: "",
        websites: [],
      }),
    }),
  );
  assert.equal(response.status, 401);
});

test("Video generator accepts bounded HTTPS website briefs", () => {
  const parsed = videoGeneratorInputSchema.parse({
    businessId: "00000000-0000-4000-8000-000000000001",
    prompt: "Create a premium portfolio reel showcasing our published websites.",
    durationSeconds: 30,
    aspectRatio: "9:16",
    style: "premium black white purple agency reel",
    cta: "Built to represent your business right.",
    websites: [
      "https://pressedinpink.com",
      "https://pacificstayproperties.com",
      "https://jmb2creations.com",
      "https://mdhgrill.com",
    ],
  });
  assert.equal(parsed.websites.length, 4);
  assert.equal(parsed.durationSeconds, 30);

  assert.equal(
    videoGeneratorInputSchema.safeParse({
      ...parsed,
      websites: ["http://127.0.0.1/private"],
    }).success,
    false,
  );
});

test("HyperFrames host generation uses official check and system Chromium, not a custom renderer", async () => {
  const source = await readFile("services/hyperframes-host/generator.mjs", "utf8");
  assert.match(source, /"check", projectDir/);
  assert.match(source, /HYPERFRAMES_BROWSER_PATH/);
  assert.match(source, /--screenshot=/);
  assert.match(source, /data-composition-id/);
  assert.doesNotMatch(source, /ffmpeg|puppeteer/);
});
