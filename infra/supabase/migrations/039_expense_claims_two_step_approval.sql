-- Note spese: approvazione a due livelli (responsabile → HR) prima dell'approvazione finale.
-- Ciclo: submitted → (responsabile OK) → pending_hr → (HR OK) → approved | rejected
-- Senza responsabile anagrafico/team lead: creazione diretta in pending_hr.

alter table expense_claims add column if not exists "managerApprovedBy" text null references users(id) on delete set null;
alter table expense_claims add column if not exists "managerApprovedAt" text null;
alter table expense_claims add column if not exists "hrApprovedBy" text null references users(id) on delete set null;
alter table expense_claims add column if not exists "hrApprovedAt" text null;

comment on column expense_claims."managerApprovedBy" is 'Utente responsabile che ha inviato la richiesta a HR';
comment on column expense_claims."managerApprovedAt" is 'Timestamp ISO approvazione responsabile';
comment on column expense_claims."hrApprovedBy" is 'Utente HR che ha approvato definitivamente';
comment on column expense_claims."hrApprovedAt" is 'Timestamp ISO approvazione HR';

create index if not exists idx_expense_claims_status_pending_hr on expense_claims (status) where status = 'pending_hr';
