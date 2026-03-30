create table if not exists payslip_reads (
  "userId" text not null references users(id) on delete cascade,
  "payslipId" text not null references payslips(id) on delete cascade,
  "readAt" text not null,
  primary key ("userId", "payslipId")
);

create index if not exists idx_payslip_reads_user on payslip_reads ("userId");
