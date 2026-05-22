-- Wizard offboarding HR multi-step + preavviso su profilo dipendente

alter table public.users
  add column if not exists "noticePeriodMonths" smallint null
    check ("noticePeriodMonths" is null or ("noticePeriodMonths" >= 0 and "noticePeriodMonths" <= 24));

comment on column public.users."noticePeriodMonths" is 'Preavviso contrattuale in mesi (HR); opzionale se derivato da CCNL/contratto.';

create table if not exists public.hr_offboarding_wizard (
  user_id text primary key references public.users (id) on delete cascade,
  company_id text not null,
  current_step_index integer not null default 0 check (current_step_index >= 0 and current_step_index <= 7),
  steps_json jsonb not null default '{}'::jsonb,
  cancelled_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  updated_by_user_id text null references public.users (id) on delete set null
);

create index if not exists idx_hr_offboarding_wizard_company on public.hr_offboarding_wizard (company_id);

alter table public.hr_offboarding_wizard enable row level security;

drop policy if exists "nexa_hr_offboarding_wizard_select" on public.hr_offboarding_wizard;
create policy "nexa_hr_offboarding_wizard_select"
on public.hr_offboarding_wizard for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.hr_offboarding_wizard.user_id = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.hr_offboarding_wizard.user_id and sub."managerId" = me.id
      )
    )
  )
);

notify pgrst, 'reload schema';
