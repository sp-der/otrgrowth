import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { POST } from "../src/app/api/content-studio/session/route";
import { POST as GENERATE } from "../src/app/api/content-studio/generate/route";
import { GET as CAPABILITIES } from "../src/app/api/content-studio/capabilities/route";
import { getAIProvider } from "../src/lib/ai/provider";
import { resolveCreativeWebsites } from "../src/lib/ai/asset-scout";
import { videoGeneratorInputSchema } from "../src/lib/ai/hyperframes";
import { seedWorkspace } from "../src/lib/data/seed";

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

test("Autonomous asset scout resolves the OTR Services portfolio without manual URLs", () => {
  const workspace = seedWorkspace();
  const input = videoGeneratorInputSchema.parse({
    businessId: workspace.businesses[0].id,
    prompt: "Create a premium portfolio reel showing the websites we have built.",
    durationSeconds: 30,
    aspectRatio: "9:16",
    style: "premium agency reel",
    cta: "Built to represent your business right.",
  });

  assert.equal(input.autoAssets, true);
  assert.deepEqual(input.websites, []);

  const websites = resolveCreativeWebsites(
    input,
    workspace.businesses[0].profile,
    workspace.campaigns,
  );

  assert.deepEqual(websites, [
    "https://pacificstayproperties.com/",
    "https://mdhgrill.com/",
    "https://pressedinpink.com/",
    "https://jmb2creations.com/",
  ]);
});

test("Manual asset sourcing remains an explicit override", () => {
  const workspace = seedWorkspace();
  const input = videoGeneratorInputSchema.parse({
    businessId: workspace.businesses[0].id,
    prompt: "Create a focused website showcase.",
    durationSeconds: 15,
    aspectRatio: "9:16",
    style: "clean",
    cta: "",
    autoAssets: false,
    websites: ["https://example.com"],
  });

  assert.deepEqual(
    resolveCreativeWebsites(input, workspace.businesses[0].profile, workspace.campaigns),
    ["https://example.com/"],
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


test("Content Studio uses native Vercel Gateway v4 for request-scoped OIDC", async (t) => {
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
    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        assert.equal(
          headers.get("authorization"),
          "Bearer test-vercel-request-oidc-token",
        );
        assert.equal(headers.get("ai-gateway-auth-method"), "oidc");
        assert.equal(headers.get("ai-gateway-protocol-version"), "0.0.1");

        if (url === "https://ai-gateway.vercel.sh/v1/credits") {
          return Response.json({ balance: "10.00", total_used: "0.00" });
        }

        if (url === "https://ai-gateway.vercel.sh/v4/ai/config") {
          return Response.json({
            models: [{ id: "openai/gpt-5.6-sol" }],
          });
        }

        assert.equal(
          url,
          "https://ai-gateway.vercel.sh/v4/ai/language-model",
        );
        assert.equal(
          headers.get("ai-language-model-specification-version"),
          "4",
        );
        assert.equal(
          headers.get("ai-language-model-id"),
          "openai/gpt-5.6-sol",
        );
        assert.equal(headers.get("ai-language-model-streaming"), "false");

        const body = JSON.parse(String(init?.body)) as {
          prompt?: Array<unknown>;
          maxOutputTokens?: number;
          responseFormat?: { type?: string };
        };
        assert.equal(body.maxOutputTokens, 16);
        assert.equal(body.responseFormat?.type, "json");
        assert.equal(body.prompt?.length, 1);

        return Response.json({
          content: [{ type: "text", text: '{"ok":true}' }],
        });
      },
    );

    const capabilities = await CAPABILITIES();
    const payload = (await capabilities.json()) as {
      aiConfigured?: boolean;
      provider?: string | null;
      model?: string | null;
      gatewayAuthenticated?: boolean | null;
      gatewayModelAvailable?: boolean | null;
    };
    assert.equal(payload.aiConfigured, true);
    assert.equal(payload.provider, "vercel-ai-gateway-native-v4");
    assert.equal(payload.model, "openai/gpt-5.6-sol");
    assert.equal(payload.gatewayAuthenticated, true);
    assert.equal(payload.gatewayModelAvailable, true);

    const result = await getAIProvider({
      maxTokens: 16,
    }).complete([{ role: "user", content: "Return JSON." }]);
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
