-- Registro batch contratti generati (employment + remote working) — idempotenza e metadata strutturata.

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
