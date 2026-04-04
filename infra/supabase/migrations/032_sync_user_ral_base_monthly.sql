-- Allinea RAL ("annualGrossSalary") e stipendio mensile ("baseSalaryMonthly") con "payMonthsPerYear".
-- Idempotente: eseguire dopo popolamento anagrafica o quando i valori risultano disallineati.

update users u
set "baseSalaryMonthly" = round(
  (u."annualGrossSalary"::numeric / nullif(u."payMonthsPerYear", 0))::numeric,
  2
)
where u."annualGrossSalary" is not null
  and u."annualGrossSalary"::numeric > 0
  and u."payMonthsPerYear" is not null
  and u."payMonthsPerYear" > 0;

update users u
set "annualGrossSalary" = round(
  (u."baseSalaryMonthly"::numeric * u."payMonthsPerYear"::numeric)::numeric,
  2
)
where (u."annualGrossSalary" is null or u."annualGrossSalary"::numeric <= 0)
  and u."baseSalaryMonthly" is not null
  and u."baseSalaryMonthly"::numeric > 0
  and u."payMonthsPerYear" is not null
  and u."payMonthsPerYear" > 0;
