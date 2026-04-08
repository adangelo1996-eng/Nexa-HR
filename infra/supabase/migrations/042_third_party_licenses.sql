-- SYN-88 / SYN-86: inventario licenze strumenti terzi e assegnazioni per utente Nexa.
-- Costi in centesimi EUR (dichiarativi). CDC opzionale come etichetta su catalogo.

create table if not exists public.third_party_licenses (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  tool_name text not null,
  license_plan text not null default '',
  seats_purchased integer not null default 0 check (seats_purchased >= 0),
  cost_amount_cents bigint not null default 0 check (cost_amount_cents >= 0),
  cost_frequency text not null default 'monthly'
    check (cost_frequency in ('monthly', 'annual', 'one_time', 'other')),
  cost_center_id text null references public.cost_centers (id) on delete set null,
  renewal_date date null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id text null references public.users (id) on delete set null
);

create index if not exists idx_third_party_licenses_company on public.third_party_licenses (company_id, tool_name);
create index if not exists idx_third_party_licenses_cc on public.third_party_licenses (cost_center_id);

create table if not exists public.user_third_party_license_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  user_id text not null references public.users (id) on delete cascade,
  license_id uuid not null references public.third_party_licenses (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive')),
  assigned_at date null,
  revoked_at date null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, license_id)
);

create index if not exists idx_tp_assign_company on public.user_third_party_license_assignments (company_id);
create index if not exists idx_tp_assign_user on public.user_third_party_license_assignments (user_id);
create index if not exists idx_tp_assign_license on public.user_third_party_license_assignments (license_id);

alter table public.third_party_licenses enable row level security;
alter table public.user_third_party_license_assignments enable row level security;

drop policy if exists "nexa_tp_licenses_select_hr" on public.third_party_licenses;
create policy "nexa_tp_licenses_select_hr"
on public.third_party_licenses for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and me.role in ('superuser', 'admin')
  )
);

drop policy if exists "nexa_tp_assign_select_hr" on public.user_third_party_license_assignments;
create policy "nexa_tp_assign_select_hr"
on public.user_third_party_license_assignments for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and me.role in ('superuser', 'admin')
  )
);

-- Product defaults (SYN-88/86): una riga per (user_id, license_id), aggiornabile via sync sostitutivo;
-- costi in cent EUR; superamento posti = warning in UI; catalogo obbligatorio per assegnazione.
