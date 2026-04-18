-- Proposte workflow agentici con approvazione umana (HITL), basso rischio.

create table if not exists public.hr_hitl_proposals (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  actor_user_id text not null references public.users (id) on delete cascade,
  kind text not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  rationale text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz null,
  decided_by_user_id text null references public.users (id) on delete set null
);

create index if not exists idx_hr_hitl_proposals_company_created
  on public.hr_hitl_proposals (company_id, created_at desc);

comment on table public.hr_hitl_proposals is 'Code worker / coda: proposta strutturata in attesa di decisione umana.';

alter table public.hr_hitl_proposals enable row level security;

drop policy if exists "nexa_hr_hitl_select_admin" on public.hr_hitl_proposals;
create policy "nexa_hr_hitl_select_admin"
on public.hr_hitl_proposals for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_hitl_proposals.company_id
  )
);

drop policy if exists "nexa_hr_hitl_write_admin" on public.hr_hitl_proposals;
create policy "nexa_hr_hitl_write_admin"
on public.hr_hitl_proposals for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_hitl_proposals.company_id
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_hitl_proposals.company_id
  )
);

notify pgrst, 'reload schema';
