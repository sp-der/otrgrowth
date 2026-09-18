-- Assets are append-only so old creative snapshots remain reproducible.
create table public.creative_assets (
 id uuid primary key, owner_id uuid not null default auth.uid(), business_id uuid not null,
 kind text not null check(kind in ('image','video','logo','audio')),
 label text not null check(length(label) between 1 and 200),
 storage_path text not null unique,
 mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/mp4','audio/ogg')),
 width integer check(width>0), height integer check(height>0), duration_seconds numeric check(duration_seconds>0),
 created_at timestamptz not null default now(),
 foreign key(business_id,owner_id) references public.businesses(id,owner_id) on delete cascade,
 check(storage_path ~ ('^' || owner_id::text || '/' || business_id::text || '/' || id::text || '\\.(png|jpg|jpeg|webp|mp4|webm|mp3|wav|m4a|ogg)$')),
 check((kind in ('image','logo') and mime_type like 'image/%') or (kind='video' and mime_type like 'video/%') or (kind='audio' and mime_type like 'audio/%'))
);
create index creative_assets_business on public.creative_assets(owner_id,business_id);
alter table public.creative_assets enable row level security;
create policy creative_assets_read on public.creative_assets for select to authenticated using(owner_id=(select auth.uid()));
create policy creative_assets_insert on public.creative_assets for insert to authenticated with check(owner_id=(select auth.uid()));
grant select,insert on public.creative_assets to authenticated;
grant all on public.creative_assets to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('creative-assets','creative-assets',false,52428800,array['image/png','image/jpeg','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/mp4','audio/ogg']);
create policy creative_asset_upload on storage.objects for insert to authenticated with check(
 bucket_id='creative-assets' and exists(select 1 from public.creative_assets a where a.storage_path=name and a.owner_id=(select auth.uid()))
);
create policy creative_asset_download on storage.objects for select to authenticated using(
 bucket_id='creative-assets' and exists(select 1 from public.creative_assets a where a.storage_path=name and a.owner_id=(select auth.uid()))
);
