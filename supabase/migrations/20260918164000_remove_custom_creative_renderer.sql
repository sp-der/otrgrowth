-- Retire the custom creative-rendering stack while preserving Ads Intelligence.
drop trigger if exists render_transition on public.creative_render_jobs;
drop function if exists public.check_render_transition();
drop function if exists public.claim_creative_render();

drop policy if exists creative_output_read on storage.objects;
drop policy if exists creative_asset_download on storage.objects;
drop policy if exists creative_asset_upload on storage.objects;

delete from storage.objects
where bucket_id in ('creative-renders','creative-assets');

delete from storage.buckets
where id in ('creative-renders','creative-assets');

drop table if exists public.creative_render_jobs cascade;
drop table if exists public.creative_assets cascade;

alter table public.creatives
  drop constraint if exists creatives_identity;

update public.creatives
set payload = payload - 'studio'
where payload ? 'studio';
