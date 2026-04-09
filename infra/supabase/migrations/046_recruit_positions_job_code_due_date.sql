-- Recruiting: job code (short ID) + due date + per-company/year progressive sequence.

create table if not exists public.recruit_job_code_seq (
  company_id text not null,
  year int not null,
  next_number int not null default 1,
  primary key (company_id, year)
);

-- Returns the next progressive number (1..N) for (company_id, year), atomically.
create or replace function public.recruit_next_job_code_number(p_company_id text, p_year int)
returns int
language plpgsql
as $$
declare
  assigned int;
begin
  insert into public.recruit_job_code_seq (company_id, year, next_number)
  values (p_company_id, p_year, 2)
  on conflict (company_id, year) do update
  set next_number = public.recruit_job_code_seq.next_number + 1
  returning public.recruit_job_code_seq.next_number - 1 into assigned;

  return assigned;
end;
$$;

alter table public.recruit_positions
  add column if not exists job_code text,
  add column if not exists due_date date;

-- Backfill existing positions with a stable unique code if missing.
update public.recruit_positions
set job_code =
  'HR-' ||
  extract(year from created_at)::int ||
  '-' ||
  upper(substr(replace(id::text, '-', ''), 1, 6))
where job_code is null or job_code = '';

alter table public.recruit_positions alter column job_code set not null;

create unique index if not exists idx_recruit_positions_company_job_code
  on public.recruit_positions (company_id, job_code);

alter table public.recruit_job_code_seq enable row level security;
alter table public.recruit_positions enable row level security;
