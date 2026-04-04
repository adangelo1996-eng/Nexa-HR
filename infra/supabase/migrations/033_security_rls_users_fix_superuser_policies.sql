-- Sicurezza: RLS su public.users (client browser usa solo API Nest con service_role).
-- Correzione policy create in 011: dopo 022 il ruolo HR globale è superuser, non admin.
-- Garantisce RLS attivo su approvals / user_notifications (policy 011 senza enable esplicito).

alter table public.approvals enable row level security;
alter table public.user_notifications enable row level security;

alter table public.users enable row level security;

drop policy if exists "nexa_users_select_own" on public.users;
create policy "nexa_users_select_own"
on public.users for select to authenticated
using (id = auth.uid()::text);

drop policy if exists "nexa_approvals_select_visible" on public.approvals;
create policy "nexa_approvals_select_visible"
on public.approvals for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and (
      me.role in ('superuser', 'admin')
      or public.approvals."requestedBy" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.approvals."requestedBy" and sub."managerId" = me.id
      )
    )
  )
);

drop policy if exists "nexa_smartworking_select_visible" on public.smartworking_requests;
create policy "nexa_smartworking_select_visible"
on public.smartworking_requests for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and (
      me.role in ('superuser', 'admin')
      or public.smartworking_requests."userId" = me.id
      or public.smartworking_requests."approverId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.smartworking_requests."userId" and sub."managerId" = me.id
      )
    )
  )
);
