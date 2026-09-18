create table if not exists public.creative_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  business_id uuid not null,
  kind text not null check (kind in ('image','video','logo','audio')),
  label text not null check (length(label) between 1 and 200),
  storage_path text not null unique,
  mime_type text not null check (
    mime_type in (
      'image/png','image/jpeg','image/webp',
      'video/mp4','video/webm',
      'audio/mpeg','audio/wav','audio/mp4','audio/ogg'
    )
  ),
  width integer check (width > 0),
  height integer check (height > 0),
  duration_seconds numeric check (duration_seconds > 0),
  created_at timestamptz not null default now(),
  constraint creative_assets_business_id_owner_id_fkey
    foreign key (business_id, owner_id)
    references public.businesses(id, owner_id)
    on delete cascade
);

alter table public.creative_assets enable row level security;

drop policy if exists creative_assets_read on public.creative_assets;
create policy creative_assets_read
on public.creative_assets
for select
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists creative_assets_insert on public.creative_assets;
create policy creative_assets_insert
on public.creative_assets
for insert
to authenticated
with check (owner_id = (select auth.uid()));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'creative-assets',
  'creative-assets',
  false,
  52428800,
  array[
    'image/png','image/jpeg','image/webp',
    'video/mp4','video/webm',
    'audio/mpeg','audio/wav','audio/mp4','audio/ogg'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists creative_asset_download on storage.objects;
create policy creative_asset_download
on storage.objects
for select
to authenticated
using (
  bucket_id = 'creative-assets'
  and exists (
    select 1
    from public.creative_assets a
    where a.storage_path = objects.name
      and a.owner_id = (select auth.uid())
  )
);

drop policy if exists creative_asset_upload on storage.objects;
create policy creative_asset_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'creative-assets'
  and exists (
    select 1
    from public.creative_assets a
    where a.storage_path = objects.name
      and a.owner_id = (select auth.uid())
  )
);
