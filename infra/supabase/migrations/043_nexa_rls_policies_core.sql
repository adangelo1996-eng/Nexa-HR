-- RLS: policy SELECT per tabelle Nexa con RLS attivo ma senza policy (linter Supabase).
-- Allinea anche policy esistenti a (select auth.*()) per evitare re-init per riga (auth_rls_initplan).
-- Il backend Nest continua a usare service_role (bypass RLS); queste policy riguardano client authenticated / Realtime.

-- ---------------------------------------------------------------------------
-- Policy esistenti: ricrea con subquery su auth.*
-- ---------------------------------------------------------------------------

drop policy if exists "nexa_user_notifications_select_own" on public.user_notifications;
create policy "nexa_user_notifications_select_own"
on public.user_notifications for select to authenticated
using (
  "userId" = (
    select u.id from public.users u
    where u.email = (select auth.email())
    limit 1
  )
);

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

drop policy if exists "nexa_travel_select_visible" on public.travel_requests;
create policy "nexa_travel_select_visible"
on public.travel_requests for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.travel_requests."userId" = me.id
      or public.travel_requests."approverId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.travel_requests."userId" and sub."managerId" = me.id
      )
    )
  )
);

-- Legacy dashboard Supabase: unifica con nexa_users_select_own (evita policy SELECT duplicate).
drop policy if exists "Users view own profile" on public.users;
drop policy if exists "Users update own profile" on public.users;

drop policy if exists "nexa_users_select_own" on public.users;
create policy "nexa_users_select_own"
on public.users for select to authenticated
using (id = (select auth.uid()::text));

-- Nessuna policy UPDATE su users: evita escalation di role/campi sensibili; le modifiche passano da API Nest (service_role).

-- Recruiting (040)
drop policy if exists "nexa_recruiting_select_visible_positions" on public.recruit_positions;
create policy "nexa_recruiting_select_visible_positions"
on public.recruit_positions for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

drop policy if exists "nexa_recruiting_select_visible_candidates" on public.recruit_candidates;
create policy "nexa_recruiting_select_visible_candidates"
on public.recruit_candidates for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

drop policy if exists "nexa_recruiting_select_visible_state" on public.recruit_candidate_stage_state;
create policy "nexa_recruiting_select_visible_state"
on public.recruit_candidate_stage_state for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or exists (
        select 1
        from public.recruit_stage_assignees a
        where a.stage_id = public.recruit_candidate_stage_state.current_stage_id
          and a.user_id = me.id
      )
    )
  )
);

drop policy if exists "nexa_recruiting_select_visible_interviews" on public.recruit_stage_interviews;
create policy "nexa_recruiting_select_visible_interviews"
on public.recruit_stage_interviews for select to authenticated
using (
  exists (
    select 1 from public.recruit_candidate_stage_state s
    where s.id = public.recruit_stage_interviews.candidate_stage_state_id
  )
);

drop policy if exists "nexa_recruiting_select_visible_reviews" on public.recruit_stage_reviews;
create policy "nexa_recruiting_select_visible_reviews"
on public.recruit_stage_reviews for select to authenticated
using (
  exists (
    select 1 from public.recruit_candidate_stage_state s
    where s.id = public.recruit_stage_reviews.candidate_stage_state_id
  )
);

drop policy if exists "nexa_recruiting_select_visible_pipeline" on public.recruit_pipelines;
create policy "nexa_recruiting_select_visible_pipeline"
on public.recruit_pipelines for select to authenticated
using (
  exists (
    select 1
    from public.recruit_positions p
    where p.id = public.recruit_pipelines.position_id
  )
);

drop policy if exists "nexa_recruiting_select_visible_stages" on public.recruit_pipeline_stages;
create policy "nexa_recruiting_select_visible_stages"
on public.recruit_pipeline_stages for select to authenticated
using (
  exists (
    select 1
    from public.recruit_pipelines pl
    where pl.id = public.recruit_pipeline_stages.pipeline_id
  )
);

drop policy if exists "nexa_recruiting_select_visible_stage_assignees" on public.recruit_stage_assignees;
create policy "nexa_recruiting_select_visible_stage_assignees"
on public.recruit_stage_assignees for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

drop policy if exists "nexa_recruiting_select_visible_candidate_documents" on public.recruit_candidate_documents;
create policy "nexa_recruiting_select_visible_candidate_documents"
on public.recruit_candidate_documents for select to authenticated
using (
  exists (
    select 1 from public.recruit_candidates c
    where c.id = public.recruit_candidate_documents.candidate_id
  )
);

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

drop policy if exists "nexa_tp_licenses_select_hr" on public.third_party_licenses;
create policy "nexa_tp_licenses_select_hr"
on public.third_party_licenses for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

drop policy if exists "nexa_tp_assign_select_hr" on public.user_third_party_license_assignments;
create policy "nexa_tp_assign_select_hr"
on public.user_third_party_license_assignments for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

-- ---------------------------------------------------------------------------
-- Visibilità standard: dipendente vede i propri dati; manager la catena; HR superuser/admin.
-- ---------------------------------------------------------------------------

alter table if exists public.time_entries enable row level security;
drop policy if exists "nexa_time_entries_select_visible" on public.time_entries;
create policy "nexa_time_entries_select_visible"
on public.time_entries for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.time_entries."userId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.time_entries."userId" and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.workday_summaries enable row level security;
drop policy if exists "nexa_workday_summaries_select_visible" on public.workday_summaries;
create policy "nexa_workday_summaries_select_visible"
on public.workday_summaries for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.workday_summaries."userId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.workday_summaries."userId" and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.leave_plans enable row level security;
drop policy if exists "nexa_leave_plans_select_visible" on public.leave_plans;
create policy "nexa_leave_plans_select_visible"
on public.leave_plans for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.leave_plans."userId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.leave_plans."userId" and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.sickness_events enable row level security;
drop policy if exists "nexa_sickness_events_select_visible" on public.sickness_events;
create policy "nexa_sickness_events_select_visible"
on public.sickness_events for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.sickness_events."userId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.sickness_events."userId" and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.leave_balances enable row level security;
drop policy if exists "nexa_leave_balances_select_visible" on public.leave_balances;
create policy "nexa_leave_balances_select_visible"
on public.leave_balances for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.leave_balances."userId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.leave_balances."userId" and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.payslips enable row level security;
drop policy if exists "nexa_payslips_select_visible" on public.payslips;
create policy "nexa_payslips_select_visible"
on public.payslips for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.payslips."userId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.payslips."userId" and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.payslip_reads enable row level security;
drop policy if exists "nexa_payslip_reads_select_visible" on public.payslip_reads;
create policy "nexa_payslip_reads_select_visible"
on public.payslip_reads for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.payslip_reads."userId" = me.id
    )
  )
);

alter table if exists public.delegations enable row level security;
drop policy if exists "nexa_delegations_select_visible" on public.delegations;
create policy "nexa_delegations_select_visible"
on public.delegations for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.delegations."managerId" = me.id
      or public.delegations."delegateManagerId" = me.id
    )
  )
);

alter table if exists public.expense_claims enable row level security;
drop policy if exists "nexa_expense_claims_select_visible" on public.expense_claims;
create policy "nexa_expense_claims_select_visible"
on public.expense_claims for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.expense_claims."userId" = me.id
      or public.expense_claims."managerApprovedBy" = me.id
      or public.expense_claims."hrApprovedBy" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.expense_claims."userId" and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.shifts enable row level security;
drop policy if exists "nexa_shifts_select_visible" on public.shifts;
create policy "nexa_shifts_select_visible"
on public.shifts for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.shifts."userId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.shifts."userId" and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.employee_documents enable row level security;
drop policy if exists "nexa_employee_documents_select_visible" on public.employee_documents;
create policy "nexa_employee_documents_select_visible"
on public.employee_documents for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.employee_documents."userId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.employee_documents."userId" and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.lifecycle_onboarding enable row level security;
drop policy if exists "nexa_lifecycle_onboarding_select_visible" on public.lifecycle_onboarding;
create policy "nexa_lifecycle_onboarding_select_visible"
on public.lifecycle_onboarding for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.lifecycle_onboarding."userId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.lifecycle_onboarding."userId" and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.innovation_jobs enable row level security;
drop policy if exists "nexa_innovation_jobs_select_visible" on public.innovation_jobs;
create policy "nexa_innovation_jobs_select_visible"
on public.innovation_jobs for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.innovation_jobs."userId" = me.id
    )
  )
);

alter table if exists public.payroll_annual_state enable row level security;
drop policy if exists "nexa_payroll_annual_state_select_visible" on public.payroll_annual_state;
create policy "nexa_payroll_annual_state_select_visible"
on public.payroll_annual_state for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.payroll_annual_state."userId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.payroll_annual_state."userId" and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.nfc_badge_tokens enable row level security;
drop policy if exists "nexa_nfc_badge_tokens_select_visible" on public.nfc_badge_tokens;
create policy "nexa_nfc_badge_tokens_select_visible"
on public.nfc_badge_tokens for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.nfc_badge_tokens."userId" = me.id
    )
  )
);

-- Calendario festività: stessa azienda dell'utente.
alter table if exists public.company_holidays enable row level security;
drop policy if exists "nexa_company_holidays_select_authenticated" on public.company_holidays;
create policy "nexa_company_holidays_select_authenticated"
on public.company_holidays for select to authenticated
using (
  exists (
    select 1
    from public.users me
    where me.email = (select auth.email())
    and me."companyId" = public.company_holidays."companyId"
  )
);

-- Catalogo ruoli applicativi (nessun company id sulla tabella): lettura per autenticati.
alter table if exists public.roles enable row level security;
drop policy if exists "nexa_roles_select_authenticated" on public.roles;
create policy "nexa_roles_select_authenticated"
on public.roles for select to authenticated
using (true);

-- Centri di costo: stessa azienda o HR.
alter table if exists public.cost_centers enable row level security;
drop policy if exists "nexa_cost_centers_select_visible" on public.cost_centers;
create policy "nexa_cost_centers_select_visible"
on public.cost_centers for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or me."costCenterId" = public.cost_centers.id
      or (
        me."companyId" is not null
        and public.cost_centers."companyId" is not null
        and me."companyId" = public.cost_centers."companyId"
      )
    )
  )
);

-- Team: HR, lead del team, o membri con teamId coincidente.
alter table if exists public.work_teams enable row level security;
drop policy if exists "nexa_work_teams_select_visible" on public.work_teams;
create policy "nexa_work_teams_select_visible"
on public.work_teams for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.work_teams."leadUserId" = me.id
      or me."teamId" = public.work_teams.id
    )
  )
);

-- Impostazioni azienda: solo HR (letture dirette PostgREST).
alter table if exists public.company_settings enable row level security;
drop policy if exists "nexa_company_settings_select_hr" on public.company_settings;
create policy "nexa_company_settings_select_hr"
on public.company_settings for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

-- Budget personale
alter table if exists public.personnel_budget_cells enable row level security;
drop policy if exists "nexa_pb_cells_select_visible" on public.personnel_budget_cells;
create policy "nexa_pb_cells_select_visible"
on public.personnel_budget_cells for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.personnel_budget_cells.user_id = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.personnel_budget_cells.user_id and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.personnel_budget_cost_center_order enable row level security;
drop policy if exists "nexa_pb_cc_order_select_hr" on public.personnel_budget_cost_center_order;
create policy "nexa_pb_cc_order_select_hr"
on public.personnel_budget_cost_center_order for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

alter table if exists public.personnel_budget_year_status enable row level security;
drop policy if exists "nexa_pb_year_status_select_hr" on public.personnel_budget_year_status;
create policy "nexa_pb_year_status_select_hr"
on public.personnel_budget_year_status for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

alter table if exists public.personnel_budget_forecast_cells enable row level security;
drop policy if exists "nexa_pb_forecast_select_visible" on public.personnel_budget_forecast_cells;
create policy "nexa_pb_forecast_select_visible"
on public.personnel_budget_forecast_cells for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.personnel_budget_forecast_cells.user_id = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.personnel_budget_forecast_cells.user_id and sub."managerId" = me.id
      )
    )
  )
);

alter table if exists public.personnel_budget_analysis_notes enable row level security;
drop policy if exists "nexa_pb_analysis_notes_select_hr" on public.personnel_budget_analysis_notes;
create policy "nexa_pb_analysis_notes_select_hr"
on public.personnel_budget_analysis_notes for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

-- Hub / integrazioni / audit: solo HR (evita esposizione via anon key autenticato senza ruolo).
alter table if exists public.nexa_import_events enable row level security;
drop policy if exists "nexa_import_events_select_hr" on public.nexa_import_events;
create policy "nexa_import_events_select_hr"
on public.nexa_import_events for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

alter table if exists public.integration_idempotency enable row level security;
drop policy if exists "nexa_integration_idempotency_select_hr" on public.integration_idempotency;
create policy "nexa_integration_idempotency_select_hr"
on public.integration_idempotency for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

alter table if exists public.integration_outbox enable row level security;
drop policy if exists "nexa_integration_outbox_select_hr" on public.integration_outbox;
create policy "nexa_integration_outbox_select_hr"
on public.integration_outbox for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

alter table if exists public.audit_logs enable row level security;
drop policy if exists "nexa_audit_logs_select_hr" on public.audit_logs;
create policy "nexa_audit_logs_select_hr"
on public.audit_logs for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

alter table if exists public.notifications enable row level security;
drop policy if exists "nexa_notifications_select_hr" on public.notifications;
create policy "nexa_notifications_select_hr"
on public.notifications for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

alter table if exists public.health_history enable row level security;
drop policy if exists "nexa_health_history_select_hr" on public.health_history;
create policy "nexa_health_history_select_hr"
on public.health_history for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

alter table if exists public.hub_sessions enable row level security;
drop policy if exists "nexa_hub_sessions_select_hr" on public.hub_sessions;
create policy "nexa_hub_sessions_select_hr"
on public.hub_sessions for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

alter table if exists public.user_mfa_secrets enable row level security;
drop policy if exists "nexa_user_mfa_secrets_select_hr" on public.user_mfa_secrets;
create policy "nexa_user_mfa_secrets_select_hr"
on public.user_mfa_secrets for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

alter table if exists public.suite_activity enable row level security;
drop policy if exists "nexa_suite_activity_select_hr" on public.suite_activity;
create policy "nexa_suite_activity_select_hr"
on public.suite_activity for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

alter table if exists public.usage_analytics enable row level security;
drop policy if exists "nexa_usage_analytics_select_hr" on public.usage_analytics;
create policy "nexa_usage_analytics_select_hr"
on public.usage_analytics for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

notify pgrst, 'reload schema';
