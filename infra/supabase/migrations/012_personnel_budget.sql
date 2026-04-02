-- Budget personale: ordine reparti (drag-and-drop) e celle editabili per dipendente/mese/anno.
-- Consuntivo calcolato lato API da cedolini, straordinari, spese (nessun valore mock in DB).

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
