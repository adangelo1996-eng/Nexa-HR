-- Document signature workflow, remote work policy, generated contracts registry (single 080).

-- ---------------------------------------------------------------------------
-- RLS helpers: nexa.documents / standard_contracts permissions
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
-- 1) Vault document revisions + signature requests (camelCase PostgREST)
-- ---------------------------------------------------------------------------
alter table public.employee_documents
  add column if not exists "parentDocumentId" text null references public.employee_documents (id) on delete set null,
  add column if not exists "signedAt" text null,
  add column if not exists "signedByUserId" text null references public.users (id) on delete set null,
  add column if not exists "signatureMetadata" jsonb null;

comment on column public.employee_documents."parentDocumentId" is 'Scheda precedente in catena versioni vault.';
comment on column public.employee_documents."signedAt" is 'ISO timestamp firma digitale dipendente.';
comment on column public.employee_documents."signatureMetadata" is 'Metadati firma (nomi firmatari, metodo, ecc.).';

create table if not exists public.hr_document_signature_requests (
  id text primary key,
  "documentId" text not null references public.employee_documents (id) on delete cascade,
  "parentDocumentId" text null references public.employee_documents (id) on delete set null,
  "originSignedDocumentId" text null references public.employee_documents (id) on delete set null,
  "employeeUserId" text not null references public.users (id) on delete cascade,
  "requesterUserId" text not null references public.users (id) on delete cascade,
  status text not null default 'pending_employee_sign'
    check (status in ('pending_employee_sign', 'signed', 'returned')),
  "createdAt" text not null,
  "signedAt" text null,
  "returnedAt" text null,
  "signatureMetadata" jsonb null
);

create index if not exists idx_hr_doc_sig_req_employee_status
  on public.hr_document_signature_requests ("employeeUserId", status, "createdAt" desc);

create index if not exists idx_hr_doc_sig_req_requester_status
  on public.hr_document_signature_requests ("requesterUserId", status, "createdAt" desc);

create index if not exists idx_employee_documents_parent
  on public.employee_documents ("parentDocumentId");

alter table public.hr_document_signature_requests enable row level security;

drop policy if exists "nexa_hr_doc_sig_req_select_visible" on public.hr_document_signature_requests;
create policy "nexa_hr_doc_sig_req_select_visible"
on public.hr_document_signature_requests for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.nexa_rls_me_has_documents_read()
      or public.hr_document_signature_requests."employeeUserId" = me.id
      or public.hr_document_signature_requests."requesterUserId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.hr_document_signature_requests."employeeUserId"
          and sub."managerId" = me.id
      )
    )
  )
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
-- 3) Generated contracts batch registry (idempotency)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_generated_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  user_id text not null references public.users (id) on delete cascade,
  contract_kind text not null
    check (contract_kind in ('employment', 'remote_working')),
  batch_key text not null,
  hr_standard_contract_id uuid null references public.hr_standard_contracts (id) on delete set null,
  smartworking_agreement_id uuid null references public.smartworking_agreements (id) on delete set null,
  document_id text null references public.employee_documents (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, batch_key)
);

create index if not exists idx_hr_generated_contracts_company_user
  on public.hr_generated_contracts (company_id, user_id, contract_kind);

comment on table public.hr_generated_contracts is
  'Tracciamento generazione batch PDF contratti (chiave idempotente per dipendente e tipo).';

alter table public.hr_generated_contracts enable row level security;

drop policy if exists "nexa_hr_generated_contracts_hr" on public.hr_generated_contracts;
create policy "nexa_hr_generated_contracts_hr"
on public.hr_generated_contracts for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_generated_contracts.company_id
      and me.role in ('superuser', 'admin')
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_generated_contracts.company_id
      and me.role in ('superuser', 'admin')
  )
);

notify pgrst, 'reload schema';
