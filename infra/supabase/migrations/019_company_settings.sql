-- Impostazioni aziendali per tenant (companyId allineato a users."companyId").

create table if not exists company_settings (
  "companyId" text primary key,
  settings jsonb not null default '{}'::jsonb,
  "updatedAt" timestamptz not null default now()
);

comment on table company_settings is 'Variabili HR/aziendali (anno fiscale, anagrafica leggera, custom). Letta/scritta tramite API backend (service role).';
