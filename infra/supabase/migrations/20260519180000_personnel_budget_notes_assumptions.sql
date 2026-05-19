-- Note celle budget personale + assunzioni aliquote per anno.

create table if not exists public.personnel_budget_assumptions (
  company_id text not null,
  year integer not null check (year >= 2020 and year <= 2100),
  employer_inps_percent numeric,
  inail_permille numeric,
  tfr_divisor numeric,
  welfare_percent numeric not null default 0,
  bonus_provision_percent numeric not null default 0,
  updated_at timestamptz not null default now(),
  updated_by_user_id text,
  primary key (company_id, year)
);

comment on table public.personnel_budget_assumptions is
  'Aliquote e accantonamenti per calcolo budget/forecast personale (per azienda e anno).';

create table if not exists public.personnel_budget_cell_notes (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  year integer not null check (year >= 2020 and year <= 2100),
  month smallint check (month is null or (month >= 1 and month <= 12)),
  user_id text,
  planned_line_id uuid,
  field_key text not null,
  note text not null default '',
  author_user_id text,
  author_name text,
  updated_at timestamptz not null default now(),
  constraint personnel_budget_cell_notes_subject_chk check (
    user_id is not null or planned_line_id is not null
  )
);

comment on table public.personnel_budget_cell_notes is
  'Note su celle budget/forecast/consuntivo (dipendente o riga pianificata extra).';

create unique index if not exists uq_personnel_budget_cell_notes_key
  on public.personnel_budget_cell_notes (
    company_id,
    year,
    coalesce(month, 0),
    field_key,
    coalesce(user_id, ''),
    coalesce(planned_line_id::text, '')
  );

create index if not exists idx_personnel_budget_cell_notes_lookup
  on public.personnel_budget_cell_notes (company_id, year, month);

alter table public.personnel_budget_assumptions enable row level security;
alter table public.personnel_budget_cell_notes enable row level security;

do $block$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'personnel_budget_assumptions'
  ) then
    execute 'drop policy if exists nexa_no_postgrest_anon_personnel_budget_assumptions on public.personnel_budget_assumptions';
    execute $p$
      create policy nexa_no_postgrest_anon_personnel_budget_assumptions
      on public.personnel_budget_assumptions
      for all to anon using (false) with check (false)
    $p$;
    execute 'drop policy if exists nexa_no_postgrest_authenticated_personnel_budget_assumptions on public.personnel_budget_assumptions';
    execute $p$
      create policy nexa_no_postgrest_authenticated_personnel_budget_assumptions
      on public.personnel_budget_assumptions
      for all to authenticated using (false) with check (false)
    $p$;
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'personnel_budget_cell_notes'
  ) then
    execute 'drop policy if exists nexa_no_postgrest_anon_personnel_budget_cell_notes on public.personnel_budget_cell_notes';
    execute $p$
      create policy nexa_no_postgrest_anon_personnel_budget_cell_notes
      on public.personnel_budget_cell_notes
      for all to anon using (false) with check (false)
    $p$;
    execute 'drop policy if exists nexa_no_postgrest_authenticated_personnel_budget_cell_notes on public.personnel_budget_cell_notes';
    execute $p$
      create policy nexa_no_postgrest_authenticated_personnel_budget_cell_notes
      on public.personnel_budget_cell_notes
      for all to authenticated using (false) with check (false)
    $p$;
  end if;
end
$block$;

notify pgrst, 'reload schema';
