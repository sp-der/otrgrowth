-- Evidence-backed Ads Intelligence. No live ad-account mutation or spend execution.
create table public.ad_audits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  business_id uuid not null,
  campaign_id uuid,
  report jsonb not null,
  created_at timestamptz not null default now(),
  unique(id,business_id,owner_id),
  foreign key(business_id,owner_id)
    references public.businesses(id,owner_id) on delete cascade,
  foreign key(campaign_id,business_id,owner_id)
    references public.campaigns(id,business_id,owner_id) on delete cascade
);

create table public.ad_findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null,
  owner_id uuid not null default auth.uid(),
  business_id uuid not null,
  payload jsonb not null,
  foreign key(audit_id,business_id,owner_id)
    references public.ad_audits(id,business_id,owner_id) on delete cascade
);

create table public.ad_recommendations (
  id uuid primary key,
  audit_id uuid not null,
  owner_id uuid not null default auth.uid(),
  business_id uuid not null,
  payload jsonb not null,
  status text not null default 'Suggested'
    check(status in ('Suggested','In review','Approved','Rejected')),
  requires_approval boolean not null default true check(requires_approval),
  unique(id,owner_id),
  foreign key(audit_id,business_id,owner_id)
    references public.ad_audits(id,business_id,owner_id) on delete cascade
);

create table public.ad_approval_events (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null,
  owner_id uuid not null default auth.uid(),
  from_status text not null,
  to_status text not null,
  created_at timestamptz not null default now(),
  foreign key(recommendation_id,owner_id)
    references public.ad_recommendations(id,owner_id) on delete cascade
);

alter table public.ad_audits enable row level security;
create policy ad_audits_read on public.ad_audits
  for select to authenticated using(owner_id=(select auth.uid()));
create policy ad_audits_insert on public.ad_audits
  for insert to authenticated with check(owner_id=(select auth.uid()));
grant select,insert on public.ad_audits to authenticated;
create index ad_audits_owner_idx on public.ad_audits(owner_id);

alter table public.ad_findings enable row level security;
create policy ad_findings_read on public.ad_findings
  for select to authenticated using(owner_id=(select auth.uid()));
create policy ad_findings_insert on public.ad_findings
  for insert to authenticated with check(owner_id=(select auth.uid()));
grant select,insert on public.ad_findings to authenticated;
create index ad_findings_owner_idx on public.ad_findings(owner_id);

alter table public.ad_recommendations enable row level security;
create policy ad_recommendations_read on public.ad_recommendations
  for select to authenticated using(owner_id=(select auth.uid()));
create policy ad_recommendations_insert on public.ad_recommendations
  for insert to authenticated with check(owner_id=(select auth.uid()));
create policy recommendation_update on public.ad_recommendations
  for update to authenticated
  using(owner_id=(select auth.uid()))
  with check(owner_id=(select auth.uid()));
grant select,insert on public.ad_recommendations to authenticated;
grant update(status) on public.ad_recommendations to authenticated;
create index ad_recommendations_owner_idx on public.ad_recommendations(owner_id);

alter table public.ad_approval_events enable row level security;
create policy ad_approval_events_read on public.ad_approval_events
  for select to authenticated using(owner_id=(select auth.uid()));
create policy ad_approval_events_insert on public.ad_approval_events
  for insert to authenticated with check(owner_id=(select auth.uid()));
grant select,insert on public.ad_approval_events to authenticated;
create index ad_approval_events_owner_idx on public.ad_approval_events(owner_id);

revoke update,delete on
  public.ad_audits,
  public.ad_findings,
  public.ad_approval_events
from authenticated,anon;
revoke update,delete on public.ad_recommendations from authenticated,anon;
grant update(status) on public.ad_recommendations to authenticated;

create function public.log_ad_decision()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  if old.status is distinct from new.status then
    insert into public.ad_approval_events(
      recommendation_id,owner_id,from_status,to_status
    )
    values(new.id,auth.uid(),old.status,new.status);
  end if;
  return new;
end $$;

create trigger ad_decision
after update of status on public.ad_recommendations
for each row execute function public.log_ad_decision();

create function public.save_ad_audit(
  p_business_id uuid,
  p_campaign_id uuid,
  p_report jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  insert into public.ad_audits(business_id,campaign_id,report)
  values(p_business_id,p_campaign_id,p_report)
  returning id into v_id;

  insert into public.ad_findings(audit_id,business_id,payload)
  select v_id,p_business_id,item
  from jsonb_array_elements(p_report->'findings') item;

  insert into public.ad_recommendations(id,audit_id,business_id,payload)
  select (item->>'id')::uuid,v_id,p_business_id,item
  from jsonb_array_elements(p_report->'recommendations') item;

  return v_id;
end $$;

revoke all on function public.save_ad_audit(uuid,uuid,jsonb)
from public,anon;
grant execute on function public.save_ad_audit(uuid,uuid,jsonb)
to authenticated;
