-- Estensione btree_gist fuori da public + indici FK (stesso nome migrazione remota MCP).
-- DDL idempotente.

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
