-- Inviti prenotazioni sale riunioni + assegnazione buddy onboarding (idempotente).

create table if not exists public.meeting_room_booking_invitees (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.meeting_room_bookings (id) on delete cascade,
  user_id text null references public.users (id) on delete cascade,
  email text null,
  created_at timestamptz not null default now(),
  constraint meeting_room_booking_invitees_target_check
    check (user_id is not null or (email is not null and length(trim(email)) > 0))
);

create index if not exists idx_meeting_room_booking_invitees_booking
  on public.meeting_room_booking_invitees (booking_id);

create unique index if not exists uq_meeting_room_booking_invitees_user
  on public.meeting_room_booking_invitees (booking_id, user_id)
  where user_id is not null;

create unique index if not exists uq_meeting_room_booking_invitees_email
  on public.meeting_room_booking_invitees (booking_id, lower(email))
  where email is not null;

comment on table public.meeting_room_booking_invitees is
  'Invitati a una prenotazione sala: collega (user_id) o email esterna.';

create table if not exists public.onboarding_buddy_assignments (
  new_hire_user_id text primary key references public.users (id) on delete cascade,
  company_id text not null,
  buddy_user_id text not null references public.users (id) on delete restrict,
  status text not null default 'confirmed'
    check (status in ('suggested', 'confirmed', 'declined')),
  match_score numeric(5, 2) null,
  match_reason text not null default '',
  suggested_at timestamptz not null default now(),
  confirmed_by_user_id text null references public.users (id) on delete set null,
  confirmed_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_onboarding_buddy_assignments_buddy
  on public.onboarding_buddy_assignments (buddy_user_id, status);

create index if not exists idx_onboarding_buddy_assignments_company
  on public.onboarding_buddy_assignments (company_id, status);

comment on table public.onboarding_buddy_assignments is
  'Buddy onboarding: suggerimento AI e conferma HR per nuova assunzione.';

-- RLS invitees: lettura company; insert solo owner prenotazione (via backend service role in pratica)
alter table public.meeting_room_booking_invitees enable row level security;

drop policy if exists "nexa_meeting_room_invitees_select_company" on public.meeting_room_booking_invitees;
create policy "nexa_meeting_room_invitees_select_company"
on public.meeting_room_booking_invitees for select to authenticated
using (
  exists (
    select 1
    from public.meeting_room_bookings b
    join public.users me on me.email = (select auth.email())
    where b.id = public.meeting_room_booking_invitees.booking_id
      and b.company_id = me."companyId"
      and b.canceled_at is null
  )
);

alter table public.onboarding_buddy_assignments enable row level security;

drop policy if exists "nexa_onboarding_buddy_select_company" on public.onboarding_buddy_assignments;
create policy "nexa_onboarding_buddy_select_company"
on public.onboarding_buddy_assignments for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.onboarding_buddy_assignments.company_id
  )
);
