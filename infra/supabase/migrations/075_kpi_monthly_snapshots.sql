-- Snapshot mensili KPI analytics (per company, analisi, filtri opzionali CDC/team).

create table if not exists public.hr_kpi_monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  analysis_id text not null,
  kpi_key text not null,
  year_month text not null,
  value_numeric numeric null,
  value_text text not null default '',
  label_it text not null default '',
  chart_type text not null default 'line',
  cost_center_id text not null default '',
  team_id text not null default '',
  captured_at timestamptz not null default now(),
  constraint hr_kpi_monthly_snapshots_scope_unique
    unique nulls not distinct (company_id, analysis_id, kpi_key, year_month, cost_center_id, team_id)
);

create index if not exists idx_hr_kpi_monthly_snapshots_lookup
  on public.hr_kpi_monthly_snapshots (company_id, analysis_id, year_month desc);

create index if not exists idx_hr_kpi_monthly_snapshots_filters
  on public.hr_kpi_monthly_snapshots (company_id, analysis_id, cost_center_id, team_id, year_month desc);

comment on table public.hr_kpi_monthly_snapshots is
  'Serie storiche KPI analytics HR: valori per mese, analisi e filtri opzionali (CDC/team).';

alter table public.hr_kpi_monthly_snapshots enable row level security;

drop policy if exists "nexa_hr_kpi_monthly_snapshots_select_hr" on public.hr_kpi_monthly_snapshots;
create policy "nexa_hr_kpi_monthly_snapshots_select_hr"
on public.hr_kpi_monthly_snapshots for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_kpi_monthly_snapshots.company_id
  )
);

drop policy if exists "nexa_hr_kpi_monthly_snapshots_service_all" on public.hr_kpi_monthly_snapshots;
create policy "nexa_hr_kpi_monthly_snapshots_service_all"
on public.hr_kpi_monthly_snapshots for all to service_role
using (true)
with check (true);

notify pgrst, 'reload schema';
