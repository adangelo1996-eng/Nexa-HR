-- Garantisce tabella audit spostamenti fase e ricarica PostgREST.
-- Risolve: "Could not find the table 'public.recruit_stage_transition_log' in the schema cache" (PGRST204)
-- se la migrazione 048 non è mai stata applicata per intero o la cache non si è aggiornata.

create table if not exists public.recruit_stage_transition_log (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references public.recruit_candidate_stage_state (id) on delete cascade,
  from_stage_id uuid not null references public.recruit_pipeline_stages (id),
  to_stage_id uuid not null references public.recruit_pipeline_stages (id),
  actor_user_id text null references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  reverted_at timestamptz null
);

create index if not exists idx_recruit_stage_transition_log_state
  on public.recruit_stage_transition_log (state_id, created_at desc);

alter table public.recruit_stage_transition_log enable row level security;

drop policy if exists "nexa_recruiting_select_transition_log" on public.recruit_stage_transition_log;
create policy "nexa_recruiting_select_transition_log"
on public.recruit_stage_transition_log for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
  )
);

notify pgrst, 'reload schema';
