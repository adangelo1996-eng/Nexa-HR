-- Workflow cedolini: bozza / pubblicazione, periodo variabili, audit pubblicazione.
-- Default published per righe esistenti (comportamento invariato per ambienti già popolati).

alter table payslips
  add column if not exists status text not null default 'published';

alter table payslips
  add column if not exists "publishedAt" timestamptz null;

alter table payslips
  add column if not exists "publishedByUserId" text null;

alter table payslips
  add column if not exists "computedAt" timestamptz null;

alter table payslips
  add column if not exists "variablePeriod" text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payslips_status_check'
  ) then
    alter table payslips
      add constraint payslips_status_check check (status in ('draft', 'published'));
  end if;
end $$;

comment on column payslips.status is 'draft: visibile solo a chi elabora; published: inviato al dipendente su Nexa';
comment on column payslips."variablePeriod" is 'YYYY-MM usato per straordinari/ferie/malattia/SW se diverso dalla competenza';

-- Un solo cedolino per dipendente e periodo: rimuove duplicati mantenendo id più recente.
delete from payslips
where id in (
  select id
  from (
    select id,
           row_number() over (
             partition by "userId", period
             order by id desc
           ) as rn
    from payslips
  ) x
  where x.rn > 1
);

create unique index if not exists ux_payslips_user_period on payslips ("userId", period);

-- Roadmap conguagli (Fase 2+): struttura minima annuale per rate IRPEF/comunale/730.
create table if not exists payroll_annual_state (
  id text primary key,
  "userId" text not null references users (id) on delete cascade,
  year integer not null,
  notes text null,
  "updatedAt" timestamptz not null default now(),
  unique ("userId", year)
);

create index if not exists idx_payroll_annual_state_user on payroll_annual_state ("userId");

comment on table payroll_annual_state is 'Estensioni future: conguagli, residui fiscali, rate 730 — Fase 1 solo placeholder schema';
