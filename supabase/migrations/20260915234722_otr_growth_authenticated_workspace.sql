create table public.businesses (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  number integer not null check (number > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (owner_id, number),
  unique (id, owner_id)
);

create table public.workspace_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  selected_business_id uuid references public.businesses(id) on delete set null,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table public.business_profiles (
  business_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile jsonb not null,
  updated_at timestamptz not null default now(),
  foreign key (business_id, owner_id)
    references public.businesses(id, owner_id) on delete cascade
);

create table public.strategies (
  business_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  foreign key (business_id, owner_id)
    references public.businesses(id, owner_id) on delete cascade
);

create table public.content_items (
  id uuid primary key,
  business_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  foreign key (business_id, owner_id)
    references public.businesses(id, owner_id) on delete cascade
);

create table public.campaigns (
  id uuid primary key,
  business_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  foreign key (business_id, owner_id)
    references public.businesses(id, owner_id) on delete cascade
);

create table public.creatives (
  id uuid primary key,
  business_id uuid not null,
  campaign_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  foreign key (business_id, owner_id)
    references public.businesses(id, owner_id) on delete cascade,
  foreign key (campaign_id) references public.campaigns(id) on delete cascade
);

create table public.performance_metrics (
  id uuid primary key,
  business_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  foreign key (business_id, owner_id)
    references public.businesses(id, owner_id) on delete cascade
);

create table public.activity (
  id uuid primary key,
  business_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  foreign key (business_id, owner_id)
    references public.businesses(id, owner_id) on delete cascade
);

create index content_items_owner_business_idx on public.content_items(owner_id, business_id);
create index campaigns_owner_business_idx on public.campaigns(owner_id, business_id);
create index creatives_owner_business_idx on public.creatives(owner_id, business_id);
create index performance_metrics_owner_business_idx on public.performance_metrics(owner_id, business_id);
create index activity_owner_business_idx on public.activity(owner_id, business_id);

alter table public.businesses enable row level security;
alter table public.workspace_state enable row level security;
alter table public.business_profiles enable row level security;
alter table public.strategies enable row level security;
alter table public.content_items enable row level security;
alter table public.campaigns enable row level security;
alter table public.creatives enable row level security;
alter table public.performance_metrics enable row level security;
alter table public.activity enable row level security;

create policy businesses_owner_all on public.businesses
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy workspace_state_owner_all on public.workspace_state
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy business_profiles_owner_all on public.business_profiles
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy strategies_owner_all on public.strategies
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy content_items_owner_all on public.content_items
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy campaigns_owner_all on public.campaigns
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy creatives_owner_all on public.creatives
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy performance_metrics_owner_all on public.performance_metrics
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy activity_owner_all on public.activity
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.businesses to authenticated;
grant select, insert, update, delete on public.workspace_state to authenticated;
grant select, insert, update, delete on public.business_profiles to authenticated;
grant select, insert, update, delete on public.strategies to authenticated;
grant select, insert, update, delete on public.content_items to authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.creatives to authenticated;
grant select, insert, update, delete on public.performance_metrics to authenticated;
grant select, insert, update, delete on public.activity to authenticated;

create or replace function public.save_workspace(
  p_workspace jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_selected uuid;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if coalesce((p_workspace ->> 'version')::integer, 0) <> 1 then
    raise exception 'unsupported_workspace_version' using errcode = '22023';
  end if;

  if jsonb_typeof(p_workspace -> 'businesses') <> 'array'
     or jsonb_array_length(p_workspace -> 'businesses') = 0 then
    raise exception 'workspace_requires_business' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select revision into v_revision
  from public.workspace_state
  where owner_id = v_uid
  for update;

  if not found then
    v_revision := 0;
  end if;

  if v_revision <> p_expected_revision then
    raise exception 'workspace_conflict' using errcode = '40001';
  end if;

  insert into public.businesses (id, owner_id, number, created_at, updated_at)
  select
    (item ->> 'id')::uuid,
    v_uid,
    (item ->> 'number')::integer,
    (item ->> 'createdAt')::timestamptz,
    (item ->> 'updatedAt')::timestamptz
  from jsonb_array_elements(p_workspace -> 'businesses') item
  on conflict (id) do update set
    number = excluded.number,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at
  where public.businesses.owner_id = v_uid;

  insert into public.business_profiles (business_id, owner_id, profile, updated_at)
  select
    (item ->> 'id')::uuid,
    v_uid,
    item -> 'profile',
    now()
  from jsonb_array_elements(p_workspace -> 'businesses') item
  on conflict (business_id) do update set
    profile = excluded.profile,
    updated_at = now()
  where public.business_profiles.owner_id = v_uid;

  insert into public.strategies (business_id, owner_id, payload, updated_at)
  select
    (item ->> 'businessId')::uuid,
    v_uid,
    item,
    now()
  from jsonb_array_elements(coalesce(p_workspace -> 'strategies', '[]'::jsonb)) item
  on conflict (business_id) do update set
    payload = excluded.payload,
    updated_at = now()
  where public.strategies.owner_id = v_uid;

  insert into public.content_items (id, business_id, owner_id, payload, updated_at)
  select
    (item ->> 'id')::uuid,
    (item ->> 'businessId')::uuid,
    v_uid,
    item,
    now()
  from jsonb_array_elements(coalesce(p_workspace -> 'content', '[]'::jsonb)) item
  on conflict (id) do update set
    business_id = excluded.business_id,
    payload = excluded.payload,
    updated_at = now()
  where public.content_items.owner_id = v_uid;

  insert into public.campaigns (id, business_id, owner_id, payload, updated_at)
  select
    (item ->> 'id')::uuid,
    (item ->> 'businessId')::uuid,
    v_uid,
    item,
    now()
  from jsonb_array_elements(coalesce(p_workspace -> 'campaigns', '[]'::jsonb)) item
  on conflict (id) do update set
    business_id = excluded.business_id,
    payload = excluded.payload,
    updated_at = now()
  where public.campaigns.owner_id = v_uid;

  insert into public.creatives (id, business_id, campaign_id, owner_id, payload, updated_at)
  select
    (item ->> 'id')::uuid,
    (item ->> 'businessId')::uuid,
    (item ->> 'campaignId')::uuid,
    v_uid,
    item,
    now()
  from jsonb_array_elements(coalesce(p_workspace -> 'creatives', '[]'::jsonb)) item
  on conflict (id) do update set
    business_id = excluded.business_id,
    campaign_id = excluded.campaign_id,
    payload = excluded.payload,
    updated_at = now()
  where public.creatives.owner_id = v_uid;

  insert into public.performance_metrics (id, business_id, owner_id, payload, updated_at)
  select
    (item ->> 'id')::uuid,
    (item ->> 'businessId')::uuid,
    v_uid,
    item,
    now()
  from jsonb_array_elements(coalesce(p_workspace -> 'metrics', '[]'::jsonb)) item
  on conflict (id) do update set
    business_id = excluded.business_id,
    payload = excluded.payload,
    updated_at = now()
  where public.performance_metrics.owner_id = v_uid;

  insert into public.activity (id, business_id, owner_id, payload, updated_at)
  select
    (item ->> 'id')::uuid,
    (item ->> 'businessId')::uuid,
    v_uid,
    item,
    now()
  from jsonb_array_elements(coalesce(p_workspace -> 'activity', '[]'::jsonb)) item
  on conflict (id) do update set
    business_id = excluded.business_id,
    payload = excluded.payload,
    updated_at = now()
  where public.activity.owner_id = v_uid;

  delete from public.strategies row
  where row.owner_id = v_uid
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_workspace -> 'strategies', '[]'::jsonb)) item
      where (item ->> 'businessId')::uuid = row.business_id
    );

  delete from public.content_items row
  where row.owner_id = v_uid
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_workspace -> 'content', '[]'::jsonb)) item
      where (item ->> 'id')::uuid = row.id
    );

  delete from public.creatives row
  where row.owner_id = v_uid
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_workspace -> 'creatives', '[]'::jsonb)) item
      where (item ->> 'id')::uuid = row.id
    );

  delete from public.campaigns row
  where row.owner_id = v_uid
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_workspace -> 'campaigns', '[]'::jsonb)) item
      where (item ->> 'id')::uuid = row.id
    );

  delete from public.performance_metrics row
  where row.owner_id = v_uid
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_workspace -> 'metrics', '[]'::jsonb)) item
      where (item ->> 'id')::uuid = row.id
    );

  delete from public.activity row
  where row.owner_id = v_uid
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_workspace -> 'activity', '[]'::jsonb)) item
      where (item ->> 'id')::uuid = row.id
    );

  update public.workspace_state
  set selected_business_id = null
  where owner_id = v_uid;

  delete from public.businesses row
  where row.owner_id = v_uid
    and not exists (
      select 1 from jsonb_array_elements(p_workspace -> 'businesses') item
      where (item ->> 'id')::uuid = row.id
    );

  v_selected := (p_workspace ->> 'selectedBusinessId')::uuid;
  if not exists (
    select 1 from public.businesses
    where id = v_selected and owner_id = v_uid
  ) then
    raise exception 'selected_business_not_owned' using errcode = '22023';
  end if;

  insert into public.workspace_state (owner_id, selected_business_id, revision, updated_at)
  values (v_uid, v_selected, v_revision + 1, now())
  on conflict (owner_id) do update set
    selected_business_id = excluded.selected_business_id,
    revision = excluded.revision,
    updated_at = now();

  return jsonb_build_object('revision', v_revision + 1);
end;
$$;

revoke all on function public.save_workspace(jsonb, bigint) from public;
grant execute on function public.save_workspace(jsonb, bigint) to authenticated;
