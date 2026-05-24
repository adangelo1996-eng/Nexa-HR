-- Hebb AI Mate: automazioni HR attive (company-wide o perimetro dipendenti).

create table if not exists public.hr_hebb_mate_automations (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  title text not null,
  description text not null default '',
  work_area text not null default 'all',
  frequency text not null default 'on_demand'
    check (frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'on_demand')),
  schedule_hint text not null default '',
  cron_expression text null,
  actions jsonb not null default '[]'::jsonb,
  tool_id text null,
  scope_kind text not null default 'company'
    check (scope_kind in ('self', 'employees', 'company')),
  subject_user_ids text[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  created_by_user_id text not null references public.users (id) on delete cascade,
  proposal_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_hebb_mate_automations_company_status
  on public.hr_hebb_mate_automations (company_id, status, updated_at desc);

create unique index if not exists uq_hr_hebb_mate_automations_proposal
  on public.hr_hebb_mate_automations (company_id, proposal_id)
  where proposal_id is not null;

comment on table public.hr_hebb_mate_automations is
  'Automazioni HR attivate da Hebb AI Mate (frequenza, area, azioni).';

alter table public.hr_hebb_mate_automations enable row level security;

drop policy if exists "nexa_hr_mate_automations_select" on public.hr_hebb_mate_automations;
create policy "nexa_hr_mate_automations_select"
on public.hr_hebb_mate_automations for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_hebb_mate_automations.company_id
      and (
        me.role = 'superuser'
        or public.nexa_rls_me_has_lifecycle_read()
      )
  )
);

drop policy if exists "nexa_hr_mate_automations_write" on public.hr_hebb_mate_automations;
create policy "nexa_hr_mate_automations_write"
on public.hr_hebb_mate_automations for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_hebb_mate_automations.company_id
      and public.nexa_rls_me_has_lifecycle_write()
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_hebb_mate_automations.company_id
      and public.nexa_rls_me_has_lifecycle_write()
  )
);

notify pgrst, 'reload schema';
