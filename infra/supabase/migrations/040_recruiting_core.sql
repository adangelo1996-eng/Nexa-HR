-- Recruiting / ATS core: posizioni, candidati, pipeline a fasi, colloqui, valutazioni.
-- Nota: in Nexa-HR il client browser usa principalmente API Nest con service_role;
-- RLS resta attivo per ridurre superficie e per eventuale lettura diretta authenticated.

create table if not exists recruit_positions (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  title text not null default '',
  job_description text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  created_by_user_id text references users (id) on delete set null
);

create index if not exists idx_recruit_positions_company on recruit_positions (company_id, status);

create table if not exists recruit_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  first_name text not null default '',
  last_name text not null default '',
  email text null,
  phone text null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by_user_id text references users (id) on delete set null
);

create index if not exists idx_recruit_candidates_company on recruit_candidates (company_id);
create index if not exists idx_recruit_candidates_email on recruit_candidates (email);

create table if not exists recruit_candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references recruit_candidates (id) on delete cascade,
  kind text not null default 'cv' check (kind in ('cv', 'other')),
  employee_document_id text null references employee_documents (id) on delete set null,
  label text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_recruit_candidate_docs_candidate on recruit_candidate_documents (candidate_id);

create table if not exists recruit_pipelines (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references recruit_positions (id) on delete cascade,
  name text not null default 'Pipeline',
  created_at timestamptz not null default now()
);

create unique index if not exists idx_recruit_pipeline_position_unique on recruit_pipelines (position_id);

create table if not exists recruit_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references recruit_pipelines (id) on delete cascade,
  stage_order integer not null default 0,
  name text not null,
  stage_kind text not null default 'interview' check (stage_kind in ('screening', 'interview', 'offer', 'hired', 'rejected', 'custom')),
  created_at timestamptz not null default now()
);

create index if not exists idx_recruit_pipeline_stages_pipeline on recruit_pipeline_stages (pipeline_id, stage_order);

create table if not exists recruit_stage_assignees (
  stage_id uuid not null references recruit_pipeline_stages (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (stage_id, user_id)
);

create index if not exists idx_recruit_stage_assignees_user on recruit_stage_assignees (user_id);

create table if not exists recruit_candidate_stage_state (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references recruit_candidates (id) on delete cascade,
  position_id uuid not null references recruit_positions (id) on delete cascade,
  current_stage_id uuid not null references recruit_pipeline_stages (id) on delete restrict,
  status text not null default 'in_progress' check (status in ('in_progress', 'passed', 'failed')),
  updated_at timestamptz not null default now(),
  updated_by_user_id text references users (id) on delete set null
);

create unique index if not exists idx_recruit_candidate_position_unique
  on recruit_candidate_stage_state (candidate_id, position_id);

create index if not exists idx_recruit_candidate_stage_current on recruit_candidate_stage_state (current_stage_id, status);

create table if not exists recruit_stage_interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_stage_state_id uuid not null references recruit_candidate_stage_state (id) on delete cascade,
  stage_id uuid not null references recruit_pipeline_stages (id) on delete cascade,
  scheduled_at timestamptz null,
  meeting_link text null,
  location text null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by_user_id text references users (id) on delete set null
);

create index if not exists idx_recruit_interviews_state on recruit_stage_interviews (candidate_stage_state_id);

create table if not exists recruit_stage_reviews (
  id uuid primary key default gen_random_uuid(),
  candidate_stage_state_id uuid not null references recruit_candidate_stage_state (id) on delete cascade,
  stage_id uuid not null references recruit_pipeline_stages (id) on delete cascade,
  reviewer_user_id text not null references users (id) on delete cascade,
  score integer null check (score is null or (score >= 1 and score <= 5)),
  fields jsonb not null default '{}'::jsonb,
  notes text not null default '',
  decision text null check (decision is null or decision in ('advance', 'reject')),
  created_at timestamptz not null default now()
);

create index if not exists idx_recruit_reviews_state on recruit_stage_reviews (candidate_stage_state_id);

-- RLS (select) per authenticated: solo HR (superuser/admin) o assegnati alla fase corrente.
alter table public.recruit_positions enable row level security;
alter table public.recruit_candidates enable row level security;
alter table public.recruit_candidate_documents enable row level security;
alter table public.recruit_pipelines enable row level security;
alter table public.recruit_pipeline_stages enable row level security;
alter table public.recruit_stage_assignees enable row level security;
alter table public.recruit_candidate_stage_state enable row level security;
alter table public.recruit_stage_interviews enable row level security;
alter table public.recruit_stage_reviews enable row level security;

drop policy if exists "nexa_recruiting_select_visible_positions" on public.recruit_positions;
create policy "nexa_recruiting_select_visible_positions"
on public.recruit_positions for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and me.role in ('superuser', 'admin')
  )
);

drop policy if exists "nexa_recruiting_select_visible_candidates" on public.recruit_candidates;
create policy "nexa_recruiting_select_visible_candidates"
on public.recruit_candidates for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and me.role in ('superuser', 'admin')
  )
);

drop policy if exists "nexa_recruiting_select_visible_state" on public.recruit_candidate_stage_state;
create policy "nexa_recruiting_select_visible_state"
on public.recruit_candidate_stage_state for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and (
      me.role in ('superuser', 'admin')
      or exists (
        select 1
        from public.recruit_stage_assignees a
        where a.stage_id = public.recruit_candidate_stage_state.current_stage_id
          and a.user_id = me.id
      )
    )
  )
);

drop policy if exists "nexa_recruiting_select_visible_interviews" on public.recruit_stage_interviews;
create policy "nexa_recruiting_select_visible_interviews"
on public.recruit_stage_interviews for select to authenticated
using (
  exists (
    select 1 from public.recruit_candidate_stage_state s
    where s.id = public.recruit_stage_interviews.candidate_stage_state_id
  )
);

drop policy if exists "nexa_recruiting_select_visible_reviews" on public.recruit_stage_reviews;
create policy "nexa_recruiting_select_visible_reviews"
on public.recruit_stage_reviews for select to authenticated
using (
  exists (
    select 1 from public.recruit_candidate_stage_state s
    where s.id = public.recruit_stage_reviews.candidate_stage_state_id
  )
);

drop policy if exists "nexa_recruiting_select_visible_pipeline" on public.recruit_pipelines;
create policy "nexa_recruiting_select_visible_pipeline"
on public.recruit_pipelines for select to authenticated
using (
  exists (
    select 1
    from public.recruit_positions p
    where p.id = public.recruit_pipelines.position_id
  )
);

drop policy if exists "nexa_recruiting_select_visible_stages" on public.recruit_pipeline_stages;
create policy "nexa_recruiting_select_visible_stages"
on public.recruit_pipeline_stages for select to authenticated
using (
  exists (
    select 1
    from public.recruit_pipelines pl
    where pl.id = public.recruit_pipeline_stages.pipeline_id
  )
);

drop policy if exists "nexa_recruiting_select_visible_stage_assignees" on public.recruit_stage_assignees;
create policy "nexa_recruiting_select_visible_stage_assignees"
on public.recruit_stage_assignees for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = auth.email()
    and me.role in ('superuser', 'admin')
  )
);

drop policy if exists "nexa_recruiting_select_visible_candidate_documents" on public.recruit_candidate_documents;
create policy "nexa_recruiting_select_visible_candidate_documents"
on public.recruit_candidate_documents for select to authenticated
using (
  exists (
    select 1 from public.recruit_candidates c
    where c.id = public.recruit_candidate_documents.candidate_id
  )
);

