-- Checklist offboarding dipendente (percorso / self-service), speculare a lifecycle_onboarding.

create table if not exists public.lifecycle_offboarding (
  "userId" text primary key references public.users (id) on delete cascade,
  phase text not null default 'active',
  "checklistJson" jsonb not null default '[]'::jsonb,
  "updatedAt" text not null
);

create index if not exists idx_lifecycle_offboarding_phase on public.lifecycle_offboarding (phase);

alter table public.lifecycle_offboarding enable row level security;

drop policy if exists "nexa_lifecycle_offboarding_select_visible" on public.lifecycle_offboarding;
create policy "nexa_lifecycle_offboarding_select_visible"
on public.lifecycle_offboarding for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.lifecycle_offboarding."userId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.lifecycle_offboarding."userId" and sub."managerId" = me.id
      )
    )
  )
);

notify pgrst, 'reload schema';
