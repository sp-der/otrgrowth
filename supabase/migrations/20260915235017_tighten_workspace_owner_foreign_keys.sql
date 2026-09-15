alter table public.workspace_state
  drop constraint workspace_state_selected_business_id_fkey;

alter table public.workspace_state
  add constraint workspace_state_selected_business_owner_fkey
  foreign key (selected_business_id, owner_id)
  references public.businesses(id, owner_id);

alter table public.campaigns
  add constraint campaigns_id_owner_key unique (id, owner_id);

alter table public.creatives
  drop constraint creatives_campaign_id_fkey;

alter table public.creatives
  add constraint creatives_campaign_owner_fkey
  foreign key (campaign_id, owner_id)
  references public.campaigns(id, owner_id) on delete cascade;
