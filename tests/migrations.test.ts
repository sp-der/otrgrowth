import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Ads migration is renderer-free and teardown removes retired creative infrastructure", async () => {
  const ads = await readFile(
    "supabase/migrations/20260917065654_ads_intelligence_engine.sql",
    "utf8",
  );
  const cleanup = await readFile(
    "supabase/migrations/20260918164000_remove_custom_creative_renderer.sql",
    "utf8",
  );

  for (const table of [
    "ad_audits",
    "ad_findings",
    "ad_recommendations",
    "ad_approval_events",
  ]) {
    assert.match(ads, new RegExp(`create table public\\.${table}\\b`));
  }

  assert.match(ads, /create function public\.save_ad_audit/);
  assert.match(ads, /create function public\.log_ad_decision/);
  assert.match(ads, /enable row level security/);
  assert.doesNotMatch(ads, /creative_render_jobs|creative_assets|creative-renders/i);

  assert.match(cleanup, /drop table if exists public\.creative_render_jobs/);
  assert.match(cleanup, /drop table if exists public\.creative_assets/);
  assert.match(cleanup, /payload = payload - 'studio'/);
  assert.match(cleanup, /Storage API/);
  assert.doesNotMatch(cleanup, /delete from storage\\.(objects|buckets)/);
});
