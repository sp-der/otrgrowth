import test from "node:test";
import assert from "node:assert/strict";
import { generateStrategy } from "../src/lib/ai/client";
import { OpenAICompatibleProvider } from "../src/lib/ai/provider";
import { parseStrategyResponse } from "../src/lib/ai/schemas/strategy-response";
import { strategySchema } from "../src/lib/domain/schemas";
import { seedWorkspace } from "../src/lib/data/seed";
import { strategyMessages } from "../src/lib/ai/prompts/strategy";
import {
  handleStrategyRequest,
  POST,
} from "../src/app/api/ai/strategy/route";

export const fixture = {
  executiveSummary:
    "Focus on clear website project inquiries. Geography and budget are unconfirmed; validate both before launch.",
  idealCustomerProfiles: [
    {
      name: "Proposed: local service owners",
      description: "Owners who need a clearer web presence.",
      painPoints: ["Unclear inquiry path"],
    },
  ],
  positioning:
    "Represent the business clearly through website building, management, and branding.",
  offerRecommendations: [
    "Invite a conversation about the website; confirm scope before quoting.",
  ],
  contentPillars: [
    {
      name: "Website clarity",
      purpose: "Demonstrate the value of thoughtful design.",
      ideas: ["Show a mobile contact journey."],
    },
  ],
  channelRecommendations: [
    {
      channel: "Proposed: Instagram",
      rationale: "A visual place to explain design decisions.",
      cadence: "Two posts per week, subject to capacity.",
    },
  ],
  campaignConcepts: [
    {
      name: "Built to represent you",
      objective: "Website project inquiries",
      concept: "Show approved portfolio work.",
      callToAction: "Discuss your project.",
    },
  ],
  thirtyDayPriorities: [1, 2, 3, 4].map((week) => ({
    week,
    actions: ["Review approved content and record inquiry sources."],
  })),
  keyMetrics: [
    {
      name: "Qualified inquiries",
      reason: "Measure service interest.",
      measurement: "Record inquiry sources and confirmed project fit.",
    },
  ],
};
const config = {
  baseUrl: "http://127.0.0.1:3001/v1/",
  apiKey: "test-fixture-only",
  model: "auto:smart",
};
const profile = seedWorkspace().businesses[0].profile;
const fakeFetch =
  (value: Response | Error): typeof fetch =>
  async () => {
    if (value instanceof Error) throw value;
    return value;
  };
test("valid structured strategy uses profile-specific instructions", async () => {
  const output = await generateStrategy(profile, {
    complete: async (messages) => {
      assert.equal(messages[0].role, "system");
      assert.match(messages[1].content, /OTR Services/);
      assert.match(messages[0].content, /untrusted business data/);
      return JSON.stringify(fixture);
    },
  });
  assert.deepEqual(output, fixture);
  assert.ok(strategyMessages(profile)[0].content.includes("JSON schema:"));
});
test("accepts fenced JSON, rejects partial or invalid structured output", () => {
  assert.deepEqual(
    parseStrategyResponse("```json\n" + JSON.stringify(fixture) + "\n```"),
    fixture,
  );
  for (const invalid of ["not json", "{}", '{"executiveSummary":"hello"}'])
    assert.throws(() => parseStrategyResponse(invalid), {
      code: "MALFORMED_RESPONSE",
    });
  assert.equal(
    strategySchema.safeParse({
      ...fixture,
      thirtyDayPriorities: Array(4).fill({ week: 1, actions: ["Do work"] }),
    }).success,
    false,
  );
});
test("provider sends OpenAI-compatible requests and keeps credentials on transport", async () => {
  const provider = new OpenAICompatibleProvider(
    config,
    async (url, options) => {
      assert.equal(String(url), "http://127.0.0.1:3001/v1/chat/completions");
      assert.equal(
        (options?.headers as Record<string, string>).Authorization,
        "Bearer test-fixture-only",
      );
      const body = JSON.parse(String(options?.body));
      assert.equal(body.model, "auto:smart");
      assert.equal(body.response_format.type, "json_object");
      assert.equal(body.stream, false);
      assert.equal(options?.redirect, "error");
      return Response.json({
        choices: [{ message: { content: JSON.stringify(fixture) } }],
      });
    },
  );
  assert.deepEqual(await generateStrategy(profile, provider), fixture);
});
test("missing credentials and invalid remote HTTP config fail safely before fetch", async () => {
  let called = false;
  const fn: typeof fetch = async () => {
    called = true;
    throw new Error();
  };
  await assert.rejects(
    new OpenAICompatibleProvider({ ...config, apiKey: "" }, fn).complete([]),
    { code: "GATEWAY_NOT_CONFIGURED" },
  );
  await assert.rejects(
    new OpenAICompatibleProvider(
      { ...config, baseUrl: "http://remote.example/v1" },
      fn,
    ).complete([]),
    { code: "GATEWAY_NOT_CONFIGURED" },
  );
  assert.equal(called, false);
});
test("unreachable, timed-out, unauthorized and rate-limited gateways return safe errors", async () => {
  for (const [response, code] of [
    [new Error("sensitive network details"), "PROVIDER_UNAVAILABLE"],
    [new DOMException("timeout", "TimeoutError"), "PROVIDER_UNAVAILABLE"],
    [new Response("secret details", { status: 401 }), "GATEWAY_NOT_CONFIGURED"],
    [new Response("secret details", { status: 403 }), "PROVIDER_UNAVAILABLE"],
    [new Response("secret details", { status: 429 }), "PROVIDER_UNAVAILABLE"],
  ] as const) {
    await assert.rejects(
      new OpenAICompatibleProvider(config, fakeFetch(response)).complete([]),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as Error & { code: string }).code, code);
        assert.doesNotMatch(
          error.message,
          /secret details|test-fixture-only|sensitive network/,
        );
        return true;
      },
    );
  }
});
test("malformed, empty and oversized provider responses are rejected", async () => {
  for (const response of [
    new Response("bad json"),
    Response.json({ choices: [] }),
    Response.json({ choices: [{ message: { content: null } }] }),
    new Response("x".repeat(256001)),
  ]) {
    await assert.rejects(
      new OpenAICompatibleProvider(config, fakeFetch(response)).complete([]),
      { code: "MALFORMED_RESPONSE" },
    );
  }
});
const request = (
  body: string,
  headers: Record<string, string> = { "Content-Type": "application/json" },
) =>
  new Request("http://localhost:3000/api/ai/strategy", {
    method: "POST",
    headers,
    body,
  });
const authenticatedPOST = (req: Request) =>
  handleStrategyRequest(req, async () => "test-user");
test("API requires authentication", async () => {
  const response = await POST(request(JSON.stringify(profile)));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "UNAUTHORIZED");
});
test("API validates bad input, payload sizes, content types and request origins", async () => {
  assert.equal((await authenticatedPOST(request("invalid"))).status, 400);
  assert.equal((await authenticatedPOST(request("{}"))).status, 400);
  assert.equal((await authenticatedPOST(request("x".repeat(64001)))).status, 413);
  assert.equal(
    (
      await authenticatedPOST(
        request("{}", { "Content-Type": "text/plain" }),
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await authenticatedPOST(
        request("{}", {
          "Content-Type": "application/json",
          Origin: "https://other.example",
        }),
      )
    ).status,
    403,
  );
});
test("API returns actionable missing-configuration response without credentials", async () => {
  const before = process.env.AI_API_KEY;
  delete process.env.AI_API_KEY;
  try {
    const response = await authenticatedPOST(request(JSON.stringify(profile)));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "GATEWAY_NOT_CONFIGURED");
    assert.match(body.error, /AI Gateway must be configured/);
    assert.doesNotMatch(JSON.stringify(body), /test-fixture-only/);
  } finally {
    if (before !== undefined) process.env.AI_API_KEY = before;
  }
});
