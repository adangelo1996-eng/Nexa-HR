-- Trasferte: richieste giornaliere con workflow approvazioni (come remote working / smartworking_requests, senza quote).

create table if not exists public.travel_requests (
  id text primary key,
  "userId" text not null references public.users(id) on delete cascade,
  "day" text not null,
  note text,
  status text not null default 'pending',
  "approverId" text references public.users(id) on delete set null,
  "decisionAt" text,
  "rejectReason" text,
  "createdAt" text not null
);

create index if not exists idx_travel_req_user on public.travel_requests ("userId");
create index if not exists idx_travel_req_status on public.travel_requests (status);

alter table public.travel_requests replica identity full;

do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'travel_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.travel_requests';
  end if;
end
$pub$;

alter table public.travel_requests enable row level security;

drop policy if exists "nexa_travel_select_visible" on public.travel_requests;
create policy "nexa_travel_select_visible"
on public.travel_requests for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and (
      me.role = 'superuser'
      or public.travel_requests."userId" = me.id
      or public.travel_requests."approverId" = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.travel_requests."userId" and sub."managerId" = me.id
      )
    )
  )
);
