import test from "node:test";
import assert from "node:assert/strict";
import { POST as audit } from "../src/app/api/ads/audit/route";

const request = (body: unknown, auth = true) =>
  new Request("http://localhost/api/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer test-user-token" } : {}),
    },
    body: JSON.stringify(body),
  });

test("Ads Intelligence rejects unauthenticated calls before database access", async () => {
  assert.equal((await audit(request({}, false))).status, 401);
});

test("audit rejects mismatched campaign and missing service config without sending data", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-test";
  delete process.env.ADS_ENGINE_URL;
  delete process.env.ADS_ENGINE_SECRET;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) =>
    Response.json(
      String(input).endsWith("/auth/v1/user")
        ? { id: crypto.randomUUID() }
        : String(input).includes("/businesses?")
          ? [{ id: crypto.randomUUID() }]
          : [],
    ),
  );
  assert.equal(
    (
      await audit(
        request({
          businessId: crypto.randomUUID(),
          campaignId: crypto.randomUUID(),
          evidence: {},
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await audit(
        request({
          businessId: crypto.randomUUID(),
          campaignId: null,
          evidence: {},
        }),
      )
    ).status,
    503,
  );
});
