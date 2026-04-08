-- Contratti standard HR (editor a blocchi): persistenza su Postgres, nessun draft lato browser.

create table if not exists public.hr_standard_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  title text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved', 'exported')),
  party jsonb not null default '{}'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  last_exported_document_id text null references public.employee_documents (id) on delete set null,
  recruit_candidate_id uuid null references public.recruit_candidates (id) on delete set null,
  recruit_position_id uuid null references public.recruit_positions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id text null references public.users (id) on delete set null
);

create index if not exists idx_hr_std_contracts_company on public.hr_standard_contracts (company_id, updated_at desc);
create index if not exists idx_hr_std_contracts_candidate on public.hr_standard_contracts (recruit_candidate_id);
create index if not exists idx_hr_std_contracts_position on public.hr_standard_contracts (recruit_position_id);

alter table public.hr_standard_contracts enable row level security;

drop policy if exists "nexa_hr_std_contracts_select_hr" on public.hr_standard_contracts;
create policy "nexa_hr_std_contracts_select_hr"
on public.hr_standard_contracts for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and me.role in ('superuser', 'admin')
  )
);
