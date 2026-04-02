INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'd5feb4e5-dde6-48e5-b9e4-04b5b4879742'::uuid, 'authenticated', 'authenticated', 'giorgio.leone@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Giorgio Leone"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('giorgio.leone@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), 'd5feb4e5-dde6-48e5-b9e4-04b5b4879742', 'd5feb4e5-dde6-48e5-b9e4-04b5b4879742'::uuid, jsonb_build_object('sub', 'd5feb4e5-dde6-48e5-b9e4-04b5b4879742', 'email', 'giorgio.leone@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = 'd5feb4e5-dde6-48e5-b9e4-04b5b4879742'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = 'd5feb4e5-dde6-48e5-b9e4-04b5b4879742'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('d5feb4e5-dde6-48e5-b9e4-04b5b4879742', 'giorgio.leone@synapse.com', 'Giorgio Leone', 'employee', 'f4042513-0aaa-47b1-a15b-c89ba455a9d8', 'comp-1', 'Giorgio', 'Leone', 28800, 24, '1986-12-19', '+41 78 200 5502', 'Via Borromini 3, Mendrisio', 'nexa-r-16', 'nexa-cc-1', 'indeterminato', 40, '756.7334.5678.56', 'CH08 0076 2000 8899 0011 2', 'UBS', 'UBSWCHZH80A', 'Giorgio Leone', 7300, 'TI', 'Mendrisio', '2019-02-01')
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

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '7db4dfc3-795d-45d7-96d9-0a361e679044'::uuid, 'authenticated', 'authenticated', 'beatrice.galliani@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Beatrice Galliani"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('beatrice.galliani@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), '7db4dfc3-795d-45d7-96d9-0a361e679044', '7db4dfc3-795d-45d7-96d9-0a361e679044'::uuid, jsonb_build_object('sub', '7db4dfc3-795d-45d7-96d9-0a361e679044', 'email', 'beatrice.galliani@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '7db4dfc3-795d-45d7-96d9-0a361e679044'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = '7db4dfc3-795d-45d7-96d9-0a361e679044'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('7db4dfc3-795d-45d7-96d9-0a361e679044', 'beatrice.galliani@synapse.com', 'Beatrice Galliani', 'employee', '6cf802ea-332f-4720-88bf-bfa3ba43c49b', 'comp-1', 'Beatrice', 'Galliani', 28800, 25, '1983-07-07', '+41 91 500 2202', 'Via Cattedrale 2, Lugano', 'nexa-r-06', 'nexa-cc-3', 'indeterminato', 40, '756.8334.5678.67', 'CH09 0483 5020 2233 4455 6', 'Credit Suisse', 'CRESCHZZ80A', 'Beatrice Galliani', 7800, 'TI', 'Lugano', '2018-09-01')
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

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'd793b713-1bfe-4ddb-961f-d3357505be4e'::uuid, 'authenticated', 'authenticated', 'simone.parisi@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Simone Parisi"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('simone.parisi@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), 'd793b713-1bfe-4ddb-961f-d3357505be4e', 'd793b713-1bfe-4ddb-961f-d3357505be4e'::uuid, jsonb_build_object('sub', 'd793b713-1bfe-4ddb-961f-d3357505be4e', 'email', 'simone.parisi@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = 'd793b713-1bfe-4ddb-961f-d3357505be4e'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = 'd793b713-1bfe-4ddb-961f-d3357505be4e'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('d793b713-1bfe-4ddb-961f-d3357505be4e', 'simone.parisi@synapse.com', 'Simone Parisi', 'employee', '9a0b7f7f-0073-4eef-a68c-e78bf78bb260', 'comp-1', 'Simone', 'Parisi', 28800, 22, '1996-05-05', '+41 78 200 5503', 'Via Franco Zorzi 11, Giubiasco', 'nexa-r-07', 'nexa-cc-4', 'indeterminato', 40, '756.9334.5678.78', 'CH10 0020 2200 6677 8899 3', 'UBS', 'UBSWCHZH80A', 'Simone Parisi', 6000, 'TI', 'Giubiasco', '2022-09-01')
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

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '7aa48d40-c7b3-4432-bcaa-17a0de5229c5'::uuid, 'authenticated', 'authenticated', 'teresa.mancini@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Teresa Mancini"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('teresa.mancini@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), '7aa48d40-c7b3-4432-bcaa-17a0de5229c5', '7aa48d40-c7b3-4432-bcaa-17a0de5229c5'::uuid, jsonb_build_object('sub', '7aa48d40-c7b3-4432-bcaa-17a0de5229c5', 'email', 'teresa.mancini@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '7aa48d40-c7b3-4432-bcaa-17a0de5229c5'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = '7aa48d40-c7b3-4432-bcaa-17a0de5229c5'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('7aa48d40-c7b3-4432-bcaa-17a0de5229c5', 'teresa.mancini@synapse.com', 'Teresa Mancini', 'employee', 'f4042513-0aaa-47b1-a15b-c89ba455a9d8', 'comp-1', 'Teresa', 'Mancini', 28800, 22, '1993-02-28', '+41 78 200 5504', 'Piazza Indipendenza 5, Chiasso', 'nexa-r-08', 'nexa-cc-1', 'indeterminato', 40, '756.0434.5678.89', 'CH11 0900 0000 7788 5566 4', 'PostFinance', 'POFICHBEXXX', 'Teresa Mancini', 6550, 'TI', 'Chiasso', '2021-01-11')
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

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'a64efbf5-621c-4dd6-bb76-e4ffd7418c6a'::uuid, 'authenticated', 'authenticated', 'riccardo.fabbri@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Riccardo Fabbri"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('riccardo.fabbri@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), 'a64efbf5-621c-4dd6-bb76-e4ffd7418c6a', 'a64efbf5-621c-4dd6-bb76-e4ffd7418c6a'::uuid, jsonb_build_object('sub', 'a64efbf5-621c-4dd6-bb76-e4ffd7418c6a', 'email', 'riccardo.fabbri@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = 'a64efbf5-621c-4dd6-bb76-e4ffd7418c6a'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = 'a64efbf5-621c-4dd6-bb76-e4ffd7418c6a'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('a64efbf5-621c-4dd6-bb76-e4ffd7418c6a', 'riccardo.fabbri@synapse.com', 'Riccardo Fabbri', 'employee', 'f4042513-0aaa-47b1-a15b-c89ba455a9d8', 'comp-1', 'Riccardo', 'Fabbri', 28800, 22, '1997-11-13', '+41 78 200 5505', 'Via Dogana 9, Stabio', 'nexa-r-20', 'nexa-cc-2', 'indeterminato', 40, '756.1434.5678.90', 'CH12 0076 2000 3344 5566 8', 'UBS', 'UBSWCHZH80A', 'Riccardo Fabbri', 5900, 'TI', 'Stabio', '2023-03-01')
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