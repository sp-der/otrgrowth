import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

test("migrations leave Ads Intelligence isolated and remove the retired render stack", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid,name text,bucket_id text); alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin return; end$$;`);
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    }

    const owner = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    const business = "33333333-3333-4333-8333-333333333333";
    const campaign = "44444444-4444-4444-8444-444444444444";

    await db.exec(`insert into auth.users values('${owner}'),('${other}');
 set role authenticated;
 select set_config('request.jwt.claim.sub','${owner}',false);
 insert into businesses values('${business}','${owner}',1,now(),now());
 insert into campaigns(id,business_id,owner_id,payload) values('${campaign}','${business}','${owner}','{}');`);

    const report = {
      findings: [{ status: "unknown" }],
      recommendations: [{ id: crypto.randomUUID() }],
    };
    const audit = (
      await db.query<{ id: string }>(
        "select save_ad_audit($1,$2,$3::jsonb) as id",
        [business, campaign, JSON.stringify(report)],
      )
    ).rows[0].id;
    assert.ok(audit);
    assert.equal((await db.query("select * from ad_findings")).rows.length, 1);

    await db.exec("update ad_recommendations set status='Approved'");
    assert.equal(
      (await db.query("select * from ad_approval_events")).rows.length,
      1,
    );
    await assert.rejects(
      db.exec("update ad_recommendations set status='Applied'"),
    );

    await db.exec(
      `select set_config('request.jwt.claim.sub','${other}',false)`,
    );
    assert.equal((await db.query("select * from ad_audits")).rows.length, 0);
    assert.equal(
      (await db.query("select * from ad_recommendations")).rows.length,
      0,
    );

    await db.exec("reset role");
    const retired = await db.query<{ render_jobs: string | null; assets: string | null }>(
      "select to_regclass('public.creative_render_jobs')::text as render_jobs, to_regclass('public.creative_assets')::text as assets",
    );
    assert.equal(retired.rows[0].render_jobs, null);
    assert.equal(retired.rows[0].assets, null);
  } finally {
    await db.close();
  }
});
