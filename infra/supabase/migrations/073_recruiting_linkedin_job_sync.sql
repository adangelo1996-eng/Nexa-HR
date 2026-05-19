-- LinkedIn ↔ Nexa bidirectional job position sync (MVP).

alter table public.recruit_positions
  add column if not exists location text,
  add column if not exists source text not null default 'nexa',
  add column if not exists linkedin_job_id text,
  add column if not exists linkedin_job_url text,
  add column if not exists linkedin_sync_status text not null default 'not_linked',
  add column if not exists linkedin_last_synced_at timestamptz,
  add column if not exists linkedin_sync_error text;

alter table public.recruit_positions drop constraint if exists recruit_positions_source_check;
alter table public.recruit_positions
  add constraint recruit_positions_source_check check (source in ('nexa', 'linkedin'));

alter table public.recruit_positions drop constraint if exists recruit_positions_linkedin_sync_status_check;
alter table public.recruit_positions
  add constraint recruit_positions_linkedin_sync_status_check
  check (linkedin_sync_status in ('not_linked', 'pending', 'synced', 'error'));

create unique index if not exists idx_recruit_positions_company_linkedin_job
  on public.recruit_positions (company_id, linkedin_job_id)
  where linkedin_job_id is not null and linkedin_job_id <> '';

create index if not exists idx_recruit_positions_linkedin_sync
  on public.recruit_positions (company_id, linkedin_sync_status);

comment on column public.recruit_positions.source is 'Origin: nexa (created in HR) or linkedin (imported via webhook).';
comment on column public.recruit_positions.linkedin_sync_status is 'not_linked | pending | synced | error';

create table if not exists public.recruiting_integration_events (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  provider text not null default 'linkedin',
  event_type text not null,
  external_id text null,
  position_id uuid null references public.recruit_positions (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_recruiting_integration_events_company_created
  on public.recruiting_integration_events (company_id, created_at desc);

create index if not exists idx_recruiting_integration_events_external
  on public.recruiting_integration_events (provider, external_id, event_type)
  where external_id is not null;

alter table public.recruiting_integration_events enable row level security;

drop policy if exists "nexa_recruiting_integration_events_hr_select" on public.recruiting_integration_events;
create policy "nexa_recruiting_integration_events_hr_select"
on public.recruiting_integration_events for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and me.role in ('superuser', 'admin')
  )
);
