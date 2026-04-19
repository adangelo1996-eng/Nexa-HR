-- Audit richieste/risposte Centro HR (testo cifrato applicativo, retention purge_after).
create table if not exists public.hr_center_llm_audit (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  actor_user_id text not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('analytics', 'contract', 'recap')),
  prompt_cipher text,
  response_cipher text,
  model text,
  created_at timestamptz not null default now(),
  purge_after timestamptz not null
);

create index if not exists idx_hr_center_llm_audit_purge on public.hr_center_llm_audit (purge_after);
create index if not exists idx_hr_center_llm_audit_company on public.hr_center_llm_audit (company_id, created_at desc);

alter table public.hr_center_llm_audit enable row level security;
