-- Cowork chat requests (draft → planned → applied / cancelled).

create table if not exists public.hr_cowork_requests (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  actor_user_id text not null references public.users (id) on delete cascade,
  message text not null,
  status text not null default 'draft'
    check (status in ('draft', 'planned', 'applied', 'cancelled')),
  plan_id uuid null references public.hr_cowork_plans (id) on delete set null,
  conversation_history jsonb not null default '[]'::jsonb,
  cost_center_id text null,
  team_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz null,
  cancelled_by text null references public.users (id) on delete set null
);

create index if not exists idx_hr_cowork_requests_company_id
  on public.hr_cowork_requests (company_id);

create index if not exists idx_hr_cowork_requests_plan_id
  on public.hr_cowork_requests (plan_id)
  where plan_id is not null;

create index if not exists idx_hr_cowork_requests_company_created
  on public.hr_cowork_requests (company_id, created_at desc);

comment on table public.hr_cowork_requests is
  'Richieste Cowork da chat: draft → planned (plan_id) → applied; cancelled annulla la sessione.';

alter table public.hr_cowork_requests enable row level security;

drop policy if exists "nexa_hr_cowork_requests_select_lifecycle" on public.hr_cowork_requests;
create policy "nexa_hr_cowork_requests_select_lifecycle"
on public.hr_cowork_requests for select to authenticated
using (
  public.nexa_rls_me_has_lifecycle_read()
  and exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_cowork_requests.company_id
  )
);

drop policy if exists "nexa_hr_cowork_requests_insert_lifecycle" on public.hr_cowork_requests;
create policy "nexa_hr_cowork_requests_insert_lifecycle"
on public.hr_cowork_requests for insert to authenticated
with check (
  public.nexa_rls_me_has_lifecycle_write()
  and exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_cowork_requests.company_id
      and me.id = public.hr_cowork_requests.actor_user_id
  )
);

drop policy if exists "nexa_hr_cowork_requests_update_lifecycle" on public.hr_cowork_requests;
create policy "nexa_hr_cowork_requests_update_lifecycle"
on public.hr_cowork_requests for update to authenticated
using (
  public.nexa_rls_me_has_lifecycle_write()
  and exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_cowork_requests.company_id
  )
)
with check (
  public.nexa_rls_me_has_lifecycle_write()
  and exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_cowork_requests.company_id
  )
);

notify pgrst, 'reload schema';
