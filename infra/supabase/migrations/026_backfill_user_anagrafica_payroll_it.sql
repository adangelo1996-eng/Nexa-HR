-- Valori demo per campi payroll / fisco IT mancanti (anagrafica completa per calcolo cedolino).
update public.users
set
  "payrollItSector" = coalesce("payrollItSector", 'services'),
  "payrollInailPermille" = coalesce("payrollInailPermille", 3.2),
  "payrollTfrDivisor" = coalesce("payrollTfrDivisor", 13.5),
  "payrollAtecoCode" = coalesce("payrollAtecoCode", '62.01'),
  "payrollInailRiskDescription" = coalesce("payrollInailRiskDescription", 'Ufficio / rischio basso (demo)')
where
  "payrollItSector" is null
  or "payrollInailPermille" is null
  or "payrollTfrDivisor" is null
  or "payrollAtecoCode" is null
  or "payrollInailRiskDescription" is null;

update public.users
set
  "taxRegion" = coalesce(nullif(trim("taxRegion"), ''), 'LAZ'),
  "taxMunicipalityIt" = coalesce(nullif(trim("taxMunicipalityIt"), ''), 'Roma')
where jurisdiction = 'IT';
