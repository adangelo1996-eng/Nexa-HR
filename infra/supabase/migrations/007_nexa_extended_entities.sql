-- Note spese, turni, vault documenti, onboarding, innovation jobs, notifiche, campi retributivi utente

alter table users add column if not exists "baseSalaryMonthly" numeric null;
alter table users add column if not exists "taxCanton" text null;
alter table users add column if not exists "taxMunicipality" text null;

create table if not exists expense_claims (
  id text primary key,
  "userId" text not null references users(id) on delete cascade,
  "amountCents" integer not null,
  currency text not null,
  description text not null,
  "kmDistance" integer null,
  status text not null,
  "createdAt" text not null,
  "payslipPeriod" text null,
  "appliedPayslipId" text null
);

create table if not exists shifts (
  id text primary key,
  "userId" text not null references users(id) on delete cascade,
  "startAt" text not null,
  "endAt" text not null,
  "premiumCode" text null,
  status text not null default 'scheduled'
);

create table if not exists employee_documents (
  id text primary key,
  "userId" text not null references users(id) on delete cascade,
  kind text not null,
  title text not null,
  "mimeType" text null,
  "bodyBase64" text null,
  "storagePath" text null,
  "createdAt" text not null,
  "uploadedBy" text null
);

create table if not exists lifecycle_onboarding (
  "userId" text primary key references users(id) on delete cascade,
  phase text not null,
  "checklistJson" jsonb not null default '[]',
  "updatedAt" text not null
);

create table if not exists innovation_jobs (
  id text primary key,
  "userId" text not null references users(id) on delete cascade,
  module text not null,
  payload jsonb not null default '{}',
  status text not null,
  "createdAt" text not null,
  "resultJson" jsonb null
);

create table if not exists user_notifications (
  id text primary key,
  "userId" text not null references users(id) on delete cascade,
  title text not null,
  body text null,
  "read" boolean not null default false,
  kind text null,
  "createdAt" text not null
);

create index if not exists idx_expense_claims_user on expense_claims ("userId");
create index if not exists idx_expense_claims_status on expense_claims (status);
create index if not exists idx_shifts_user on shifts ("userId");
create index if not exists idx_employee_documents_user on employee_documents ("userId");
create index if not exists idx_innovation_jobs_user on innovation_jobs ("userId");
create index if not exists idx_user_notifications_user on user_notifications ("userId");
