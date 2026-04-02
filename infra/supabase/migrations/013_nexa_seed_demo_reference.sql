-- Dati di riferimento demo: 5 centri di costo e 20 ruoli catalogo (idempotente).
-- Gli utenti (Auth + public.users) vanno creati con scripts/nexa-seed-demo-users.ts

insert into cost_centers (id, code, name, description) values
  ('nexa-cc-1', '8801000001', 'Operations & Delivery', 'Progetti, delivery e PMO'),
  ('nexa-cc-2', '8801000002', 'Engineering & Product', 'Sviluppo software, prodotto e QA'),
  ('nexa-cc-3', '8801000003', 'People & Culture', 'HR, formazione e workplace'),
  ('nexa-cc-4', '8801000004', 'Finance & Compliance', 'Amministrazione, controller e compliance'),
  ('nexa-cc-5', '8801000005', 'Go-to-market & Partner', 'Vendita, marketing e alleanze')
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  description = excluded.description;

insert into roles (id, name, description, permissions) values
  ('nexa-r-01', 'Chief People Officer', 'Strategia HR e people operations', '["*"]'::jsonb),
  ('nexa-r-02', 'HR Business Partner', 'Consulenza HR ai manager', '["read:team", "nexa.approvals:read", "nexa.approvals:write", "nexa.admin_users:read"]'::jsonb),
  ('nexa-r-03', 'Talent Acquisition Specialist', 'Recruiting e employer branding', '["read:team", "nexa.admin_users:read"]'::jsonb),
  ('nexa-r-04', 'Payroll & Compensation Analyst', 'Payroll, benchmark e policy retributive', '["read:team", "nexa.payslips:read", "nexa.payroll:read"]'::jsonb),
  ('nexa-r-05', 'Learning & Development Manager', 'Formazione e competency framework', '["read:team", "nexa.lifecycle:read"]'::jsonb),
  ('nexa-r-06', 'People Analytics Lead', 'Workforce analytics e reporting', '["read:team", "nexa.reports_hr:read"]'::jsonb),
  ('nexa-r-07', 'Workplace & Office Manager', 'Facilities e employee experience', '["read:team", "nexa.expenses:read"]'::jsonb),
  ('nexa-r-08', 'Employee Relations Specialist', 'Relazioni industriali e policy', '["read:team", "nexa.approvals:read"]'::jsonb),
  ('nexa-r-09', 'Engineering Manager', 'Lead team engineering', '["read:team", "approve:leave", "approve:sickness"]'::jsonb),
  ('nexa-r-10', 'Senior Backend Engineer', 'Progettazione API e servizi', '["clock", "read:self", "nexa.expenses:write"]'::jsonb),
  ('nexa-r-11', 'Senior Frontend Engineer', 'UI e client web', '["clock", "read:self", "nexa.expenses:write"]'::jsonb),
  ('nexa-r-12', 'DevOps Engineer', 'CI/CD e infrastruttura', '["clock", "read:self"]'::jsonb),
  ('nexa-r-13', 'QA Engineer', 'Quality assurance e test', '["clock", "read:self"]'::jsonb),
  ('nexa-r-14', 'Product Manager', 'Discovery e roadmap prodotto', '["read:team", "read:self"]'::jsonb),
  ('nexa-r-15', 'UX Researcher', 'Ricerca utente e design', '["read:self", "nexa.expenses:write"]'::jsonb),
  ('nexa-r-16', 'Project Manager', 'Pianificazione e stakeholder', '["read:team", "read:self"]'::jsonb),
  ('nexa-r-17', 'Finance Controller', 'Controllo gestione e budget', '["read:team", "nexa.reports_hr:read"]'::jsonb),
  ('nexa-r-18', 'Account Manager', 'Relazione clienti e revenue', '["read:team", "read:self"]'::jsonb),
  ('nexa-r-19', 'Marketing Lead', 'Demand generation e brand', '["read:self"]'::jsonb),
  ('nexa-r-20', 'IT Support Specialist', 'Supporto utenti e asset IT', '["clock", "read:self"]'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  permissions = excluded.permissions;
