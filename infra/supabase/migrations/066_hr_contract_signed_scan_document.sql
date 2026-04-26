-- Opzionale: PDF firmato caricato (scansione) oltre al PDF generato da export.
alter table public.hr_standard_contracts
  add column if not exists signed_scan_document_id text null references public.employee_documents (id) on delete set null;

create index if not exists idx_hr_std_contracts_signed_scan on public.hr_standard_contracts (signed_scan_document_id)
  where signed_scan_document_id is not null;
