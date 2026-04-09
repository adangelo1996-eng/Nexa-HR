-- HR standard contracts: versioning + signing metadata.

alter table public.hr_standard_contracts
  add column if not exists signed_at timestamptz null,
  add column if not exists signed_by_user_id text null references public.users (id) on delete set null,
  add column if not exists signatures jsonb not null default '{}'::jsonb;

create table if not exists public.hr_standard_contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.hr_standard_contracts (id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by_user_id text null references public.users (id) on delete set null,
  unique (contract_id, version)
);

create index if not exists idx_hr_std_contract_versions_contract on public.hr_standard_contract_versions (contract_id, version desc);

alter table public.hr_standard_contract_versions enable row level security;
