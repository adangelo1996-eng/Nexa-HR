-- Parametri contributivi IT (TFR / INPS datore / INAIL) per budget e consuntivo cedolino.

alter table users add column if not exists "payrollItSector" text null;
alter table users add column if not exists "payrollEmployerInpsPercent" numeric null;
alter table users add column if not exists "payrollInailPermille" numeric null;
alter table users add column if not exists "payrollTfrDivisor" numeric null;
alter table users add column if not exists "payrollAtecoCode" text null;
alter table users add column if not exists "payrollInailRiskDescription" text null;

comment on column users."payrollItSector" is 'Preset settore IVS datore (industry, commerce, services, tourism, credit_insurance, agriculture, custom).';
comment on column users."payrollEmployerInpsPercent" is 'Override percentuale IVS datore (es. 24.48).';
comment on column users."payrollInailPermille" is 'Premio INAIL (permille su imponibile lordo mensile).';
comment on column users."payrollTfrDivisor" is 'Divisore accantonamento TFR mensile lordo (default 13.5).';
comment on column users."payrollAtecoCode" is 'Codice Ateco / attività (riferimento tariffa INAIL).';
comment on column users."payrollInailRiskDescription" is 'Classe rischio / mansione INAIL (testo libero, es. basso/medio/alto).';

alter table cost_centers add column if not exists "payrollItSector" text null;
alter table cost_centers add column if not exists "payrollDefaultInailPermille" numeric null;

comment on column cost_centers."payrollItSector" is 'Default settore IVS per dipendenti del reparto senza override in anagrafica.';
comment on column cost_centers."payrollDefaultInailPermille" is 'Default premio INAIL (permille) per il reparto se non sul dipendente.';
