-- Profilo fiscale IT, foto, tipo permesso su leave, festività aziendali, bucket storage foto.

alter table users add column if not exists jurisdiction text not null default 'CH';
alter table users add column if not exists "taxRegion" text null;
alter table users add column if not exists "taxMunicipalityIt" text null;
alter table users add column if not exists "profilePhotoPath" text null;

comment on column users.jurisdiction is 'Profilo payroll: CH o IT.';
comment on column users."taxRegion" is 'Regione IT per addizionale (es. LAZ).';
comment on column users."taxMunicipalityIt" is 'Comune di residenza IT (testo libero o codice).';
comment on column users."profilePhotoPath" is 'Path oggetto in storage employee-photos.';

alter table leave_plans add column if not exists kind text not null default 'annual';

comment on column leave_plans.kind is 'annual = ferie; rol = permesso ROL (non scala saldo ferie).';

create table if not exists company_holidays (
  id text primary key,
  "companyId" text not null,
  day text not null,
  name text not null
);

create index if not exists idx_company_holidays_company_day on company_holidays ("companyId", day);

-- Bucket per foto dipendente (upload da backend con service role).
insert into storage.buckets (id, name, public)
values ('employee-photos', 'employee-photos', false)
on conflict (id) do nothing;

-- Festività nazionali IT (demo 2026) per companyId demo.
insert into company_holidays (id, "companyId", day, name) values
  ('nexa-h-it-26-01-01', 'comp-1', '2026-01-01', 'Capodanno'),
  ('nexa-h-it-26-01-06', 'comp-1', '2026-01-06', 'Epifania'),
  ('nexa-h-it-26-04-25', 'comp-1', '2026-04-25', 'Festa della Liberazione'),
  ('nexa-h-it-26-05-01', 'comp-1', '2026-05-01', 'Festa del Lavoro'),
  ('nexa-h-it-26-06-02', 'comp-1', '2026-06-02', 'Festa della Repubblica'),
  ('nexa-h-it-26-08-15', 'comp-1', '2026-08-15', 'Ferragosto'),
  ('nexa-h-it-26-11-01', 'comp-1', '2026-11-01', 'Ognissanti'),
  ('nexa-h-it-26-12-08', 'comp-1', '2026-12-08', 'Immacolata'),
  ('nexa-h-it-26-12-25', 'comp-1', '2026-12-25', 'Natale'),
  ('nexa-h-it-26-12-26', 'comp-1', '2026-12-26', 'Santo Stefano')
on conflict (id) do nothing;
