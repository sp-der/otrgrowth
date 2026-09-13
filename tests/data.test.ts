import test from "node:test";
import assert from "node:assert/strict";
import { aggregateMetrics } from "../src/lib/data/metrics";
import { seedWorkspace } from "../src/lib/data/seed";
import {
  LocalWorkspaceRepository,
  STORAGE_KEY,
} from "../src/lib/data/local-repository";
import {
  businessProfileSchema,
  workspaceSchema,
} from "../src/lib/domain/schemas";
test("seed is valid, linked to Client 001 and leaves financial DNA unknown", () => {
  const w = workspaceSchema.parse(seedWorkspace());
  assert.equal(w.businesses[0].number, 1);
  assert.equal(w.businesses[0].profile.averageCustomerValue, "");
  assert.ok(w.metrics.every((m) => m.source === "demo"));
  assert.ok(
    [...w.content, ...w.campaigns, ...w.creatives, ...w.metrics].every(
      (r) => r.businessId === w.businesses[0].id,
    ),
  );
});
test("metrics derive rates from totals and handle zero denominators", () => {
  const result = aggregateMetrics(seedWorkspace().metrics);
  assert.equal(result.cpm, 7.5);
  assert.equal(result.ctr, 2);
  assert.equal(result.cpc, 0.375);
  assert.equal(result.cpl, 10);
  assert.equal(result.roas, 7.5);
  const empty = aggregateMetrics([]);
  assert.equal(empty.roas, null);
  assert.equal(empty.cpl, null);
});
test("DNA validates URLs, name and money without requiring unknown fields", () => {
  const profile = seedWorkspace().businesses[0].profile;
  assert.equal(
    businessProfileSchema.safeParse({
      ...profile,
      website: "javascript:alert(1)",
    }).success,
    false,
  );
  assert.equal(
    businessProfileSchema.safeParse({
      ...profile,
      averageCustomerValue: "-100",
    }).success,
    false,
  );
  assert.equal(
    businessProfileSchema.safeParse({ ...profile, businessName: "   " })
      .success,
    false,
  );
});
test("local repository persists changes, rejects corrupt storage without overwrite and surfaces quota failure", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  const repo = new LocalWorkspaceRepository();
  const w = await repo.load();
  w.businesses[0].profile.primaryGoal = "Increase qualified website inquiries";
  await repo.save(w);
  assert.equal(
    (await repo.load()).businesses[0].profile.primaryGoal,
    w.businesses[0].profile.primaryGoal,
  );
  values.set(STORAGE_KEY, "invalid");
  await assert.rejects(repo.load());
  assert.equal(values.get(STORAGE_KEY), "invalid");
  storage.setItem = () => {
    throw new Error("quota");
  };
  await assert.rejects(repo.save(w), /quota/);
  Reflect.deleteProperty(globalThis, "localStorage");
});
