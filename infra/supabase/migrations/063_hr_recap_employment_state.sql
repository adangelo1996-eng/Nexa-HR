-- Stato occupazionale HR per recap (onboarding interno, offboarding).
alter table public.users add column if not exists "employmentState" text;

update public.users
set "employmentState" = 'active'
where "employmentState" is null;

alter table public.users alter column "employmentState" set default 'active';

alter table public.users alter column "employmentState" set not null;

alter table public.users drop constraint if exists users_employment_state_check;

alter table public.users
  add constraint users_employment_state_check
  check ("employmentState" in ('active', 'hr_onboarding', 'offboarding'));
