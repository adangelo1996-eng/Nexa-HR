-- Sale riunioni: catalogo condiviso per company + prenotazioni (calendario).

create extension if not exists btree_gist;

create table if not exists public.meeting_rooms (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  name text not null,
  location text null,
  seats integer null,
  has_screen boolean not null default false,
  has_projector boolean not null default false,
  has_whiteboard boolean not null default false,
  has_video_conference boolean not null default false,
  extra_features text[] not null default '{}'::text[],
  created_by_user_id text null references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meeting_rooms_company_name
  on public.meeting_rooms (company_id, name);

create table if not exists public.meeting_room_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  room_id uuid not null references public.meeting_rooms (id) on delete cascade,
  booked_by_user_id text not null references public.users (id) on delete restrict,
  title text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  canceled_at timestamptz null,
  canceled_by_user_id text null references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.meeting_room_bookings
  add constraint meeting_room_bookings_time_valid
  check (ends_at > starts_at);

create index if not exists idx_meeting_room_bookings_room_time
  on public.meeting_room_bookings (room_id, starts_at, ends_at);

create index if not exists idx_meeting_room_bookings_company_time
  on public.meeting_room_bookings (company_id, starts_at, ends_at);

-- Evita sovrapposizioni sulla stessa sala (prenotazioni non cancellate).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meeting_room_bookings_no_overlap'
  ) then
    alter table public.meeting_room_bookings
      add constraint meeting_room_bookings_no_overlap
      exclude using gist (
        room_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (canceled_at is null);
  end if;
end $$;

-- Trigger aggiornamento updated_at
create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_meeting_rooms_set_updated_at on public.meeting_rooms;
create trigger trg_meeting_rooms_set_updated_at
before update on public.meeting_rooms
for each row
execute function public.set_updated_at_timestamp();

comment on table public.meeting_rooms is 'Sale riunioni (company-scoped): proprietà e caratteristiche per prenotazione.';
comment on table public.meeting_room_bookings is 'Prenotazioni sale riunioni (no overlap per room_id).';

alter table public.meeting_rooms enable row level security;
alter table public.meeting_room_bookings enable row level security;

-- meeting_rooms: lettura per company; scrittura solo admin/superuser
drop policy if exists "nexa_meeting_rooms_select_company" on public.meeting_rooms;
create policy "nexa_meeting_rooms_select_company"
on public.meeting_rooms for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.meeting_rooms.company_id
  )
);

drop policy if exists "nexa_meeting_rooms_write_admin" on public.meeting_rooms;
create policy "nexa_meeting_rooms_write_admin"
on public.meeting_rooms for insert to authenticated
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me.role in ('superuser', 'admin')
      and me."companyId" = public.meeting_rooms.company_id
  )
);

drop policy if exists "nexa_meeting_rooms_update_admin" on public.meeting_rooms;
create policy "nexa_meeting_rooms_update_admin"
on public.meeting_rooms for update to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me.role in ('superuser', 'admin')
      and me."companyId" = public.meeting_rooms.company_id
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me.role in ('superuser', 'admin')
      and me."companyId" = public.meeting_rooms.company_id
  )
);

drop policy if exists "nexa_meeting_rooms_delete_admin" on public.meeting_rooms;
create policy "nexa_meeting_rooms_delete_admin"
on public.meeting_rooms for delete to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me.role in ('superuser', 'admin')
      and me."companyId" = public.meeting_rooms.company_id
  )
);

-- meeting_room_bookings: lettura per company; inserimento per company; cancellazione (cancel) per owner o admin/superuser
drop policy if exists "nexa_meeting_room_bookings_select_company" on public.meeting_room_bookings;
create policy "nexa_meeting_room_bookings_select_company"
on public.meeting_room_bookings for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.meeting_room_bookings.company_id
  )
);

drop policy if exists "nexa_meeting_room_bookings_insert_company" on public.meeting_room_bookings;
create policy "nexa_meeting_room_bookings_insert_company"
on public.meeting_room_bookings for insert to authenticated
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.meeting_room_bookings.company_id
      and me.id = public.meeting_room_bookings.booked_by_user_id
  )
);

drop policy if exists "nexa_meeting_room_bookings_update_cancel" on public.meeting_room_bookings;
create policy "nexa_meeting_room_bookings_update_cancel"
on public.meeting_room_bookings for update to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.meeting_room_bookings.company_id
      and (
        me.role in ('superuser', 'admin')
        or me.id = public.meeting_room_bookings.booked_by_user_id
      )
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.meeting_room_bookings.company_id
      and (
        me.role in ('superuser', 'admin')
        or me.id = public.meeting_room_bookings.booked_by_user_id
      )
  )
);

