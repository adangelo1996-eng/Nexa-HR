-- Calendar / scheduling query performance (team work calendar, leave ranges)

create index if not exists idx_leave_plans_user_dates
  on public.leave_plans ("userId", "startDate", "endDate");

create index if not exists idx_workday_summaries_user_date
  on public.workday_summaries ("userId", date);

create index if not exists idx_shifts_user_start
  on public.shifts ("userId", "startAt");

create index if not exists idx_sickness_user_dates
  on public.sickness_events ("userId", "fromDate", "toDate");

notify pgrst, 'reload schema';
