-- Ripara hr_cowork_apply_log se applicata la 077 legacy (user_id/action/payload).
-- Idempotente: no-op se lo schema è già allineato a CoworkApplyLogStore.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hr_cowork_apply_log'
      and column_name = 'user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hr_cowork_apply_log'
      and column_name = 'actor_user_id'
  ) then
    alter table public.hr_cowork_apply_log
      add column if not exists batch_id uuid,
      add column if not exists actor_user_id text,
      add column if not exists subject_user_id text,
      add column if not exists subject_full_name text not null default '',
      add column if not exists entity_type text,
      add column if not exists entity_id text,
      add column if not exists previous_state jsonb,
      add column if not exists applied_payload jsonb not null default '{}'::jsonb,
      add column if not exists detail text not null default '',
      add column if not exists undo_status text,
      add column if not exists undo_blocked_reason text,
      add column if not exists undone_by_user_id text;

    update public.hr_cowork_apply_log
    set
      batch_id = coalesce(batch_id, gen_random_uuid()),
      actor_user_id = coalesce(actor_user_id, applied_by, user_id),
      subject_user_id = coalesce(subject_user_id, user_id),
      subject_full_name = coalesce(nullif(subject_full_name, ''), ''),
      applied_payload = coalesce(
        applied_payload,
        case when payload is not null and payload <> '{}'::jsonb then payload else '{}'::jsonb end
      ),
      detail = coalesce(nullif(detail, ''), nullif(action, ''), ''),
      undo_status = coalesce(
        undo_status,
        case
          when status = 'undone' then 'undone'
          when status = 'failed' then 'failed'
          else 'available'
        end
      ),
      undo_blocked_reason = coalesce(undo_blocked_reason, error_message),
      previous_state = coalesce(previous_state, undo_payload),
      undone_by_user_id = coalesce(undone_by_user_id, undone_by)
    where actor_user_id is null or batch_id is null or undo_status is null;

    alter table public.hr_cowork_apply_log
      alter column batch_id set default gen_random_uuid(),
      alter column batch_id set not null,
      alter column actor_user_id set not null,
      alter column undo_status set default 'available',
      alter column undo_status set not null;

    alter table public.hr_cowork_apply_log
      drop constraint if exists hr_cowork_apply_log_undo_status_check;

    alter table public.hr_cowork_apply_log
      add constraint hr_cowork_apply_log_undo_status_check
      check (undo_status in ('available', 'undone', 'blocked', 'failed'));

    alter table public.hr_cowork_apply_log
      drop column if exists user_id,
      drop column if exists action,
      drop column if exists payload,
      drop column if exists applied_by,
      drop column if exists status,
      drop column if exists undo_payload,
      drop column if exists undone_by,
      drop column if exists error_message,
      drop column if exists created_at;

    drop index if exists public.uq_hr_cowork_apply_log_plan_row;
  end if;
end $$;

create index if not exists idx_hr_cowork_apply_log_company_applied
  on public.hr_cowork_apply_log (company_id, applied_at desc);

create index if not exists idx_hr_cowork_apply_log_plan_row
  on public.hr_cowork_apply_log (plan_id, row_id);

drop index if exists public.uq_hr_cowork_apply_log_plan_row;
create unique index if not exists uq_hr_cowork_apply_log_plan_row_active
  on public.hr_cowork_apply_log (plan_id, row_id)
  where undo_status = 'available';

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
