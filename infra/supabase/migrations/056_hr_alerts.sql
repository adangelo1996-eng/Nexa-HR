-- Alert HR proattivi (regole + metriche blocco 2); dedupe su alert aperti.

create table if not exists public.hr_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  rule_key text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  body text not null default '',
  metric_payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  status text not null default 'open' check (status in ('open', 'ack', 'dismissed')),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz null,
  acknowledged_by_user_id text null references public.users (id) on delete set null
);

create unique index if not exists idx_hr_alerts_open_dedupe
  on public.hr_alerts (company_id, dedupe_key)
  where status = 'open';

create index if not exists idx_hr_alerts_company_created
  on public.hr_alerts (company_id, created_at desc);

comment on table public.hr_alerts is 'Alert generati da regole (turnover, spese, ecc.); notifiche in-app opzionali.';

alter table public.hr_alerts enable row level security;

drop policy if exists "nexa_hr_alerts_select_admin" on public.hr_alerts;
create policy "nexa_hr_alerts_select_admin"
on public.hr_alerts for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_alerts.company_id
  )
);

drop policy if exists "nexa_hr_alerts_write_admin" on public.hr_alerts;
create policy "nexa_hr_alerts_write_admin"
on public.hr_alerts for all to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_alerts.company_id
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.hr_alerts.company_id
  )
);

notify pgrst, 'reload schema';
