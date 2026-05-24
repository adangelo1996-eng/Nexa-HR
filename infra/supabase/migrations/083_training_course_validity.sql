-- Validità corsi formazione (normativa locale): mesi di copertura dopo completamento.

alter table public.training_courses
  add column if not exists validity_months integer null
    check (validity_months is null or (validity_months >= 1 and validity_months <= 120));

comment on column public.training_courses.validity_months is
  'Mesi di validità della certificazione dopo completamento; null = senza scadenza di copertura.';

-- Aggiorna catalogo demo con validità tipiche (D.Lgs. 81/08, GDPR, codice etico, anti-harassment).
update public.training_courses
set validity_months = case code
  when 'sicurezza-lavoro' then 36
  when 'gdpr-base' then 24
  when 'codice-etico' then 24
  when 'anti-harassment' then 36
  when 'nexa-hr-piattaforma' then null
  when 'excel-avanzato' then null
  when 'public-speaking' then null
  else validity_months
end
where company_id = 'comp-1';

notify pgrst, 'reload schema';
