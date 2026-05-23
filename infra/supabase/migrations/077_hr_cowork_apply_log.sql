-- Cowork apply audit log (undo / history) — schema allineato a CoworkApplyLogStore.

alter table public.hr_cowork_plans
  drop constraint if exists hr_cowork_plans_status_check;

alter table public.hr_cowork_plans
  add constraint hr_cowork_plans_status_check
  check (status in ('pending', 'partial', 'applied', 'expired', 'cancelled'));

-- ---------------------------------------------------------------------------
-- Helper RLS: permessi Nexa lifecycle (company-scoped HR extended).
-- ---------------------------------------------------------------------------
create or replace function public.nexa_rls_me_has_lifecycle_read()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users me
    left join public.roles r on r.id = me."roleId"
    where me.email = (select auth.email())
      and (
        me.role in ('superuser', 'admin')
        or coalesce(r.permissions, '[]'::jsonb) @> '["*"]'::jsonb
        or coalesce(r.permissions, '[]'::jsonb) @> '["nexa.lifecycle:read"]'::jsonb
        or coalesce(r.permissions, '[]'::jsonb) @> '["nexa.lifecycle:write"]'::jsonb
        or coalesce(r.permissions, '[]'::jsonb) @> '["read:team"]'::jsonb
      )
  );
$$;

create or replace function public.nexa_rls_me_has_lifecycle_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users me
    left join public.roles r on r.id = me."roleId"
    where me.email = (select auth.email())
      and (
        me.role in ('superuser', 'admin')
        or coalesce(r.permissions, '[]'::jsonb) @> '["*"]'::jsonb
        or coalesce(r.permissions, '[]'::jsonb) @> '["nexa.lifecycle:write"]'::jsonb
        or coalesce(r.permissions, '[]'::jsonb) @> '["read:team"]'::jsonb
      )
  );
$$;

comment on function public.nexa_rls_me_has_lifecycle_read() is
  'RLS Cowork: HR extended (nexa.lifecycle:read, write, read:team, superuser/admin).';
comment on function public.nexa_rls_me_has_lifecycle_write() is
  'RLS Cowork: insert/apply/undo (nexa.lifecycle:write, read:team, superuser/admin).';

-- ---------------------------------------------------------------------------
-- hr_cowork_apply_log
-- ---------------------------------------------------------------------------
create table if not exists public.hr_cowork_apply_log (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  plan_id uuid not null references public.hr_cowork_plans (id) on delete cascade,
  batch_id uuid not null default gen_random_uuid(),
  row_id text not null,
  actor_user_id text not null references public.users (id) on delete cascade,
  tool_id text not null,
  domain text not null,
  subject_user_id text null,
  subject_full_name text not null default '',
  entity_type text null,
  entity_id text null,
  previous_state jsonb null,
  applied_payload jsonb not null default '{}'::jsonb,
  detail text not null default '',
  undo_status text not null default 'available'
    check (undo_status in ('available', 'undone', 'blocked', 'failed')),
  undo_blocked_reason text null,
  applied_at timestamptz not null default now(),
  undone_at timestamptz null,
  undone_by_user_id text null references public.users (id) on delete set null
);

create index if not exists idx_hr_cowork_apply_log_company_applied
  on public.hr_cowork_apply_log (company_id, applied_at desc);

create index if not exists idx_hr_cowork_apply_log_plan_row
  on public.hr_cowork_apply_log (plan_id, row_id);

drop index if exists public.uq_hr_cowork_apply_log_plan_row;
create unique index if not exists uq_hr_cowork_apply_log_plan_row_active
  on public.hr_cowork_apply_log (plan_id, row_id)
  where undo_status = 'available';

comment on table public.hr_cowork_apply_log is
  'Audit righe Cowork applicate (HITL) con metadati per undo.';

alter table public.hr_cowork_apply_log enable row level security;

drop policy if exists "nexa_hr_cowork_apply_log_admin_all" on public.hr_cowork_apply_log;
drop policy if exists "nexa_hr_cowork_apply_log_select_lifecycle" on public.hr_cowork_apply_log;
create policy "nexa_hr_cowork_apply_log_select_lifecycle"
on public.hr_cowork_apply_log for select to authenticated
using (
  public.nexa_rls_me_has_lifecycle_read()
  and exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_cowork_apply_log.company_id
  )
);

drop policy if exists "nexa_hr_cowork_apply_log_insert_lifecycle" on public.hr_cowork_apply_log;
create policy "nexa_hr_cowork_apply_log_insert_lifecycle"
on public.hr_cowork_apply_log for insert to authenticated
with check (
  public.nexa_rls_me_has_lifecycle_write()
  and exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_cowork_apply_log.company_id
  )
);

drop policy if exists "nexa_hr_cowork_apply_log_update_lifecycle" on public.hr_cowork_apply_log;
create policy "nexa_hr_cowork_apply_log_update_lifecycle"
on public.hr_cowork_apply_log for update to authenticated
using (
  public.nexa_rls_me_has_lifecycle_write()
  and exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_cowork_apply_log.company_id
  )
)
with check (
  public.nexa_rls_me_has_lifecycle_write()
  and exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_cowork_apply_log.company_id
  )
);

notify pgrst, 'reload schema';
