-- Garantisce colonne payroll IT su public.users (024) e ricarica la cache schema PostgREST.
-- Risolve: "Could not find the 'payrollAtecoCode' column of 'users' in the schema cache" (PGRST204)
-- se la migration 024 non è mai stata applicata o PostgREST non ha ricaricato lo schema.

alter table public.users add column if not exists "payrollItSector" text null;
alter table public.users add column if not exists "payrollEmployerInpsPercent" numeric null;
alter table public.users add column if not exists "payrollInailPermille" numeric null;
alter table public.users add column if not exists "payrollTfrDivisor" numeric null;
alter table public.users add column if not exists "payrollAtecoCode" text null;
alter table public.users add column if not exists "payrollInailRiskDescription" text null;

comment on column public.users."payrollItSector" is 'Preset settore IVS datore (industry, commerce, services, tourism, credit_insurance, agriculture, custom).';
comment on column public.users."payrollEmployerInpsPercent" is 'Override percentuale IVS datore (es. 24.48).';
comment on column public.users."payrollInailPermille" is 'Premio INAIL (permille su imponibile lordo mensile).';
comment on column public.users."payrollTfrDivisor" is 'Divisore accantonamento TFR mensile lordo (default 13.5).';
comment on column public.users."payrollAtecoCode" is 'Codice Ateco / attività (riferimento tariffa INAIL).';
comment on column public.users."payrollInailRiskDescription" is 'Classe rischio / mansione INAIL (testo libero, es. basso/medio/alto).';

notify pgrst, 'reload schema';
