-- Sicurezza + performance (advisor Supabase): policy RLS su tabelle control-only,
-- consolidamento policy HR duplicate, search_path su funzioni, estensione fuori da public,
-- indici su FK segnalati come ad alta priorità.
--
-- Auth (dashboard Supabase, non SQL): abilitare "Leaked password protection" (HaveIBeenPwned)
-- per ridurre il WARN auth_leaked_password_protection.
--
-- DDL idempotente (drop/create if exists). Su progetti già aggiornati via MCP in sessione di
-- deploy, `supabase db push` può registrare comunque questo file come nuova versione: sicuro.

-- ---------------------------------------------------------------------------
-- 1) Tabelle backend-only / control plane: nessun accesso via PostgREST (anon/authenticated).
--    Il service_role del backend continua a bypassare RLS.
-- ---------------------------------------------------------------------------
do $block$
declare
  t text;
  tables text[] := array[
    'audit_log',
    'auth_refresh_tokens',
    'cash_collections',
    'companies',
    'company_packages',
    'health_checks',
    'health_events',
    'invoice_sequences',
    'invoices',
    'mrr_snapshots',
    'package_definitions',
    'payment_expectations',
    'recruit_job_code_seq',
    'synapse_profile',
    'tenant_error_events',
    'tenant_state_revisions'
  ];
begin
  foreach t in array tables
  loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format(
        'drop policy if exists %I on public.%I',
        'nexa_no_postgrest_anon_' || t,
        t
      );
      execute format(
        'create policy %I on public.%I for all to anon using (false) with check (false)',
        'nexa_no_postgrest_anon_' || t,
        t
      );
      execute format(
        'drop policy if exists %I on public.%I',
        'nexa_no_postgrest_authenticated_' || t,
        t
      );
      execute format(
        'create policy %I on public.%I for all to authenticated using (false) with check (false)',
        'nexa_no_postgrest_authenticated_' || t,
        t
      );
    end if;
  end loop;
end
$block$;

-- ---------------------------------------------------------------------------
-- 2) hr_standard_contract_versions: allineamento a contratti HR (admin/superuser).
-- ---------------------------------------------------------------------------
drop policy if exists "nexa_hr_std_contract_versions_select_hr" on public.hr_standard_contract_versions;
create policy "nexa_hr_std_contract_versions_select_hr"
on public.hr_standard_contract_versions for select to authenticated
using (
  exists (
    select 1 from public.hr_standard_contracts c
    inner join public.users me on me.email = (select auth.email())
    where c.id = public.hr_standard_contract_versions.contract_id
      and me.role in ('superuser', 'admin')
  )
);

drop policy if exists "nexa_hr_std_contract_versions_write_hr" on public.hr_standard_contract_versions;
create policy "nexa_hr_std_contract_versions_write_hr"
on public.hr_standard_contract_versions for all to authenticated
using (
  exists (
    select 1 from public.hr_standard_contracts c
    inner join public.users me on me.email = (select auth.email())
    where c.id = public.hr_standard_contract_versions.contract_id
      and me.role in ('superuser', 'admin')
  )
)
with check (
  exists (
    select 1 from public.hr_standard_contracts c
    inner join public.users me on me.email = (select auth.email())
    where c.id = public.hr_standard_contract_versions.contract_id
      and me.role in ('superuser', 'admin')
  )
);

-- ---------------------------------------------------------------------------
-- 3) hr_standard_contracts: auth.email() → (select auth.email()) (performance RLS).
-- ---------------------------------------------------------------------------
drop policy if exists "nexa_hr_std_contracts_select_hr" on public.hr_standard_contracts;
create policy "nexa_hr_std_contracts_select_hr"
on public.hr_standard_contracts for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me.role in ('superuser', 'admin')
  )
);

-- ---------------------------------------------------------------------------
-- 4) users / approvals / smartworking: initplan RLS (select auth.*).
-- ---------------------------------------------------------------------------
drop policy if exists "nexa_users_select_own" on public.users;
create policy "nexa_users_select_own"
on public.users for select to authenticated
using (id = (select auth.uid())::text);

drop policy if exists "nexa_approvals_select_visible" on public.approvals;
create policy "nexa_approvals_select_visible"
on public.approvals for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and (
        me.role in ('superuser', 'admin')
        or public.approvals."requestedBy" = me.id
        or exists (
          select 1 from public.users sub
          where sub.id = public.approvals."requestedBy" and sub."managerId" = me.id
        )
      )
  )
);

drop policy if exists "nexa_smartworking_select_visible" on public.smartworking_requests;
create policy "nexa_smartworking_select_visible"
on public.smartworking_requests for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and (
        me.role in ('superuser', 'admin')
        or public.smartworking_requests."userId" = me.id
        or public.smartworking_requests."approverId" = me.id
        or exists (
          select 1 from public.users sub
          where sub.id = public.smartworking_requests."userId" and sub."managerId" = me.id
        )
      )
  )
);

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

-- ---------------------------------------------------------------------------
-- 7) Estensione btree_gist fuori da public (WARN extension_in_public).
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
do $ext$
begin
  if exists (select 1 from pg_extension where extname = 'btree_gist') then
    execute 'alter extension btree_gist set schema extensions';
  end if;
end
$ext$;

-- ---------------------------------------------------------------------------
-- 8) Indici su FK segnalati (INFO unindexed_foreign_keys) — subset ad alto impatto.
-- ---------------------------------------------------------------------------
create index if not exists idx_delegations_managerid_fk on public.delegations ("managerId");
create index if not exists idx_delegations_delegatemanagerid_fk on public.delegations ("delegateManagerId");

create index if not exists idx_expense_claims_hrapprovedby_fk on public.expense_claims ("hrApprovedBy");
create index if not exists idx_expense_claims_managerapprovedby_fk on public.expense_claims ("managerApprovedBy");

create index if not exists idx_hr_user_skills_skill_id_fk on public.hr_user_skills (skill_id);
create index if not exists idx_hr_role_skill_req_skill_id_fk on public.hr_role_skill_requirements (skill_id);
create index if not exists idx_hr_position_skill_demand_skill_id_fk on public.hr_position_skill_demand (skill_id);

create index if not exists idx_hr_hitl_actor_user_fk on public.hr_hitl_proposals (actor_user_id);
create index if not exists idx_hr_hitl_decided_by_user_fk on public.hr_hitl_proposals (decided_by_user_id);
create index if not exists idx_hr_alerts_ack_user_fk on public.hr_alerts (acknowledged_by_user_id);

create index if not exists idx_corporate_policy_docs_created_by_fk
  on public.corporate_policy_documents (created_by_user_id);

create index if not exists idx_hr_std_contract_versions_created_by_fk
  on public.hr_standard_contract_versions (created_by_user_id);

create index if not exists idx_hr_std_contracts_created_by_fk on public.hr_standard_contracts (created_by_user_id);
create index if not exists idx_hr_std_contracts_signed_by_fk on public.hr_standard_contracts (signed_by_user_id);
create index if not exists idx_hr_std_contracts_last_export_doc_fk
  on public.hr_standard_contracts (last_exported_document_id);

create index if not exists idx_hr_turnover_signals_user_fk on public.hr_turnover_signals (user_id);

notify pgrst, 'reload schema';
