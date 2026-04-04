-- Anagrafica / fisco / contratto IT estesi (cedolino, detrazioni, RAL, domicilio).

alter table users add column if not exists "fiscalCode" text null;
alter table users add column if not exists "maritalStatus" text null;
alter table users add column if not exists "dependentsChildren" integer not null default 0;
alter table users add column if not exists "dependentSpouse" boolean not null default false;
alter table users add column if not exists "disabilityFlag" boolean not null default false;
alter table users add column if not exists "taxDomicileMunicipalityIt" text null;
alter table users add column if not exists "taxDomicileSameAsResidence" boolean not null default true;
alter table users add column if not exists "payMonthsPerYear" integer not null default 13;
alter table users add column if not exists "annualGrossSalary" numeric null;
alter table users add column if not exists "partTimeModality" text null;
alter table users add column if not exists "ccnlCode" text null;
alter table users add column if not exists "ccnlLevel" text null;
alter table users add column if not exists "legalCategory" text null;
alter table users add column if not exists "contractEndDate" text null;
alter table users add column if not exists "fixedSupplementMonthly" numeric null;
alter table users add column if not exists "garnishmentMonthlyEstimate" numeric null;
alter table users add column if not exists "fringeBenefitYtdEuros" numeric null;
alter table users add column if not exists "contractFixedTerm" boolean not null default false;

alter table users drop constraint if exists users_pay_months_per_year_check;
alter table users add constraint users_pay_months_per_year_check
  check ("payMonthsPerYear" in (12, 13, 14));

comment on column users."fiscalCode" is 'Codice fiscale (16 caratteri, formato plausibile in demo).';
comment on column users."maritalStatus" is 'Stato civile (es. single, married, divorced, widowed, civil_union).';
comment on column users."dependentsChildren" is 'Numero figli a carico (detrazioni / soglie fringe).';
comment on column users."dependentSpouse" is 'Coniuge a carico ai fini delle detrazioni.';
comment on column users."disabilityFlag" is 'Flag disabilità / riduzione capacità (detrazioni).';
comment on column users."taxDomicileMunicipalityIt" is 'Comune di domicilio fiscale IT (addizionale comunale se diverso da residenza).';
comment on column users."taxDomicileSameAsResidence" is 'Se true, domicilio fiscale = comune di residenza dichiarato.';
comment on column users."payMonthsPerYear" is 'Mensilità contrattuali (12, 13 o 14) per riparto RAL.';
comment on column users."annualGrossSalary" is 'RAL lorda annua (fonte primaria stipendio con payMonthsPerYear).';
comment on column users."partTimeModality" is 'Modalità part-time: full, horizontal, vertical, mixed.';
comment on column users."ccnlCode" is 'Riferimento CCNL (testo / codice).';
comment on column users."ccnlLevel" is 'Livello / inquadramento CCNL.';
comment on column users."legalCategory" is 'Categoria giuridica: operaio, impiegato, quadro, dirigente.';
comment on column users."contractEndDate" is 'Scadenza contratto (YYYY-MM-DD) se determinato.';
comment on column users."fixedSupplementMonthly" is 'Integrazione fissa mensile (competenza).';
comment on column users."garnishmentMonthlyEstimate" is 'Stima trattenute / pignoramento mensile.';
comment on column users."fringeBenefitYtdEuros" is 'Fringe benefit cumulato anno (YTD, €).';
comment on column users."contractFixedTerm" is 'Contratto a tempo determinato (incide su detrazioni art.13 — modello semplificato).';
