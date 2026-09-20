import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { POST } from "../src/app/api/content-studio/session/route";
import { POST as GENERATE } from "../src/app/api/content-studio/generate/route";
import { GET as CAPABILITIES } from "../src/app/api/content-studio/capabilities/route";
import { getAIProvider } from "../src/lib/ai/provider";
import { resolveCreativeWebsites } from "../src/lib/ai/asset-scout";
import { normalizeHyperframesMetadata, videoGeneratorInputSchema } from "../src/lib/ai/hyperframes";
import {
  AUTONOMOUS_VIDEO_ESTIMATED_COST_USD,
  AUTONOMOUS_VIDEO_MODEL,
  generateAutonomousVideo,
} from "../src/lib/ai/video-gateway";
import { reviewContactSheet } from "../src/lib/ai/visual-qa";
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

test("HyperFrames metadata is normalized before validation", () => {
  const input = { durationSeconds: 30 as const, aspectRatio: "9:16" as const };

  const missing = normalizeHyperframesMetadata(
    '<html><body><div id="main" class="composition"><section class="clip"></section></div></body></html>',
    input,
  );
  assert.match(missing, /data-composition-id="main"/);
  assert.match(missing, /data-start="0"/);
  assert.match(missing, /data-duration="30"/);
  assert.match(missing, /data-width="1080"/);
  assert.match(missing, /data-height="1920"/);

  const incorrect = normalizeHyperframesMetadata(
    "<html><body><main data-composition-id='wrong' data-duration='15' data-width='1' data-height='1'></main></body></html>",
    input,
  );
  assert.match(incorrect, /id="main"/);
  assert.match(incorrect, /data-composition-id="main"/);
  assert.match(incorrect, /data-duration="30"/);
  assert.doesNotMatch(incorrect, /data-composition-id=['"]wrong/);
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

test("Autonomous video defaults stay inside the hard spend ceiling", () => {
  const parsed = videoGeneratorInputSchema.parse({
    businessId: "00000000-0000-4000-8000-000000000001",
    prompt: "Create a premium OTR Services portfolio video.",
    durationSeconds: 30,
    aspectRatio: "9:16",
    style: "premium",
    cta: "Built to represent your business right.",
  });

  assert.equal(parsed.aiVideo, true);
  assert.equal(parsed.videoBudgetUsd, 0.5);
  assert.equal(AUTONOMOUS_VIDEO_ESTIMATED_COST_USD, 0.4);
  assert.equal(
    videoGeneratorInputSchema.safeParse({
      ...parsed,
      videoBudgetUsd: 0.51,
    }).success,
    false,
  );
});

test("Autonomous video budget blocks paid requests before fetch", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      generateAutonomousVideo(
        {
          prompt: "Cinematic purple creative studio motion with no text or logos.",
          aspectRatio: "9:16",
          maxBudgetUsd: 0.39,
        },
        {
          fetcher: async () => {
            calls += 1;
            return Response.json({});
          },
        },
      ),
    /above this generation's video budget/,
  );
  assert.equal(calls, 0);
});

test("Autonomous video starts one idempotent paid operation and polls without retrying", async () => {
  const previous = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let statusCalls = 0;
  try {
    const result = await generateAutonomousVideo(
      {
        prompt: "Cinematic purple creative studio motion with no text or logos.",
        aspectRatio: "9:16",
        maxBudgetUsd: 0.5,
      },
      {
        idempotencyKey: "otr-test-operation",
        pollIntervalMs: 0,
        pollTimeoutMs: 5_000,
        sleep: async () => {},
        fetcher: async (input, init) => {
          const url = String(input);
          calls.push({ url, init });
          if (url.endsWith("/v1/credits")) {
            return Response.json({ balance: "10.00" });
          }
          if (url.endsWith("/video-model/start")) {
            const headers = new Headers(init?.headers);
            assert.equal(headers.get("ai-gateway-auth-method"), "api-key");
            assert.equal(headers.get("ai-video-model-specification-version"), "4");
            assert.equal(headers.get("ai-model-id"), AUTONOMOUS_VIDEO_MODEL);
            assert.equal(headers.get("idempotency-key"), "otr-test-operation");
            const body = JSON.parse(String(init?.body)) as {
              n?: number;
              duration?: number;
              resolution?: string;
              generateAudio?: boolean;
            };
            assert.equal(body.n, 1);
            assert.equal(body.duration, 4);
            assert.equal(body.resolution, "720p");
            assert.equal(body.generateAudio, false);
            return Response.json({ operation: { id: "op-1" } });
          }
          if (url.endsWith("/video-model/status")) {
            statusCalls += 1;
            if (statusCalls === 1) return Response.json({ status: "pending" });
            return Response.json({
              status: "completed",
              videos: [
                {
                  type: "url",
                  url: "https://cdn.example.com/generated.mp4",
                  mediaType: "video/mp4",
                },
              ],
            });
          }
          throw new Error(`Unexpected fetch: ${url}`);
        },
      },
    );

    assert.equal(result.model, AUTONOMOUS_VIDEO_MODEL);
    assert.equal(result.estimatedCostUsd, 0.4);
    assert.equal(result.video.type, "url");
    assert.equal(
      calls.filter(({ url }) => url.endsWith("/video-model/start")).length,
      1,
    );
    assert.equal(statusCalls, 2);
  } finally {
    if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previous;
  }
});

test("Visual QA sends the HyperFrames contact sheet through native Gateway v4", async () => {
  const previous = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  try {
    const input = videoGeneratorInputSchema.parse({
      businessId: "00000000-0000-4000-8000-000000000001",
      prompt: "Create a professional OTR Services portfolio ad.",
      durationSeconds: 30,
      aspectRatio: "9:16",
      style: "premium dark purple agency reel",
      cta: "Built to represent your business right.",
    });
    const review = await reviewContactSheet(
      input,
      Buffer.from("fake-jpeg").toString("base64"),
      "HyperFrames check passed.",
      async (request, init) => {
        assert.equal(
          String(request),
          "https://ai-gateway.vercel.sh/v4/ai/language-model",
        );
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("ai-gateway-auth-method"), "api-key");
        assert.equal(headers.get("ai-language-model-specification-version"), "4");
        const body = JSON.parse(String(init?.body)) as {
          prompt?: Array<{
            role?: string;
            content?: Array<{
              type?: string;
              mediaType?: string;
              data?: { type?: string; data?: string };
            }>;
          }>;
        };
        const filePart = body.prompt?.[1]?.content?.find(
          (part) => part.type === "file",
        );
        assert.equal(filePart?.mediaType, "image/jpeg");
        assert.equal(filePart?.data?.type, "data");
        assert.ok(filePart?.data?.data);
        return Response.json({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                approved: true,
                summary: "Frames are coherent and ready.",
                findings: [],
              }),
            },
          ],
        });
      },
    );
    assert.equal(review.approved, true);
  } finally {
    if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previous;
  }
});

test("HyperFrames host generation uses official check and system Chromium, not a custom renderer", async () => {
  const source = await readFile("services/hyperframes-host/generator.mjs", "utf8");
  assert.match(source, /"check", projectDir/);
  assert.match(source, /HYPERFRAMES_BROWSER_PATH/);
  assert.match(source, /--screenshot=/);
  assert.match(source, /data-composition-id/);
  assert.match(source, /"snapshot"/);
  assert.match(source, /ai-hero\.mp4/);
  assert.match(source, /"render"/);
  assert.match(source, /"--quality",\s*"high"/);
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
