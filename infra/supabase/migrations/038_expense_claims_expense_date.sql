-- Data spesa documentale e periodo cedolino target (mese successivo alla data spesa)

alter table expense_claims add column if not exists "expenseDate" text null;

update expense_claims
set "expenseDate" = case
  when length(trim(coalesce("createdAt", ''))) >= 10
    then left(trim("createdAt"), 10)
  else to_char(current_date, 'YYYY-MM-DD')
end
where "expenseDate" is null;

alter table expense_claims alter column "expenseDate" set not null;

comment on column expense_claims."expenseDate" is 'Data spesa ISO YYYY-MM-DD; il rimborso è previsto nel cedolino del mese indicato in payslipPeriod';

-- Periodo cedolino (YYYY-MM) = mese calendario successivo al mese della expenseDate
update expense_claims
set "payslipPeriod" = to_char(
  (left("expenseDate", 7) || '-01')::timestamp with time zone + interval '1 month',
  'YYYY-MM'
)
where "payslipPeriod" is null
  and "expenseDate" ~ '^\d{4}-\d{2}-\d{2}$';

create index if not exists idx_expense_claims_expense_date on expense_claims ("expenseDate");
