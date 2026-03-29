-- Storico import massivo: un record per operazione (validate | apply), non per “account proprietario”.
-- Il backend usa SERVICE ROLE; nessuna RLS necessaria per questa tabella operativa.

create table if not exists nexa_import_events (
  id text primary key,
  kind text not null check (kind in ('validate', 'apply')),
  category text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status text not null,
  row_count integer not null default 0,
  created_count integer null,
  error_count integer not null default 0,
  file_size_bytes integer null,
  file_name text null,
  errors_snapshot jsonb null,
  actor_user_id text null,
  actor_email text null,
  audit_meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_nexa_import_events_finished_at
  on nexa_import_events (finished_at desc);

create index if not exists idx_nexa_import_events_category
  on nexa_import_events (category);

comment on table nexa_import_events is 'Audit storico import Excel Nexa HR (globale superuser, non filtrato per utente).';
