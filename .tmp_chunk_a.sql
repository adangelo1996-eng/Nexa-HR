INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '6cf802ea-332f-4720-88bf-bfa3ba43c49b'::uuid, 'authenticated', 'authenticated', 'giulia.ferrari@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Giulia Ferrari"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('giulia.ferrari@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, email, created_at, updated_at)
SELECT gen_random_uuid(), '6cf802ea-332f-4720-88bf-bfa3ba43c49b', '6cf802ea-332f-4720-88bf-bfa3ba43c49b'::uuid, jsonb_build_object('sub', '6cf802ea-332f-4720-88bf-bfa3ba43c49b', 'email', 'giulia.ferrari@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', 'giulia.ferrari@synapse.com', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '6cf802ea-332f-4720-88bf-bfa3ba43c49b'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = '6cf802ea-332f-4720-88bf-bfa3ba43c49b'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('6cf802ea-332f-4720-88bf-bfa3ba43c49b', 'giulia.ferrari@synapse.com', 'Giulia Ferrari', 'admin', NULL, 'comp-1', 'Giulia', 'Ferrari', 28800, 25, '1982-04-12', '+41 91 500 1101', 'Via Borghetto 4, 6900 Lugano', 'nexa-r-01', 'nexa-cc-3', 'indeterminato', 40, '756.1234.5678.91', 'CH93 0076 2011 6238 5295 7', 'UBS Switzerland AG', 'UBSWCHZH80A', 'Giulia Ferrari', 9800, 'TI', 'Lugano', '2018-01-15')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  "fullName" = EXCLUDED."fullName",
  role = EXCLUDED.role,
  "managerId" = EXCLUDED."managerId",
  "firstName" = EXCLUDED."firstName",
  "lastName" = EXCLUDED."lastName",
  "dailyTargetSeconds" = EXCLUDED."dailyTargetSeconds",
  "vacationAllowanceDays" = EXCLUDED."vacationAllowanceDays",
  "birthDate" = EXCLUDED."birthDate",
  phone = EXCLUDED.phone,
  address = EXCLUDED.address,
  "roleId" = EXCLUDED."roleId",
  "costCenterId" = EXCLUDED."costCenterId",
  "contractType" = EXCLUDED."contractType",
  "weeklyContractHours" = EXCLUDED."weeklyContractHours",
  "avsNumber" = EXCLUDED."avsNumber",
  iban = EXCLUDED.iban,
  "bankName" = EXCLUDED."bankName",
  "bicSwift" = EXCLUDED."bicSwift",
  "accountHolder" = EXCLUDED."accountHolder",
  "baseSalaryMonthly" = EXCLUDED."baseSalaryMonthly",
  "taxCanton" = EXCLUDED."taxCanton",
  "taxMunicipality" = EXCLUDED."taxMunicipality",
  "hireDate" = EXCLUDED."hireDate";


INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'f4042513-0aaa-47b1-a15b-c89ba455a9d8'::uuid, 'authenticated', 'authenticated', 'marco.bernasconi@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Marco Bernasconi"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('marco.bernasconi@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, email, created_at, updated_at)
SELECT gen_random_uuid(), 'f4042513-0aaa-47b1-a15b-c89ba455a9d8', 'f4042513-0aaa-47b1-a15b-c89ba455a9d8'::uuid, jsonb_build_object('sub', 'f4042513-0aaa-47b1-a15b-c89ba455a9d8', 'email', 'marco.bernasconi@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', 'marco.bernasconi@synapse.com', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = 'f4042513-0aaa-47b1-a15b-c89ba455a9d8'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = 'f4042513-0aaa-47b1-a15b-c89ba455a9d8'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('f4042513-0aaa-47b1-a15b-c89ba455a9d8', 'marco.bernasconi@synapse.com', 'Marco Bernasconi', 'manager_controllo_gestione', '6cf802ea-332f-4720-88bf-bfa3ba43c49b', 'comp-1', 'Marco', 'Bernasconi', 28800, 25, '1985-09-03', '+41 91 500 1102', 'Via Pretorio 12, 6900 Lugano', 'nexa-r-09', 'nexa-cc-2', 'indeterminato', 40, '756.2234.5678.12', 'CH12 0483 5012 3456 7890 0', 'Credit Suisse', 'CRESCHZZ80A', 'Marco Bernasconi', 8900, 'TI', 'Lugano', '2019-03-01')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  "fullName" = EXCLUDED."fullName",
  role = EXCLUDED.role,
  "managerId" = EXCLUDED."managerId",
  "firstName" = EXCLUDED."firstName",
  "lastName" = EXCLUDED."lastName",
  "dailyTargetSeconds" = EXCLUDED."dailyTargetSeconds",
  "vacationAllowanceDays" = EXCLUDED."vacationAllowanceDays",
  "birthDate" = EXCLUDED."birthDate",
  phone = EXCLUDED.phone,
  address = EXCLUDED.address,
  "roleId" = EXCLUDED."roleId",
  "costCenterId" = EXCLUDED."costCenterId",
  "contractType" = EXCLUDED."contractType",
  "weeklyContractHours" = EXCLUDED."weeklyContractHours",
  "avsNumber" = EXCLUDED."avsNumber",
  iban = EXCLUDED.iban,
  "bankName" = EXCLUDED."bankName",
  "bicSwift" = EXCLUDED."bicSwift",
  "accountHolder" = EXCLUDED."accountHolder",
  "baseSalaryMonthly" = EXCLUDED."baseSalaryMonthly",
  "taxCanton" = EXCLUDED."taxCanton",
  "taxMunicipality" = EXCLUDED."taxMunicipality",
  "hireDate" = EXCLUDED."hireDate";


INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '9a0b7f7f-0073-4eef-a68c-e78bf78bb260'::uuid, 'authenticated', 'authenticated', 'elena.rossi@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Elena Rossi"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('elena.rossi@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, email, created_at, updated_at)
SELECT gen_random_uuid(), '9a0b7f7f-0073-4eef-a68c-e78bf78bb260', '9a0b7f7f-0073-4eef-a68c-e78bf78bb260'::uuid, jsonb_build_object('sub', '9a0b7f7f-0073-4eef-a68c-e78bf78bb260', 'email', 'elena.rossi@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', 'elena.rossi@synapse.com', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '9a0b7f7f-0073-4eef-a68c-e78bf78bb260'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = '9a0b7f7f-0073-4eef-a68c-e78bf78bb260'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('9a0b7f7f-0073-4eef-a68c-e78bf78bb260', 'elena.rossi@synapse.com', 'Elena Rossi', 'manager_controllo_gestione', '6cf802ea-332f-4720-88bf-bfa3ba43c49b', 'comp-1', 'Elena', 'Rossi', 28800, 25, '1987-11-21', '+41 91 500 1103', 'Riva Paradiso 3, Paradiso', 'nexa-r-02', 'nexa-cc-5', 'indeterminato', 40, '756.3234.5678.23', 'CH45 0900 0000 1234 5678 1', 'PostFinance', 'POFICHBEXXX', 'Elena Rossi', 8600, 'TI', 'Paradiso', '2019-06-10')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  "fullName" = EXCLUDED."fullName",
  role = EXCLUDED.role,
  "managerId" = EXCLUDED."managerId",
  "firstName" = EXCLUDED."firstName",
  "lastName" = EXCLUDED."lastName",
  "dailyTargetSeconds" = EXCLUDED."dailyTargetSeconds",
  "vacationAllowanceDays" = EXCLUDED."vacationAllowanceDays",
  "birthDate" = EXCLUDED."birthDate",
  phone = EXCLUDED.phone,
  address = EXCLUDED.address,
  "roleId" = EXCLUDED."roleId",
  "costCenterId" = EXCLUDED."costCenterId",
  "contractType" = EXCLUDED."contractType",
  "weeklyContractHours" = EXCLUDED."weeklyContractHours",
  "avsNumber" = EXCLUDED."avsNumber",
  iban = EXCLUDED.iban,
  "bankName" = EXCLUDED."bankName",
  "bicSwift" = EXCLUDED."bicSwift",
  "accountHolder" = EXCLUDED."accountHolder",
  "baseSalaryMonthly" = EXCLUDED."baseSalaryMonthly",
  "taxCanton" = EXCLUDED."taxCanton",
  "taxMunicipality" = EXCLUDED."taxMunicipality",
  "hireDate" = EXCLUDED."hireDate";


