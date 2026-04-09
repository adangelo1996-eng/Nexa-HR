-- Recruiting: storage metadati allegati, privacy candidato, audit spostamenti fase, bucket dedicato.

-- Bucket privato (upload solo da backend con service role, come employee-photos).
insert into storage.buckets (id, name, public)
values ('recruit-candidate-files', 'recruit-candidate-files', false)
on conflict (id) do nothing;

alter table public.recruit_candidates
  add column if not exists privacy_notice_version text null,
  add column if not exists consent_recorded_at timestamptz null;

comment on column public.recruit_candidates.privacy_notice_version is 'Versione informativa privacy accettata in creazione (testo gestito dal d.l.).';
comment on column public.recruit_candidates.consent_recorded_at is 'Timestamp registrazione consenso/base giuridica lato organizzazione.';

alter table public.recruit_candidate_documents
  add column if not exists storage_bucket text null,
  add column if not exists storage_path text null,
  add column if not exists mime_type text null,
  add column if not exists byte_size bigint null,
  add column if not exists uploaded_by_user_id text null references public.users (id) on delete set null;

comment on column public.recruit_candidate_documents.storage_bucket is 'Bucket Supabase (es. recruit-candidate-files).';
comment on column public.recruit_candidate_documents.storage_path is 'Path oggetto nel bucket.';

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
