-- Ripristino idempotente per ambienti in cui 012/027 non risultano applicate
-- (es. storico migration disallineato). Ricrea le tabelle budget personale se mancanti
-- e notifica PostgREST per aggiornare lo schema cache (errore PGRST204).

-- === Da 012_personnel_budget.sql ===

create table if not exists personnel_budget_cost_center_order (
  year integer not null check (year >= 2020 and year <= 2100),
  cost_center_id text not null references cost_centers (id) on delete cascade,
  sort_order integer not null,
  primary key (year, cost_center_id)
);

create index if not exists idx_pb_cc_order_year_sort on personnel_budget_cost_center_order (year, sort_order);

create table if not exists personnel_budget_cells (
  year integer not null check (year >= 2020 and year <= 2100),
  month smallint not null check (month >= 1 and month <= 12),
  user_id text not null references users (id) on delete cascade,
  budget_ral numeric,
  budget_overtime numeric,
  budget_travel numeric,
  budget_social_inps numeric,
  budget_social_inail numeric,
  budget_tfr numeric,
  updated_at timestamptz not null default now(),
  primary key (year, month, user_id)
);

create index if not exists idx_pb_cells_user on personnel_budget_cells (user_id);
create index if not exists idx_pb_cells_period on personnel_budget_cells (year, month);

comment on table personnel_budget_cost_center_order is 'Ordinamento centri di costo per anno nella vista budget (HR).';
comment on table personnel_budget_cells is 'Valori budget pianificati (CHF); consuntivo da API, non persistito qui.';

-- === Da 027_personnel_budget_year_forecast_analysis.sql ===

create table if not exists personnel_budget_year_status (
  company_id text not null,
  year integer not null check (year >= 2020 and year <= 2100),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_at timestamptz,
  approved_by_user_id text references users (id) on delete set null,
  primary key (company_id, year)
);

comment on table personnel_budget_year_status is 'Budget annuo: draft fino ad approvazione; celle budget bloccate se approved.';

create table if not exists personnel_budget_forecast_cells (
  year integer not null check (year >= 2020 and year <= 2100),
  month smallint not null check (month >= 1 and month <= 12),
  user_id text not null references users (id) on delete cascade,
  forecast_ral numeric,
  forecast_overtime numeric,
  forecast_travel numeric,
  forecast_social_inps numeric,
  forecast_social_inail numeric,
  forecast_tfr numeric,
  updated_at timestamptz not null default now(),
  primary key (year, month, user_id)
);

create index if not exists idx_pb_forecast_period on personnel_budget_forecast_cells (year, month);

comment on table personnel_budget_forecast_cells is 'Forecast mensile separato dal budget approvato.';

create table if not exists personnel_budget_analysis_notes (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  year integer not null check (year >= 2020 and year <= 2100),
  month integer not null check (month >= 1 and month <= 12),
  category text not null,
  subject_user_id text not null default '',
  comment text not null default '',
  author_id text not null references users (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_pb_analysis_note_unique
  on personnel_budget_analysis_notes (company_id, year, month, category, subject_user_id);

comment on table personnel_budget_analysis_notes is 'Commenti su varianze budget/forecast/actual; subject_user_id vuoto = nota aggregata per categoria.';

-- Aggiorna cache API (Supabase / PostgREST)
notify pgrst, 'reload schema';
