-- Limiti espliciti su accordo annuale (mirror da hr_remote_work_policy / batch Cowork).

alter table public.smartworking_agreements
  add column if not exists allowed_days_per_week smallint null
    check (allowed_days_per_week is null or (allowed_days_per_week >= 0 and allowed_days_per_week <= 7)),
  add column if not exists allowed_days_per_month smallint null
    check (allowed_days_per_month is null or (allowed_days_per_month >= 0 and allowed_days_per_month <= 31));

comment on column public.smartworking_agreements.allowed_days_per_week is
  'Max giorni SW/settimana da contratto o accordo (allineato a hr_remote_work_policy).';
comment on column public.smartworking_agreements.allowed_days_per_month is
  'Max giorni SW/mese da contratto o accordo.';

notify pgrst, 'reload schema';
