-- Hebb AI Mate: audit log operazioni applicate (undo superuser).

create table if not exists public.hr_hebb_mate_apply_log (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  proposal_id uuid not null,
  actor_user_id text not null references public.users (id) on delete cascade,
  capability text not null,
  subject_user_id text null references public.users (id) on delete set null,
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

create index if not exists idx_hr_hebb_mate_apply_log_company_applied
  on public.hr_hebb_mate_apply_log (company_id, applied_at desc);

create index if not exists idx_hr_hebb_mate_apply_log_proposal
  on public.hr_hebb_mate_apply_log (proposal_id);

comment on table public.hr_hebb_mate_apply_log is
  'Audit operazioni Hebb AI Mate applicate (HITL) con metadati per undo superuser.';

alter table public.hr_hebb_mate_apply_log enable row level security;

drop policy if exists "nexa_hr_mate_apply_log_select" on public.hr_hebb_mate_apply_log;
create policy "nexa_hr_mate_apply_log_select"
on public.hr_hebb_mate_apply_log for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_hebb_mate_apply_log.company_id
      and (
        me.role = 'superuser'
        or public.nexa_rls_me_has_lifecycle_read()
      )
  )
);

drop policy if exists "nexa_hr_mate_apply_log_write" on public.hr_hebb_mate_apply_log;
create policy "nexa_hr_mate_apply_log_write"
on public.hr_hebb_mate_apply_log for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_hebb_mate_apply_log.company_id
      and public.nexa_rls_me_has_lifecycle_write()
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_hebb_mate_apply_log.company_id
      and public.nexa_rls_me_has_lifecycle_write()
  )
);

notify pgrst, 'reload schema';
