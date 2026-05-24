-- Profilo aziendale demo SYNAPSE (comp-1): prefill contratti e pagina Dati azienda.

insert into public.company_settings ("companyId", settings, "updatedAt")
values (
  'comp-1',
  jsonb_build_object(
    'fiscalYearStartMonth', 1,
    'companyLegalName', 'CASA DAMIANI S.P.A.',
    'companyAddress', 'Via Synapse 1, 20121 Milano (MI), Italia',
    'companyVatNumber', 'IT01234567890',
    'companyRegistrationInfo', 'REA MI-1234567 · CCIAA Milano · Cap. soc. € 100.000 i.v.',
    'companyCcnl', 'Commercio — Terziario distribuito e servizi',
    'defaultCurrency', 'EUR',
    'weeklyFullTimeHours', 40,
    'payrollInstallmentMonths', 13,
    'customVariables', '{}'::jsonb
  ),
  now()
)
on conflict ("companyId") do update set
  settings = coalesce(public.company_settings.settings, '{}'::jsonb) || excluded.settings,
  "updatedAt" = now();
