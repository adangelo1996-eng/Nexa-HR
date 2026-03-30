-- Realtime: tabelle usate da apps/frontend/lib/supabase-realtime.ts
-- RLS SELECT per role authenticated (allineato a auth.email() come tabella public.users)

alter table public.user_notifications replica identity full;
alter table public.approvals replica identity full;
alter table public.smartworking_requests replica identity full;

do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.user_notifications';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'approvals'
  ) then
    execute 'alter publication supabase_realtime add table public.approvals';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'smartworking_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.smartworking_requests';
  end if;
end
$pub$;

drop policy if exists "nexa_user_notifications_select_own" on public.user_notifications;
create policy "nexa_user_notifications_select_own"
on public.user_notifications for select to authenticated
using (
  "userId" = (select u.id from public.users u where u.email = auth.email() limit 1)
);

drop policy if exists "nexa_approvals_select_visible" on public.approvals;
create policy "nexa_approvals_select_visible"
on public.approvals for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and (
      me.role = 'admin'
      or public.approvals."requestedBy" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.approvals."requestedBy" and sub."managerId" = me.id
      )
    )
  )
);

alter table public.smartworking_requests enable row level security;

drop policy if exists "nexa_smartworking_select_visible" on public.smartworking_requests;
create policy "nexa_smartworking_select_visible"
on public.smartworking_requests for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and (
      me.role = 'admin'
      or public.smartworking_requests."userId" = me.id
      or public.smartworking_requests."approverId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.smartworking_requests."userId" and sub."managerId" = me.id
      )
    )
  )
);
