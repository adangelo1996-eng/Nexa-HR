create table if not exists users (
  id text primary key,
  email text not null unique,
  "fullName" text not null,
  role text not null,
  "managerId" text null,
  "companyId" text not null
);

create table if not exists time_entries (
  id text primary key,
  "userId" text not null references users(id) on delete cascade,
  type text not null,
  at text not null
);

create table if not exists workday_summaries (
  "userId" text not null references users(id) on delete cascade,
  date text not null,
  "minutesWorked" integer not null,
  mode text not null,
  primary key ("userId", date)
);

create table if not exists leave_plans (
  id text primary key,
  "userId" text not null references users(id) on delete cascade,
  "startDate" text not null,
  "endDate" text not null,
  status text not null,
  version integer not null
);

create table if not exists sickness_events (
  id text primary key,
  "userId" text not null references users(id) on delete cascade,
  "fromDate" text not null,
  "toDate" text not null,
  "documentUrl" text not null,
  status text not null
);

create table if not exists approvals (
  id text primary key,
  "entityId" text not null,
  type text not null,
  "requestedBy" text not null,
  "approverId" text null,
  status text not null,
  at text not null
);

create table if not exists delegations (
  "managerId" text not null references users(id) on delete cascade,
  "delegateManagerId" text not null references users(id) on delete cascade,
  "from" text not null,
  "to" text not null
);

create table if not exists payslips (
  id text primary key,
  "userId" text not null references users(id) on delete cascade,
  period text not null,
  "grossSalary" numeric not null,
  "netSalary" numeric not null,
  lines jsonb not null,
  "pdfUrl" text not null
);

alter table users add column if not exists "firstName" text null;
alter table users add column if not exists "lastName" text null;
alter table users add column if not exists "dailyTargetSeconds" integer not null default 28800;
alter table users add column if not exists "vacationAllowanceDays" integer not null default 22;
alter table users add column if not exists "birthDate" text null;
alter table users add column if not exists phone text null;
alter table users add column if not exists address text null;

create table if not exists leave_balances (
  "userId" text not null references users(id) on delete cascade,
  year integer not null,
  "allocatedDays" integer not null,
  "usedDays" integer not null default 0,
  "residualDays" integer not null,
  primary key ("userId", year)
);

create index if not exists idx_time_entries_userid on time_entries ("userId");
create index if not exists idx_leave_plans_userid on leave_plans ("userId");
create index if not exists idx_sickness_events_userid on sickness_events ("userId");
create index if not exists idx_payslips_userid on payslips ("userId");
create index if not exists idx_approvals_requestedby on approvals ("requestedBy");
