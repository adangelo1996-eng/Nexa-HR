-- Accordi annuali smart working + piani Nexa Cowork (HITL batch AI)

create table if not exists public.smartworking_agreements (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  user_id text not null references public.users (id) on delete cascade,
  policy_version text not null default '',
  valid_from date not null,
  valid_to date not null,
  status text not null default 'active'
    check (status in ('draft', 'active', 'expired', 'revoked')),
  document_id text null references public.employee_documents (id) on delete set null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id text null references public.users (id) on delete set null
);

create index if not exists idx_sw_agreements_company_user
  on public.smartworking_agreements (company_id, user_id, valid_to desc);

create index if not exists idx_sw_agreements_expiry
  on public.smartworking_agreements (company_id, valid_to)
  where status = 'active';

comment on table public.smartworking_agreements is
  'Accordi/policy annuali smart working per dipendente (Nexa Cowork + vault documenti).';

alter table public.smartworking_agreements enable row level security;

drop policy if exists "nexa_sw_agreements_select_company" on public.smartworking_agreements;
create policy "nexa_sw_agreements_select_company"
on public.smartworking_agreements for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.smartworking_agreements.company_id
      and (
        me.role in ('superuser', 'admin')
        or public.smartworking_agreements.user_id = me.id
        or exists (
          select 1 from public.users sub
          where sub.id = public.smartworking_agreements.user_id and sub."managerId" = me.id
        )
      )
  )
);

drop policy if exists "nexa_sw_agreements_write_hr" on public.smartworking_agreements;
create policy "nexa_sw_agreements_write_hr"
on public.smartworking_agreements for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.smartworking_agreements.company_id
      and me.role in ('superuser', 'admin')
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.smartworking_agreements.company_id
      and me.role in ('superuser', 'admin')
  )
);

create table if not exists public.hr_cowork_plans (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  actor_user_id text not null references public.users (id) on delete cascade,
  domain text not null,
  summary text not null default '',
  rows_json jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'partial', 'applied', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  applied_at timestamptz null
);

create index if not exists idx_hr_cowork_plans_company_created
  on public.hr_cowork_plans (company_id, created_at desc);

comment on table public.hr_cowork_plans is
  'Piani operazioni di massa Nexa Cowork in attesa di conferma HR (HITL).';

alter table public.hr_cowork_plans enable row level security;

drop policy if exists "nexa_hr_cowork_plans_admin_all" on public.hr_cowork_plans;
create policy "nexa_hr_cowork_plans_admin_all"
on public.hr_cowork_plans for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_cowork_plans.company_id
      and me.role in ('superuser', 'admin')
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_cowork_plans.company_id
      and me.role in ('superuser', 'admin')
  )
);

notify pgrst, 'reload schema';
