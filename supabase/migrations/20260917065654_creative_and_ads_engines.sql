-- Snapshot jobs are independent of save_workspace, which remains unchanged.
alter table public.creatives add constraint creatives_identity unique(id,business_id,owner_id);
create table public.creative_render_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid(), business_id uuid not null, creative_id uuid not null,
 composition jsonb not null check (jsonb_typeof(composition) = 'object'),
 status text not null default 'queued' check(status in ('queued','rendering','completed','failed')),
 output_path text, error text,
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 foreign key(creative_id,business_id,owner_id) references public.creatives(id,business_id,owner_id) on delete cascade,
 check ((status = 'completed') = (output_path is not null)),
 check (output_path is null or output_path = owner_id::text || '/' || id::text || '.mp4')
);
create unique index creative_render_active on public.creative_render_jobs(creative_id) where status in ('queued','rendering');
create index render_jobs_claim on public.creative_render_jobs(created_at) where status = 'queued';
create index render_jobs_owner on public.creative_render_jobs(owner_id,business_id);
alter table public.creative_render_jobs enable row level security;
create policy render_jobs_read on public.creative_render_jobs for select to authenticated using(owner_id=(select auth.uid()));
create policy render_jobs_insert on public.creative_render_jobs for insert to authenticated with check(
 owner_id=(select auth.uid()) and status='queued' and output_path is null and error is null and started_at is null and finished_at is null
 and exists(select 1 from public.creatives c where c.id=creative_id and c.owner_id=(select auth.uid()) and c.payload->'studio'->'composition'=composition)
);
grant select,insert on public.creative_render_jobs to authenticated;
grant all on public.creative_render_jobs to service_role;

create function public.claim_creative_render() returns setof public.creative_render_jobs
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.creative_render_jobs set status='failed',error='Worker lease expired; submit a new render.',finished_at=now()
 where status='rendering' and started_at<now()-interval '20 minutes';
 return query update public.creative_render_jobs set status='rendering',started_at=now()
 where id=(select id from public.creative_render_jobs where status='queued' order by created_at for update skip locked limit 1)
 returning *;
end $$;
revoke all on function public.claim_creative_render() from public,anon,authenticated;
grant execute on function public.claim_creative_render() to service_role;

create table public.ad_audits (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(), business_id uuid not null,
 campaign_id uuid, report jsonb not null, created_at timestamptz not null default now(),
 unique(id,business_id,owner_id),
 foreign key(business_id,owner_id) references public.businesses(id,owner_id) on delete cascade,
 foreign key(campaign_id,business_id,owner_id) references public.campaigns(id,business_id,owner_id) on delete cascade
);
create table public.ad_findings (
 id uuid primary key default gen_random_uuid(), audit_id uuid not null, owner_id uuid not null default auth.uid(), business_id uuid not null,
 payload jsonb not null,
 foreign key(audit_id,business_id,owner_id) references public.ad_audits(id,business_id,owner_id) on delete cascade
);
create table public.ad_recommendations (
 id uuid primary key, audit_id uuid not null, owner_id uuid not null default auth.uid(), business_id uuid not null,
 payload jsonb not null, status text not null default 'Suggested' check(status in ('Suggested','In review','Approved','Rejected')),
 requires_approval boolean not null default true check(requires_approval),
 foreign key(audit_id,business_id,owner_id) references public.ad_audits(id,business_id,owner_id) on delete cascade
);
create table public.ad_approval_events (
 id uuid primary key default gen_random_uuid(), recommendation_id uuid not null references public.ad_recommendations(id) on delete cascade,
 owner_id uuid not null default auth.uid(), from_status text not null, to_status text not null, created_at timestamptz not null default now()
);
alter table public.ad_audits enable row level security;
create policy ad_audits_read on public.ad_audits for select to authenticated using(owner_id=(select auth.uid()));
create policy ad_audits_insert on public.ad_audits for insert to authenticated with check(owner_id=(select auth.uid()));
grant select,insert on public.ad_audits to authenticated;
create index ad_audits_owner_idx on public.ad_audits(owner_id);
alter table public.ad_findings enable row level security;
create policy ad_findings_read on public.ad_findings for select to authenticated using(owner_id=(select auth.uid()));
create policy ad_findings_insert on public.ad_findings for insert to authenticated with check(owner_id=(select auth.uid()));
grant select,insert on public.ad_findings to authenticated;
create index ad_findings_owner_idx on public.ad_findings(owner_id);
alter table public.ad_recommendations enable row level security;
create policy ad_recommendations_read on public.ad_recommendations for select to authenticated using(owner_id=(select auth.uid()));
create policy ad_recommendations_insert on public.ad_recommendations for insert to authenticated with check(owner_id=(select auth.uid()));
grant select,insert on public.ad_recommendations to authenticated;
create index ad_recommendations_owner_idx on public.ad_recommendations(owner_id);
alter table public.ad_approval_events enable row level security;
create policy ad_approval_events_read on public.ad_approval_events for select to authenticated using(owner_id=(select auth.uid()));
create policy ad_approval_events_insert on public.ad_approval_events for insert to authenticated with check(owner_id=(select auth.uid()));
grant select,insert on public.ad_approval_events to authenticated;
create index ad_approval_events_owner_idx on public.ad_approval_events(owner_id);
-- Status changes go through one authenticated transaction, recording the actor and decision.
create policy recommendation_update on public.ad_recommendations for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
grant update(status) on public.ad_recommendations to authenticated;
create function public.log_ad_decision() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.status is distinct from new.status then
   insert into public.ad_approval_events(recommendation_id,owner_id,from_status,to_status) values(new.id,auth.uid(),old.status,new.status);
 end if;
 return new;
end $$;
create trigger ad_decision after update of status on public.ad_recommendations for each row execute function public.log_ad_decision();
create function public.save_ad_audit(p_business_id uuid,p_campaign_id uuid,p_report jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 insert into public.ad_audits(business_id,campaign_id,report) values(p_business_id,p_campaign_id,p_report) returning id into v_id;
 insert into public.ad_findings(audit_id,business_id,payload) select v_id,p_business_id,item from jsonb_array_elements(p_report->'findings') item;
 insert into public.ad_recommendations(id,audit_id,business_id,payload)
 select (item->>'id')::uuid,v_id,p_business_id,item from jsonb_array_elements(p_report->'recommendations') item;
 return v_id;
end $$;
revoke all on function public.save_ad_audit(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_ad_audit(uuid,uuid,jsonb) to authenticated;

-- Private outputs: only the worker writes; owners can request short-lived signed URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('creative-renders','creative-renders',false,104857600,array['video/mp4']) on conflict(id) do nothing;
create policy creative_output_read on storage.objects for select to authenticated
using(bucket_id='creative-renders' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Be explicit even when a project's default privileges grant broader access.
revoke update,delete on public.creative_render_jobs from authenticated,anon;
revoke update,delete on public.ad_audits,public.ad_findings,public.ad_approval_events from authenticated,anon;
revoke update,delete on public.ad_recommendations from authenticated,anon;
grant update(status) on public.ad_recommendations to authenticated;
alter table public.ad_recommendations add constraint recommendation_identity unique(id,owner_id);
alter table public.ad_approval_events drop constraint ad_approval_events_recommendation_id_fkey;
alter table public.ad_approval_events add foreign key(recommendation_id,owner_id) references public.ad_recommendations(id,owner_id) on delete cascade;
create function public.check_render_transition() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.id<>old.id or new.owner_id<>old.owner_id or new.business_id<>old.business_id or new.creative_id<>old.creative_id or new.composition<>old.composition then
  raise exception 'render_snapshot_is_immutable';
 end if;
 if not ((old.status='queued' and new.status='rendering') or (old.status='rendering' and new.status in ('completed','failed'))) then
  raise exception 'invalid_render_transition';
 end if;
 return new;
end $$;
create trigger render_transition before update on public.creative_render_jobs for each row execute function public.check_render_transition();
