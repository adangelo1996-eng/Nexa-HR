-- Seed idempotente competenze / mapping utenti / fabbisogni ruolo per ogni tenant con utenti.
-- Non sovrascrive livelli esistenti (ON CONFLICT DO NOTHING).

insert into public.hr_skills (company_id, code, name, description)
select c.cid, v.code, v.name, v.desc
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
) as v(code, name, desc)
on conflict (company_id, code) do nothing;

insert into public.hr_user_skills (company_id, user_id, skill_id, level)
select u."companyId", u.id, s.id, 1 + (abs(hashtext(u.id || s.code)) % 5)
from public.users u
inner join public.hr_skills s on s.company_id = u."companyId"
where coalesce(trim(u."companyId"), '') <> ''
  and s.code in ('skill.typescript', 'skill.golang', 'skill.sql', 'skill.communication', 'skill.data_privacy')
on conflict (user_id, skill_id) do nothing;

insert into public.hr_role_skill_requirements (company_id, role_id, skill_id, min_level)
select distinct u."companyId", u."roleId", s.id, 3
from public.users u
inner join public.roles r on r.id = u."roleId"
inner join public.hr_skills s on s.company_id = u."companyId" and s.code in ('skill.people_mgmt', 'skill.payroll_it', 'skill.recruiting')
where coalesce(trim(u."companyId"), '') <> ''
  and coalesce(trim(u."roleId"), '') <> ''
on conflict (role_id, skill_id) do nothing;
