-- Garantisce colonne workflow cedolini e ricarica la cache schema PostgREST.
-- Risolve: "Could not find the 'computedAt' column of 'payslips' in the schema cache" (PGRST204)
-- quando la migrazione 030 è applicata ma l'API non ha ancora visto le nuove colonne.

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

notify pgrst, 'reload schema';
