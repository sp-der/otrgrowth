alter table public.campaigns
  add constraint campaigns_id_business_owner_key unique (id, business_id, owner_id);

alter table public.creatives
  drop constraint creatives_campaign_owner_fkey;

alter table public.creatives
  add constraint creatives_campaign_business_owner_fkey
  foreign key (campaign_id, business_id, owner_id)
  references public.campaigns(id, business_id, owner_id) on delete cascade;

create index creatives_campaign_business_owner_idx
  on public.creatives(campaign_id, business_id, owner_id);
