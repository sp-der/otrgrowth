import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { POST } from "../src/app/api/content-studio/session/route";

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
