-- Competenze HR, mapping persone/ruoli, fabbisogni da posizioni recruiting (gap report v1).

create table if not exists public.hr_skills (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  code text not null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

create index if not exists idx_hr_skills_company on public.hr_skills (company_id);

create table if not exists public.hr_user_skills (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  user_id text not null references public.users (id) on delete cascade,
  skill_id uuid not null references public.hr_skills (id) on delete cascade,
  level integer not null default 1 check (level >= 1 and level <= 5),
  updated_at timestamptz not null default now(),
  unique (user_id, skill_id)
);

create index if not exists idx_hr_user_skills_company on public.hr_user_skills (company_id);
create index if not exists idx_hr_user_skills_user on public.hr_user_skills (user_id);

create table if not exists public.hr_role_skill_requirements (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  role_id text not null references public.roles (id) on delete cascade,
  skill_id uuid not null references public.hr_skills (id) on delete cascade,
  min_level integer not null default 1 check (min_level >= 1 and min_level <= 5),
  created_at timestamptz not null default now(),
  unique (role_id, skill_id)
);

create index if not exists idx_hr_role_skill_req_company on public.hr_role_skill_requirements (company_id);

create table if not exists public.hr_position_skill_demand (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  position_id uuid not null references public.recruit_positions (id) on delete cascade,
  skill_id uuid not null references public.hr_skills (id) on delete cascade,
  min_level integer not null default 1 check (min_level >= 1 and min_level <= 5),
  created_at timestamptz not null default now(),
  unique (position_id, skill_id)
);

create index if not exists idx_hr_position_skill_demand_company on public.hr_position_skill_demand (company_id);

comment on table public.hr_skills is 'Taxonomia competenze per company (codice univoco per tenant).';
comment on table public.hr_user_skills is 'Livello competenza dichiarato/valutato per utente (1-5).';
comment on table public.hr_role_skill_requirements is 'Fabbisogno minimo per ruolo catalogo Nexa.';
comment on table public.hr_position_skill_demand is 'Fabbisogno competenze collegato a posizione recruiting.';

alter table public.hr_skills enable row level security;
alter table public.hr_user_skills enable row level security;
alter table public.hr_role_skill_requirements enable row level security;
alter table public.hr_position_skill_demand enable row level security;

drop policy if exists "nexa_hr_skills_select_admin" on public.hr_skills;
create policy "nexa_hr_skills_select_admin"
on public.hr_skills for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_skills.company_id
  )
);

drop policy if exists "nexa_hr_skills_write_admin" on public.hr_skills;
create policy "nexa_hr_skills_write_admin"
on public.hr_skills for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_skills.company_id
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_skills.company_id
  )
);

drop policy if exists "nexa_hr_user_skills_select_admin" on public.hr_user_skills;
create policy "nexa_hr_user_skills_select_admin"
on public.hr_user_skills for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_user_skills.company_id
  )
);

drop policy if exists "nexa_hr_user_skills_write_admin" on public.hr_user_skills;
create policy "nexa_hr_user_skills_write_admin"
on public.hr_user_skills for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_user_skills.company_id
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_user_skills.company_id
  )
);

drop policy if exists "nexa_hr_role_skill_req_select_admin" on public.hr_role_skill_requirements;
create policy "nexa_hr_role_skill_req_select_admin"
on public.hr_role_skill_requirements for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_role_skill_requirements.company_id
  )
);

drop policy if exists "nexa_hr_role_skill_req_write_admin" on public.hr_role_skill_requirements;
create policy "nexa_hr_role_skill_req_write_admin"
on public.hr_role_skill_requirements for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_role_skill_requirements.company_id
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_role_skill_requirements.company_id
  )
);

drop policy if exists "nexa_hr_position_skill_demand_select_admin" on public.hr_position_skill_demand;
create policy "nexa_hr_position_skill_demand_select_admin"
on public.hr_position_skill_demand for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_position_skill_demand.company_id
  )
);

drop policy if exists "nexa_hr_position_skill_demand_write_admin" on public.hr_position_skill_demand;
create policy "nexa_hr_position_skill_demand_write_admin"
on public.hr_position_skill_demand for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_position_skill_demand.company_id
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_position_skill_demand.company_id
  )
);

notify pgrst, 'reload schema';
