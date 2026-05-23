-- Expanded personnel budget assumptions for AI-assisted compilation.

alter table public.personnel_budget_assumptions
  add column if not exists employee_inps_percent numeric,
  add column if not exists inflation_percent_annual numeric,
  add column if not exists payroll_indexation_percent numeric,
  add column if not exists default_pay_months_per_year smallint,
  add column if not exists default_weekly_contract_hours numeric,
  add column if not exists planned_new_hires integer,
  add column if not exists planned_exits integer,
  add column if not exists avg_new_hire_ral_annual numeric,
  add column if not exists employer_inps_discount_percent numeric,
  add column if not exists overtime_budget_percent_on_gross numeric,
  add column if not exists travel_budget_per_fte_monthly numeric,
  add column if not exists compilation_notes text not null default '';

comment on column public.personnel_budget_assumptions.employee_inps_percent is
  'INPS dipendente (% su lordo) per stime budget se non da profilo.';
comment on column public.personnel_budget_assumptions.inflation_percent_annual is
  'Inflazione annua attesa (%) per indicizzazione costi.';
comment on column public.personnel_budget_assumptions.payroll_indexation_percent is
  'Aumento retributivo medio annuo (%) oltre inflazione.';
comment on column public.personnel_budget_assumptions.default_pay_months_per_year is
  'Mensilità standard (13 o 14) per nuove assunzioni pianificate.';
comment on column public.personnel_budget_assumptions.default_weekly_contract_hours is
  'Ore settimanali contratto default.';
comment on column public.personnel_budget_assumptions.planned_new_hires is
  'Assunzioni nette pianificate nell''anno.';
comment on column public.personnel_budget_assumptions.planned_exits is
  'Uscite pianificate nell''anno.';
comment on column public.personnel_budget_assumptions.avg_new_hire_ral_annual is
  'RAL media annua stimata per nuove assunzioni.';
comment on column public.personnel_budget_assumptions.employer_inps_discount_percent is
  'Sconto contributivo datore aggregato (%).';
comment on column public.personnel_budget_assumptions.overtime_budget_percent_on_gross is
  'Budget straordinari (% sul lordo mensile).';
comment on column public.personnel_budget_assumptions.travel_budget_per_fte_monthly is
  'Budget trasferte medio per FTE (€/mese).';
comment on column public.personnel_budget_assumptions.compilation_notes is
  'Note libere per contesto compilazione budget (anche AI).';

notify pgrst, 'reload schema';
