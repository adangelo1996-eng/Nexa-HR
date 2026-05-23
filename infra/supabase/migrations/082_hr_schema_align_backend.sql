-- Repair: align remote schema with repo 080 (camelCase signature requests, batch_key registry).
-- Idempotent: no-op when already aligned.

-- employee_documents vault revision / signature columns
alter table public.employee_documents
  add column if not exists "parentDocumentId" text null references public.employee_documents (id) on delete set null,
  add column if not exists "signedAt" text null,
  add column if not exists "signedByUserId" text null references public.users (id) on delete set null,
  add column if not exists "signatureMetadata" jsonb null;

create index if not exists idx_employee_documents_parent
  on public.employee_documents ("parentDocumentId");

-- hr_document_signature_requests: replace legacy snake_case variant (empty table safe)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hr_document_signature_requests'
      and column_name = 'document_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hr_document_signature_requests'
      and column_name = 'documentId'
  ) then
    drop table public.hr_document_signature_requests cascade;
  end if;
end $$;

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

-- hr_generated_contracts: replace legacy kind/contract_id variant (empty table safe)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hr_generated_contracts'
      and column_name = 'kind'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hr_generated_contracts'
      and column_name = 'batch_key'
  ) then
    drop table public.hr_generated_contracts cascade;
  end if;
end $$;

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
