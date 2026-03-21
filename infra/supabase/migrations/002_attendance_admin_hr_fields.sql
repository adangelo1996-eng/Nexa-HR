create table if not exists roles (
  id text primary key,
  name text not null unique,
  description text null,
  permissions jsonb not null default '[]'::jsonb
);

create table if not exists cost_centers (
  id text primary key,
  code text not null unique,
  name text not null,
  description text null
);

alter table users add column if not exists "roleId" text null;
alter table users add column if not exists "costCenterId" text null;
alter table users add column if not exists "contractType" text null;
alter table users add column if not exists "weeklyContractHours" numeric not null default 40;
alter table users add column if not exists "avsNumber" text null;
alter table users add column if not exists iban text null;
alter table users add column if not exists "bankName" text null;
alter table users add column if not exists "bicSwift" text null;
alter table users add column if not exists "accountHolder" text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_roleid_fkey'
  ) then
    alter table users
      add constraint users_roleid_fkey
      foreign key ("roleId") references roles(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_costcenterid_fkey'
  ) then
    alter table users
      add constraint users_costcenterid_fkey
      foreign key ("costCenterId") references cost_centers(id) on delete set null;
  end if;
end $$;

alter table workday_summaries add column if not exists "workedSeconds" integer not null default 0;
alter table workday_summaries add column if not exists "overtimeSeconds" integer not null default 0;

update workday_summaries ws
set "workedSeconds" = greatest(coalesce(ws."workedSeconds", 0), coalesce(ws."minutesWorked", 0) * 60);

update workday_summaries ws
set "overtimeSeconds" = greatest(
  0,
  coalesce(ws."workedSeconds", coalesce(ws."minutesWorked", 0) * 60) -
  coalesce(
    (
      select round((coalesce(u."weeklyContractHours", 40)::numeric / 5) * 3600)::int
      from users u
      where u.id = ws."userId"
    ),
    28800
  )
);

create index if not exists idx_workday_summaries_date on workday_summaries (date);
create index if not exists idx_users_roleid on users ("roleId");
create index if not exists idx_users_costcenterid on users ("costCenterId");
