-- Remove database remnants of the retired in-repo creative renderer.
-- Supabase Storage objects/buckets must be removed through the Storage API,
-- never by deleting from storage.objects/storage.buckets in SQL.
do $$
begin
  if to_regclass('public.creative_render_jobs') is not null then
    execute 'drop trigger if exists render_transition on public.creative_render_jobs';
  end if;
end $$;

drop function if exists public.check_render_transition();
drop function if exists public.claim_creative_render();

drop policy if exists creative_output_read on storage.objects;
drop policy if exists creative_asset_download on storage.objects;
drop policy if exists creative_asset_upload on storage.objects;

drop table if exists public.creative_render_jobs cascade;
drop table if exists public.creative_assets cascade;

alter table public.creatives
  drop constraint if exists creatives_identity;

update public.creatives
set payload = payload - 'studio'
where payload ? 'studio';
