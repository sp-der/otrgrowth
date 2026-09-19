import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { POST } from "../src/app/api/content-studio/session/route";
import { POST as GENERATE } from "../src/app/api/content-studio/generate/route";
import { GET as CAPABILITIES } from "../src/app/api/content-studio/capabilities/route";
import { getAIProvider } from "../src/lib/ai/provider";
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


test("Content Studio uses request-scoped Vercel OIDC without a manually configured AI key", async (t) => {
  const previous = {
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
    model: process.env.AI_MODEL,
    oidc: process.env.VERCEL_OIDC_TOKEN,
  };
  const contextSymbol = Symbol.for("@vercel/request-context");
  const runtime = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const previousContext = runtime[contextSymbol];

  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  delete process.env.AI_MODEL;
  delete process.env.VERCEL_OIDC_TOKEN;
  runtime[contextSymbol] = {
    get: () => ({
      headers: { "x-vercel-oidc-token": "test-vercel-request-oidc-token" },
    }),
  };

  try {
    const capabilities = await CAPABILITIES();
    const payload = (await capabilities.json()) as {
      aiConfigured?: boolean;
      provider?: string | null;
      model?: string | null;
    };
    assert.equal(payload.aiConfigured, true);
    assert.equal(payload.provider, "vercel-ai-gateway");
    assert.equal(payload.model, "openai/gpt-5.6-sol");

    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        assert.equal(
          String(input),
          "https://ai-gateway.vercel.sh/v1/chat/completions",
        );
        assert.equal(
          new Headers(init?.headers).get("authorization"),
          "Bearer test-vercel-request-oidc-token",
        );
        const body = JSON.parse(String(init?.body)) as { model?: string };
        assert.equal(body.model, "openai/gpt-5.6-sol");
        return Response.json({
          choices: [{ message: { content: '{"ok":true}' } }],
        });
      },
    );

    const result = await getAIProvider().complete([
      { role: "user", content: "Return JSON." },
    ]);
    assert.equal(result, '{"ok":true}');
  } finally {
    if (previous.apiKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = previous.apiKey;
    if (previous.baseUrl === undefined) delete process.env.AI_BASE_URL;
    else process.env.AI_BASE_URL = previous.baseUrl;
    if (previous.model === undefined) delete process.env.AI_MODEL;
    else process.env.AI_MODEL = previous.model;
    if (previous.oidc === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = previous.oidc;
    if (previousContext === undefined) delete runtime[contextSymbol];
    else runtime[contextSymbol] = previousContext;
  }
});
