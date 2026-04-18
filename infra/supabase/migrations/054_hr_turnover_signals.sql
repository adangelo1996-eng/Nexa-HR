-- Segnali turnover / retention (versione rule-based); snapshot per run (batch).

create table if not exists public.hr_turnover_signals (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  user_id text not null references public.users (id) on delete cascade,
  run_id uuid not null,
  score numeric not null,
  confidence numeric not null,
  reasons jsonb not null default '[]'::jsonb,
  signals jsonb not null default '{}'::jsonb,
  model_version text not null default 'rule-v1',
  computed_at timestamptz not null default now()
);

create index if not exists idx_hr_turnover_signals_company_run
  on public.hr_turnover_signals (company_id, run_id);

create index if not exists idx_hr_turnover_signals_company_computed
  on public.hr_turnover_signals (company_id, computed_at desc);

comment on table public.hr_turnover_signals is 'Snapshot segnali turnover (rule-v1); storico per run_id e trend aggregati.';

alter table public.hr_turnover_signals enable row level security;

drop policy if exists "nexa_hr_turnover_signals_select_hr" on public.hr_turnover_signals;
create policy "nexa_hr_turnover_signals_select_hr"
on public.hr_turnover_signals for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_turnover_signals.company_id
  )
);

notify pgrst, 'reload schema';
