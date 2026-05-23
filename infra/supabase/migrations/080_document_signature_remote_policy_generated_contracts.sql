-- Document signature workflow, remote work policy (from contract), generated contracts tracking.

-- ---------------------------------------------------------------------------
-- RLS helpers: nexa.documents permissions (company-scoped tables below).
-- ---------------------------------------------------------------------------
create or replace function public.nexa_rls_me_has_documents_read()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users me
    left join public.roles r on r.id = me."roleId"
    where me.email = (select auth.email())
      and (
        me.role in ('superuser', 'admin')
        or coalesce(r.permissions, '[]'::jsonb) @> '["*"]'::jsonb
        or coalesce(r.permissions, '[]'::jsonb) @> '["nexa.documents:read"]'::jsonb
        or coalesce(r.permissions, '[]'::jsonb) @> '["nexa.documents:write"]'::jsonb
      )
  );
$$;

create or replace function public.nexa_rls_me_has_documents_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users me
    left join public.roles r on r.id = me."roleId"
    where me.email = (select auth.email())
      and (
        me.role in ('superuser', 'admin')
        or coalesce(r.permissions, '[]'::jsonb) @> '["*"]'::jsonb
        or coalesce(r.permissions, '[]'::jsonb) @> '["nexa.documents:write"]'::jsonb
      )
  );
$$;

comment on function public.nexa_rls_me_has_documents_read() is
  'RLS vault/documenti: nexa.documents:read|write, superuser/admin.';
comment on function public.nexa_rls_me_has_documents_write() is
  'RLS vault/documenti: nexa.documents:write, superuser/admin.';

create or replace function public.nexa_rls_me_has_standard_contracts_read()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users me
    left join public.roles r on r.id = me."roleId"
    where me.email = (select auth.email())
      and (
        me.role in ('superuser', 'admin')
        or coalesce(r.permissions, '[]'::jsonb) @> '["*"]'::jsonb
        or coalesce(r.permissions, '[]'::jsonb) @> '["nexa.standard_contracts:read"]'::jsonb
        or coalesce(r.permissions, '[]'::jsonb) @> '["nexa.standard_contracts:write"]'::jsonb
      )
  );
$$;

create or replace function public.nexa_rls_me_has_standard_contracts_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users me
    left join public.roles r on r.id = me."roleId"
    where me.email = (select auth.email())
      and (
        me.role in ('superuser', 'admin')
        or coalesce(r.permissions, '[]'::jsonb) @> '["*"]'::jsonb
        or coalesce(r.permissions, '[]'::jsonb) @> '["nexa.standard_contracts:write"]'::jsonb
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 1) Document signature workflow (vault → assignee → signed/returned)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_document_signature_requests (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  document_id text not null references public.employee_documents (id) on delete restrict,
  parent_document_id text null references public.employee_documents (id) on delete set null,
  requested_by text not null references public.users (id) on delete restrict,
  assignee_user_id text not null references public.users (id) on delete cascade,
  status text not null default 'pending_signature'
    check (status in ('pending_signature', 'signed', 'returned', 'cancelled')),
  message text null,
  signed_document_id text null references public.employee_documents (id) on delete set null,
  signed_at timestamptz null,
  returned_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_doc_sig_req_company_status
  on public.hr_document_signature_requests (company_id, status, created_at desc);

create index if not exists idx_hr_doc_sig_req_assignee_pending
  on public.hr_document_signature_requests (assignee_user_id, created_at desc)
  where status = 'pending_signature';

create index if not exists idx_hr_doc_sig_req_document
  on public.hr_document_signature_requests (document_id);

comment on table public.hr_document_signature_requests is
  'Richieste firma documento vault: HR invia, dipendente firma o restituisce.';

alter table public.hr_document_signature_requests enable row level security;

drop policy if exists "nexa_hr_doc_sig_req_select" on public.hr_document_signature_requests;
create policy "nexa_hr_doc_sig_req_select"
on public.hr_document_signature_requests for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_document_signature_requests.company_id
      and (
        public.nexa_rls_me_has_documents_read()
        or public.hr_document_signature_requests.assignee_user_id = me.id
        or public.hr_document_signature_requests.requested_by = me.id
        or exists (
          select 1 from public.users sub
          where sub.id = public.hr_document_signature_requests.assignee_user_id
            and sub."managerId" = me.id
        )
      )
  )
);

drop policy if exists "nexa_hr_doc_sig_req_insert" on public.hr_document_signature_requests;
create policy "nexa_hr_doc_sig_req_insert"
on public.hr_document_signature_requests for insert to authenticated
with check (
  public.nexa_rls_me_has_documents_write()
  and exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_document_signature_requests.company_id
      and me.id = public.hr_document_signature_requests.requested_by
  )
);

drop policy if exists "nexa_hr_doc_sig_req_update_hr" on public.hr_document_signature_requests;
create policy "nexa_hr_doc_sig_req_update_hr"
on public.hr_document_signature_requests for update to authenticated
using (
  public.nexa_rls_me_has_documents_write()
  and exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_document_signature_requests.company_id
  )
)
with check (
  public.nexa_rls_me_has_documents_write()
  and exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_document_signature_requests.company_id
  )
);

drop policy if exists "nexa_hr_doc_sig_req_update_assignee" on public.hr_document_signature_requests;
create policy "nexa_hr_doc_sig_req_update_assignee"
on public.hr_document_signature_requests for update to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_document_signature_requests.company_id
      and me.id = public.hr_document_signature_requests.assignee_user_id
      and public.hr_document_signature_requests.status = 'pending_signature'
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_document_signature_requests.company_id
      and me.id = public.hr_document_signature_requests.assignee_user_id
  )
  and public.hr_document_signature_requests.status in ('signed', 'returned')
);

-- ---------------------------------------------------------------------------
-- 2) Remote work limits parsed from employment / smart-working contract
-- ---------------------------------------------------------------------------
create table if not exists public.hr_remote_work_policy (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  user_id text not null references public.users (id) on delete cascade,
  max_remote_days_per_week smallint null
    check (
      max_remote_days_per_week is null
      or (max_remote_days_per_week >= 0 and max_remote_days_per_week <= 7)
    ),
  max_remote_days_per_month smallint null
    check (
      max_remote_days_per_month is null
      or (max_remote_days_per_month >= 0 and max_remote_days_per_month <= 31)
    ),
  source_contract_id uuid null references public.hr_standard_contracts (id) on delete set null,
  policy_year int not null,
  parsed_from_document_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id, policy_year)
);

create index if not exists idx_hr_remote_work_policy_company_user
  on public.hr_remote_work_policy (company_id, user_id, policy_year desc);

create index if not exists idx_hr_remote_work_policy_contract
  on public.hr_remote_work_policy (source_contract_id)
  where source_contract_id is not null;

comment on table public.hr_remote_work_policy is
  'Limiti smart working da contratto (giorni/settimana e mese) per anno di policy.';

alter table public.hr_remote_work_policy enable row level security;

drop policy if exists "nexa_hr_remote_work_policy_select" on public.hr_remote_work_policy;
create policy "nexa_hr_remote_work_policy_select"
on public.hr_remote_work_policy for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_remote_work_policy.company_id
      and (
        me.role in ('superuser', 'admin')
        or public.hr_remote_work_policy.user_id = me.id
        or exists (
          select 1 from public.users sub
          where sub.id = public.hr_remote_work_policy.user_id and sub."managerId" = me.id
        )
        or public.nexa_rls_me_has_standard_contracts_read()
      )
  )
);

drop policy if exists "nexa_hr_remote_work_policy_write" on public.hr_remote_work_policy;
create policy "nexa_hr_remote_work_policy_write"
on public.hr_remote_work_policy for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_remote_work_policy.company_id
      and (
        me.role in ('superuser', 'admin')
        or public.nexa_rls_me_has_standard_contracts_write()
      )
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_remote_work_policy.company_id
      and (
        me.role in ('superuser', 'admin')
        or public.nexa_rls_me_has_standard_contracts_write()
      )
  )
);

-- ---------------------------------------------------------------------------
-- 3) Generated contracts (employment / remote working) audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.hr_generated_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  user_id text not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('employment', 'remote_working')),
  contract_id uuid null references public.hr_standard_contracts (id) on delete set null,
  vault_document_id text null references public.employee_documents (id) on delete set null,
  generated_at timestamptz not null default now(),
  pdf_hash text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_generated_contracts_company_user
  on public.hr_generated_contracts (company_id, user_id, generated_at desc);

create index if not exists idx_hr_generated_contracts_contract
  on public.hr_generated_contracts (contract_id)
  where contract_id is not null;

comment on table public.hr_generated_contracts is
  'Tracciamento PDF/contratti generati (assunzione, smart working) collegati a vault e hr_standard_contracts.';

alter table public.hr_generated_contracts enable row level security;

drop policy if exists "nexa_hr_generated_contracts_select" on public.hr_generated_contracts;
create policy "nexa_hr_generated_contracts_select"
on public.hr_generated_contracts for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_generated_contracts.company_id
      and (
        me.role in ('superuser', 'admin')
        or public.hr_generated_contracts.user_id = me.id
        or public.nexa_rls_me_has_standard_contracts_read()
      )
  )
);

drop policy if exists "nexa_hr_generated_contracts_write" on public.hr_generated_contracts;
create policy "nexa_hr_generated_contracts_write"
on public.hr_generated_contracts for insert to authenticated
with check (
  public.nexa_rls_me_has_standard_contracts_write()
  and exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_generated_contracts.company_id
  )
);

notify pgrst, 'reload schema';
