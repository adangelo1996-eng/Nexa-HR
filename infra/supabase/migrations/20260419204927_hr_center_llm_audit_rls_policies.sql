-- Tabella solo lato backend (service_role bypassa RLS). Esplicita "nessun accesso client" per PostgREST e chiude l'advisor rls_enabled_no_policy.
drop policy if exists "hr_center_llm_audit_deny_anon" on public.hr_center_llm_audit;
create policy "hr_center_llm_audit_deny_anon"
  on public.hr_center_llm_audit
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists "hr_center_llm_audit_deny_authenticated" on public.hr_center_llm_audit;
create policy "hr_center_llm_audit_deny_authenticated"
  on public.hr_center_llm_audit
  for all
  to authenticated
  using (false)
  with check (false);
