-- Scenari simulatore assunzione (persistenza backend Nest).

create table if not exists public.hiring_simulation_scenarios (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  name text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_by_user_id text references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.hiring_simulation_scenarios is
  'Scenari salvati del simulatore assunzione (input + risultati di riferimento).';

create index if not exists idx_hiring_sim_scenarios_company
  on public.hiring_simulation_scenarios (company_id, updated_at desc);

alter table public.hiring_simulation_scenarios enable row level security;

do $block$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'hiring_simulation_scenarios'
  ) then
    execute 'drop policy if exists nexa_no_postgrest_anon_hiring_simulation_scenarios on public.hiring_simulation_scenarios';
    execute $p$
      create policy nexa_no_postgrest_anon_hiring_simulation_scenarios
      on public.hiring_simulation_scenarios
      for all to anon using (false) with check (false)
    $p$;
    execute 'drop policy if exists nexa_no_postgrest_authenticated_hiring_simulation_scenarios on public.hiring_simulation_scenarios';
    execute $p$
      create policy nexa_no_postgrest_authenticated_hiring_simulation_scenarios
      on public.hiring_simulation_scenarios
      for all to authenticated using (false) with check (false)
    $p$;
  end if;
end
$block$;

notify pgrst, 'reload schema';
