-- Azzera residui anagrafica svizzera / AVS (solo Italia).
-- Per IBAN, telefono e indirizzi demo coerenti eseguire anche:
--   pnpm run seed:backfill-italy-anagrafica
-- oppure rieseguire `pnpm run seed:demo-users` (upsert su utenti già creati).

update public.users
set
  "avsNumber" = null,
  "taxCanton" = null,
  "taxMunicipality" = null
where
  "avsNumber" is not null
  or "taxCanton" is not null
  or "taxMunicipality" is not null;

comment on column public.users."avsNumber" is 'Deprecato: non usare (anagrafica solo IT; usare fiscalCode).';
