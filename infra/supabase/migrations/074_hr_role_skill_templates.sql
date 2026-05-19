-- Template competenze per ruolo catalogo (roles.name / role_id).
-- Usato da rigenerazione hr_role_skill_requirements + backfill hr_user_skills.

create table if not exists public.hr_role_skill_templates (
  id uuid primary key default gen_random_uuid(),
  company_id text null,
  match_kind text not null check (match_kind in ('role_id', 'role_name_exact', 'role_name_contains')),
  match_value text not null,
  skill_code text not null,
  min_level integer not null default 3 check (min_level >= 1 and min_level <= 5),
  default_user_level integer null check (default_user_level is null or (default_user_level >= 1 and default_user_level <= 5)),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_hr_role_skill_templates_global
  on public.hr_role_skill_templates (match_kind, match_value, skill_code)
  where company_id is null;

create unique index if not exists uq_hr_role_skill_templates_tenant
  on public.hr_role_skill_templates (company_id, match_kind, match_value, skill_code)
  where company_id is not null;

create index if not exists idx_hr_role_skill_templates_company on public.hr_role_skill_templates (company_id);
create index if not exists idx_hr_role_skill_templates_match on public.hr_role_skill_templates (match_kind, match_value);

comment on table public.hr_role_skill_templates is
  'Profilo competenze per ruolo: match su role_id o roles.name (job title catalogo). company_id null = template globale.';

-- Snapshot opzionale prima di replace fabbisogni (flag backup=true in rigenerazione).
create table if not exists public.hr_skills_regeneration_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  created_by text null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_skills_regen_snap_company on public.hr_skills_regeneration_snapshots (company_id, created_at desc);

comment on table public.hr_skills_regeneration_snapshots is
  'Backup JSON di hr_role_skill_requirements (e opz. user skills) prima di replace in rigenerazione.';

alter table public.hr_role_skill_templates enable row level security;
alter table public.hr_skills_regeneration_snapshots enable row level security;

drop policy if exists "nexa_hr_role_skill_templates_admin_all" on public.hr_role_skill_templates;
create policy "nexa_hr_role_skill_templates_admin_all"
on public.hr_role_skill_templates for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and (public.hr_role_skill_templates.company_id is null or me."companyId" = public.hr_role_skill_templates.company_id)
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and (public.hr_role_skill_templates.company_id is null or me."companyId" = public.hr_role_skill_templates.company_id)
  )
);

drop policy if exists "nexa_hr_skills_regen_snap_admin_all" on public.hr_skills_regeneration_snapshots;
create policy "nexa_hr_skills_regen_snap_admin_all"
on public.hr_skills_regeneration_snapshots for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_skills_regeneration_snapshots.company_id
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_skills_regeneration_snapshots.company_id
  )
);

-- Catalogo skill standard (allineato a 058) — idempotente per tenant con utenti.
insert into public.hr_skills (company_id, code, name, description)
select c.cid, v.code, v.name, v.description
from (select distinct trim("companyId") as cid from public.users where coalesce(trim("companyId"), '') <> '') c
cross join (
  values
    ('skill.typescript', 'TypeScript / React', 'Sviluppo UI, design system, accessibilità'),
    ('skill.golang', 'Go — servizi backend', 'API, resilienza, osservabilità'),
    ('skill.sql', 'SQL / Postgres', 'Query, indici, dati HR aggregati'),
    ('skill.people_mgmt', 'People management', 'Feedback, obiettivi, clima di team'),
    ('skill.payroll_it', 'Payroll Italia', 'Cedolini, trattenute, CCNL di riferimento'),
    ('skill.communication', 'Comunicazione interna', 'Allineamento stakeholder, scrittura chiara'),
    ('skill.data_privacy', 'Privacy dati HR', 'Minimizzazione, accessi, audit'),
    ('skill.recruiting', 'Recruiting operativo', 'Sourcing, colloqui strutturati, employer branding')
) as v(code, name, description)
on conflict (company_id, code) do nothing;

-- Template globali (company_id null): match su substring del job title (roles.name).
insert into public.hr_role_skill_templates (company_id, match_kind, match_value, skill_code, min_level, default_user_level, sort_order)
values
  (null, 'role_name_contains', 'HR', 'skill.people_mgmt', 4, 3, 10),
  (null, 'role_name_contains', 'HR', 'skill.data_privacy', 4, 3, 11),
  (null, 'role_name_contains', 'HR', 'skill.communication', 3, 3, 12),
  (null, 'role_name_contains', 'People', 'skill.people_mgmt', 4, 3, 20),
  (null, 'role_name_contains', 'People', 'skill.communication', 3, 3, 21),
  (null, 'role_name_contains', 'Talent', 'skill.recruiting', 4, 3, 30),
  (null, 'role_name_contains', 'Talent', 'skill.communication', 3, 3, 31),
  (null, 'role_name_contains', 'Recruit', 'skill.recruiting', 4, 3, 32),
  (null, 'role_name_contains', 'Payroll', 'skill.payroll_it', 4, 3, 40),
  (null, 'role_name_contains', 'Payroll', 'skill.sql', 3, 2, 41),
  (null, 'role_name_contains', 'Compensation', 'skill.payroll_it', 3, 2, 42),
  (null, 'role_name_contains', 'Learning', 'skill.people_mgmt', 3, 3, 50),
  (null, 'role_name_contains', 'Analytics', 'skill.sql', 4, 3, 60),
  (null, 'role_name_contains', 'Analytics', 'skill.data_privacy', 3, 2, 61),
  (null, 'role_name_contains', 'Engineer', 'skill.typescript', 4, 3, 70),
  (null, 'role_name_contains', 'Engineer', 'skill.golang', 3, 2, 71),
  (null, 'role_name_contains', 'Engineer', 'skill.sql', 3, 2, 72),
  (null, 'role_name_contains', 'DevOps', 'skill.golang', 4, 3, 80),
  (null, 'role_name_contains', 'DevOps', 'skill.sql', 3, 2, 81),
  (null, 'role_name_contains', 'Backend', 'skill.golang', 4, 3, 90),
  (null, 'role_name_contains', 'Backend', 'skill.sql', 4, 3, 91),
  (null, 'role_name_contains', 'Frontend', 'skill.typescript', 4, 3, 100),
  (null, 'role_name_contains', 'QA', 'skill.typescript', 3, 2, 110),
  (null, 'role_name_contains', 'Product', 'skill.communication', 4, 3, 120),
  (null, 'role_name_contains', 'Product', 'skill.typescript', 2, 1, 121),
  (null, 'role_name_contains', 'UX', 'skill.communication', 4, 3, 130),
  (null, 'role_name_contains', 'Project Manager', 'skill.communication', 4, 3, 140),
  (null, 'role_name_contains', 'Finance', 'skill.sql', 3, 2, 150),
  (null, 'role_name_contains', 'Finance', 'skill.data_privacy', 3, 2, 151),
  (null, 'role_name_contains', 'Controller', 'skill.sql', 4, 3, 152),
  (null, 'role_name_contains', 'Marketing', 'skill.communication', 4, 3, 160),
  (null, 'role_name_contains', 'Account', 'skill.communication', 4, 3, 170),
  (null, 'role_name_contains', 'IT Support', 'skill.communication', 3, 2, 180),
  (null, 'role_name_contains', 'Manager', 'skill.people_mgmt', 4, 3, 190),
  (null, 'role_name_contains', 'Manager', 'skill.communication', 4, 3, 191),
  (null, 'role_name_contains', 'Lead', 'skill.people_mgmt', 4, 3, 200),
  (null, 'role_name_contains', 'Lead', 'skill.communication', 4, 3, 201),
  (null, 'role_name_exact', 'employee', 'skill.communication', 2, 2, 300),
  (null, 'role_name_exact', 'team_lead', 'skill.people_mgmt', 3, 3, 310),
  (null, 'role_name_exact', 'team_lead', 'skill.communication', 3, 3, 311)
on conflict (match_kind, match_value, skill_code) where company_id is null do update set
  min_level = excluded.min_level,
  default_user_level = excluded.default_user_level,
  sort_order = excluded.sort_order;

-- Profili espliciti per ruoli catalogo demo (013).
insert into public.hr_role_skill_templates (company_id, match_kind, match_value, skill_code, min_level, default_user_level, sort_order)
values
  (null, 'role_id', 'nexa-r-01', 'skill.people_mgmt', 5, 4, 1),
  (null, 'role_id', 'nexa-r-01', 'skill.data_privacy', 4, 3, 2),
  (null, 'role_id', 'nexa-r-02', 'skill.people_mgmt', 4, 3, 1),
  (null, 'role_id', 'nexa-r-02', 'skill.communication', 4, 3, 2),
  (null, 'role_id', 'nexa-r-03', 'skill.recruiting', 4, 3, 1),
  (null, 'role_id', 'nexa-r-04', 'skill.payroll_it', 4, 3, 1),
  (null, 'role_id', 'nexa-r-04', 'skill.sql', 3, 2, 2),
  (null, 'role_id', 'nexa-r-05', 'skill.people_mgmt', 3, 3, 1),
  (null, 'role_id', 'nexa-r-06', 'skill.sql', 4, 3, 1),
  (null, 'role_id', 'nexa-r-06', 'skill.data_privacy', 4, 3, 2),
  (null, 'role_id', 'nexa-r-09', 'skill.people_mgmt', 4, 3, 1),
  (null, 'role_id', 'nexa-r-09', 'skill.typescript', 3, 2, 2),
  (null, 'role_id', 'nexa-r-10', 'skill.golang', 4, 3, 1),
  (null, 'role_id', 'nexa-r-10', 'skill.sql', 4, 3, 2),
  (null, 'role_id', 'nexa-r-11', 'skill.typescript', 4, 3, 1),
  (null, 'role_id', 'nexa-r-12', 'skill.golang', 4, 3, 1),
  (null, 'role_id', 'nexa-r-13', 'skill.typescript', 3, 2, 1),
  (null, 'role_id', 'nexa-r-14', 'skill.communication', 4, 3, 1),
  (null, 'role_id', 'nexa-r-17', 'skill.sql', 4, 3, 1)
on conflict (match_kind, match_value, skill_code) where company_id is null do update set
  min_level = excluded.min_level,
  default_user_level = excluded.default_user_level,
  sort_order = excluded.sort_order;

notify pgrst, 'reload schema';
