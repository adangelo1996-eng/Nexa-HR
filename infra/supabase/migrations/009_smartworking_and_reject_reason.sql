alter table approvals add column if not exists "rejectReason" text null;

create table if not exists smartworking_requests (
  id text primary key,
  "userId" text not null references users(id) on delete cascade,
  "day" text not null,
  note text,
  status text not null default 'pending',
  "approverId" text references users(id) on delete set null,
  "decisionAt" text,
  "rejectReason" text,
  "createdAt" text not null
);

create index if not exists idx_sw_req_user on smartworking_requests ("userId");
create index if not exists idx_sw_req_status on smartworking_requests (status);
