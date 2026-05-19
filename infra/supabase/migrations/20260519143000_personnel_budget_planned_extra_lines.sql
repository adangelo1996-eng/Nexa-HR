-- Righe pianificate extra per centro di costo (budget personale mensile).

create table if not exists public.personnel_budget_planned_extra_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  year integer not null check (year >= 2020 and year <= 2100),
  month smallint not null check (month >= 1 and month <= 12),
  cost_center_id text references public.cost_centers (id) on delete cascade,
  label text not null,
  budget_ral numeric not null default 0,
  budget_overtime numeric not null default 0,
  budget_travel numeric not null default 0,
  budget_inps numeric not null default 0,
  budget_inail numeric not null default 0,
  budget_tfr numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.personnel_budget_planned_extra_lines is
  'Voci budget pianificate aggiuntive per CDC/mese (non legate a dipendente).';

create index if not exists idx_pb_planned_extra_period
  on public.personnel_budget_planned_extra_lines (company_id, year, month, cost_center_id);

alter table public.personnel_budget_planned_extra_lines enable row level security;

do $block$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'personnel_budget_planned_extra_lines'
  ) then
    execute 'drop policy if exists nexa_no_postgrest_anon_personnel_budget_planned_extra_lines on public.personnel_budget_planned_extra_lines';
    execute $p$
      create policy nexa_no_postgrest_anon_personnel_budget_planned_extra_lines
      on public.personnel_budget_planned_extra_lines
      for all to anon using (false) with check (false)
    $p$;
    execute 'drop policy if exists nexa_no_postgrest_authenticated_personnel_budget_planned_extra_lines on public.personnel_budget_planned_extra_lines';
    execute $p$
      create policy nexa_no_postgrest_authenticated_personnel_budget_planned_extra_lines
      on public.personnel_budget_planned_extra_lines
      for all to authenticated using (false) with check (false)
    $p$;
  end if;
end
$block$;

notify pgrst, 'reload schema';
