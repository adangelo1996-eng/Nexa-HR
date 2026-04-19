-- HR skills / alerts / HITL: policy FOR ALL unificate (stesso nome migrazione remota MCP).
-- DDL idempotente.

-- ---------------------------------------------------------------------------
-- 5) HR skills / alerts / HITL: una sola policy FOR ALL (rimuove SELECT duplicato).
-- ---------------------------------------------------------------------------
drop policy if exists "nexa_hr_skills_select_admin" on public.hr_skills;
drop policy if exists "nexa_hr_skills_write_admin" on public.hr_skills;
create policy "nexa_hr_skills_admin_all"
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
drop policy if exists "nexa_hr_user_skills_write_admin" on public.hr_user_skills;
create policy "nexa_hr_user_skills_admin_all"
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
drop policy if exists "nexa_hr_role_skill_req_write_admin" on public.hr_role_skill_requirements;
create policy "nexa_hr_role_skill_req_admin_all"
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
drop policy if exists "nexa_hr_position_skill_demand_write_admin" on public.hr_position_skill_demand;
create policy "nexa_hr_position_skill_demand_admin_all"
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

drop policy if exists "nexa_hr_alerts_select_admin" on public.hr_alerts;
drop policy if exists "nexa_hr_alerts_write_admin" on public.hr_alerts;
create policy "nexa_hr_alerts_admin_all"
on public.hr_alerts for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me.role in ('superuser', 'admin')
      and me."companyId" = public.hr_alerts.company_id
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me.role in ('superuser', 'admin')
      and me."companyId" = public.hr_alerts.company_id
  )
);

drop policy if exists "nexa_hr_hitl_select_admin" on public.hr_hitl_proposals;
drop policy if exists "nexa_hr_hitl_write_admin" on public.hr_hitl_proposals;
create policy "nexa_hr_hitl_admin_all"
on public.hr_hitl_proposals for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me.role in ('superuser', 'admin')
      and me."companyId" = public.hr_hitl_proposals.company_id
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me.role in ('superuser', 'admin')
      and me."companyId" = public.hr_hitl_proposals.company_id
  )
);

-- ---------------------------------------------------------------------------
-- 6) Funzioni: search_path fisso (WARN function_search_path_mutable).
-- ---------------------------------------------------------------------------
alter function public.recruit_next_job_code_number(text, int) set search_path = public, pg_temp;
alter function public.set_updated_at_timestamp() set search_path = public, pg_temp;
