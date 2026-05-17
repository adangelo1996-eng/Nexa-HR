-- Wizard onboarding HR multi-step + catalogo formazione dipendenti

alter table public.users
  add column if not exists recruit_candidate_id uuid null references public.recruit_candidates (id) on delete set null;

create index if not exists idx_users_recruit_candidate on public.users (recruit_candidate_id);

create table if not exists public.hr_onboarding_wizard (
  user_id text primary key references public.users (id) on delete cascade,
  company_id text not null,
  recruit_candidate_id uuid null references public.recruit_candidates (id) on delete set null,
  current_step_index integer not null default 0 check (current_step_index >= 0 and current_step_index <= 7),
  steps_json jsonb not null default '{}'::jsonb,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  updated_by_user_id text null references public.users (id) on delete set null
);

create index if not exists idx_hr_onboarding_wizard_company on public.hr_onboarding_wizard (company_id);

create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  code text not null,
  title text not null,
  description text not null default '',
  category text not null check (category in ('mandatory', 'optional')),
  duration_minutes integer not null default 60,
  has_quiz_placeholder boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

create index if not exists idx_training_courses_company on public.training_courses (company_id, active);

create table if not exists public.training_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  user_id text not null references public.users (id) on delete cascade,
  course_id uuid not null references public.training_courses (id) on delete cascade,
  due_date date not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  completed_at timestamptz null,
  assigned_by text null references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create index if not exists idx_training_assignments_user on public.training_assignments (user_id, status);
create index if not exists idx_training_assignments_due on public.training_assignments (company_id, due_date);

-- RLS
alter table public.hr_onboarding_wizard enable row level security;
alter table public.training_courses enable row level security;
alter table public.training_assignments enable row level security;

drop policy if exists "nexa_hr_onboarding_wizard_select" on public.hr_onboarding_wizard;
create policy "nexa_hr_onboarding_wizard_select"
on public.hr_onboarding_wizard for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.hr_onboarding_wizard.user_id = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.hr_onboarding_wizard.user_id and sub."managerId" = me.id
      )
    )
  )
);

drop policy if exists "nexa_training_courses_select" on public.training_courses;
create policy "nexa_training_courses_select"
on public.training_courses for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me."companyId" = public.training_courses.company_id
  )
);

drop policy if exists "nexa_training_assignments_select" on public.training_assignments;
create policy "nexa_training_assignments_select"
on public.training_assignments for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or public.training_assignments.user_id = me.id
      or exists (
        select 1 from public.users sub
        where sub.id = public.training_assignments.user_id and sub."managerId" = me.id
      )
    )
  )
);

-- Seed catalogo demo (comp-1 e tenant demo secondario se presente)
insert into public.training_courses (company_id, code, title, description, category, duration_minutes, has_quiz_placeholder)
values
  ('comp-1', 'sicurezza-lavoro', 'Sicurezza sul lavoro', 'Normativa D.Lgs. 81/08, DPI, emergenze e cultura della sicurezza.', 'mandatory', 90, true),
  ('comp-1', 'gdpr-base', 'GDPR e privacy', 'Trattamento dati personali, diritti interessati e obblighi del dipendente.', 'mandatory', 60, true),
  ('comp-1', 'codice-etico', 'Codice etico aziendale', 'Valori, conflitti di interesse e canali di segnalazione.', 'mandatory', 45, true),
  ('comp-1', 'anti-harassment', 'Anti-harassment e rispetto', 'Prevenzione molestie, discriminazioni e ambiente inclusivo.', 'mandatory', 50, true),
  ('comp-1', 'excel-avanzato', 'Excel avanzato', 'Tabelle pivot, formule avanzate e automazioni per il lavoro quotidiano.', 'optional', 120, true),
  ('comp-1', 'public-speaking', 'Public speaking', 'Comunicazione efficace in riunioni e presentazioni.', 'optional', 90, true)
on conflict (company_id, code) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  duration_minutes = excluded.duration_minutes,
  active = true;

notify pgrst, 'reload schema';
