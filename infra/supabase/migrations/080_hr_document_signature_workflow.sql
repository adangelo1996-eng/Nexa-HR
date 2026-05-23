-- Vault document revisions + employee signature requests (HITL publish workflow).

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
