-- Sicurezza + performance (advisor Supabase): policy RLS su tabelle control-only,
-- initplan RLS su users/approvals/smartworking_requests. (Stesso nome migrazione remota MCP.)
-- Vedi anche 060 / 061 per policy HR consolidate, funzioni, estensione, indici.

-- ---------------------------------------------------------------------------
-- 1) Tabelle backend-only / control plane: nessun accesso via PostgREST (anon/authenticated).
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
-- 4) users / approvals / remote working (tabella smartworking_requests): initplan RLS (select auth.*).
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
