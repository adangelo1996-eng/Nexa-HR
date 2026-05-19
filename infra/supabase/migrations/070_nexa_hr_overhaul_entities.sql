-- Nexa HR overhaul: onboarded candidati, preset turni, scenari workforce, gap ruoli, preset contratti

alter table public.recruit_candidates
  add column if not exists onboarded_at timestamptz;

comment on column public.recruit_candidates.onboarded_at is
  'Quando valorizzato il candidato non compare più in onboarding attivo (assunzione completata).';

create index if not exists idx_recruit_candidates_onboarded
  on public.recruit_candidates (company_id, onboarded_at)
  where onboarded_at is not null;

create table if not exists public.hr_shift_presets (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  name text not null,
  start_time time not null,
  end_time time not null,
  break_minutes smallint not null default 0 check (break_minutes >= 0 and break_minutes <= 480),
  is_default boolean not null default false,
  work_team_id text references work_teams (id) on delete cascade,
  user_id text references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (work_team_id is not null or user_id is not null or is_default = true)
);

comment on table public.hr_shift_presets is 'Preset turno riutilizzabili per dipendente, team o default azienda.';

create index if not exists idx_hr_shift_presets_company on public.hr_shift_presets (company_id);

create table if not exists public.workforce_planning_scenarios (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  name text not null,
  assumptions_json jsonb not null default '{}'::jsonb,
  payload_json jsonb not null default '{}'::jsonb,
  analysis_text text,
  created_by_user_id text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workforce_planning_scenarios is 'Scenari workforce salvati con assunzioni ed export.';

create index if not exists idx_workforce_scenarios_company on public.workforce_planning_scenarios (company_id, updated_at desc);

create table if not exists public.hr_role_coverage_gaps (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  role_title text not null,
  headcount_gap integer not null default 0 check (headcount_gap >= 0),
  expected_ral_annual numeric,
  notes text,
  updated_by_user_id text references users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, role_title)
);

comment on table public.hr_role_coverage_gaps is 'Persone mancanti per ruolo e RAL attesa (alimenta budget/forecast).';

create table if not exists public.hr_contract_presets (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  template_key text not null,
  label text not null,
  description text,
  default_party_json jsonb not null default '{}'::jsonb,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, template_key)
);

comment on table public.hr_contract_presets is 'Preset rapidi per nuovo contratto standard (non apre form a pageload).';

insert into public.hr_contract_presets (company_id, template_key, label, description, sort_order)
values
  ('comp-1', 'indeterminato', 'Tempo indeterminato', 'Contratto a tempo indeterminato full-time.', 10),
  ('comp-1', 'determinato', 'Tempo determinato', 'Con data fine e causale.', 20),
  ('comp-1', 'part_time', 'Part-time', 'Orario ridotto settimanale.', 30),
  ('comp-1', 'apprendistato', 'Apprendistato', 'Rapporto di apprendistato.', 40)
on conflict (company_id, template_key) do nothing;

alter table public.hr_shift_presets enable row level security;
alter table public.workforce_planning_scenarios enable row level security;
alter table public.hr_role_coverage_gaps enable row level security;
alter table public.hr_contract_presets enable row level security;
