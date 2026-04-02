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


INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '3ca0a2c4-fb07-436d-9046-2b52e262fa6d'::uuid, 'authenticated', 'authenticated', 'luca.colombo@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Luca Colombo"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('luca.colombo@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, email, created_at, updated_at)
SELECT gen_random_uuid(), '3ca0a2c4-fb07-436d-9046-2b52e262fa6d', '3ca0a2c4-fb07-436d-9046-2b52e262fa6d'::uuid, jsonb_build_object('sub', '3ca0a2c4-fb07-436d-9046-2b52e262fa6d', 'email', 'luca.colombo@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', 'luca.colombo@synapse.com', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '3ca0a2c4-fb07-436d-9046-2b52e262fa6d'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = '3ca0a2c4-fb07-436d-9046-2b52e262fa6d'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('3ca0a2c4-fb07-436d-9046-2b52e262fa6d', 'luca.colombo@synapse.com', 'Luca Colombo', 'employee', 'f4042513-0aaa-47b1-a15b-c89ba455a9d8', 'comp-1', 'Luca', 'Colombo', 30240, 22, '1991-02-18', '+41 78 200 3301', 'Via Industria 2, Mendrisio', 'nexa-r-10', 'nexa-cc-2', 'indeterminato', 42, '756.4234.5678.34', 'CH56 0070 0110 1234 5678 9', 'Raiffeisen', 'RAIFCH22', 'Luca Colombo', 7200, 'TI', 'Mendrisio', '2020-01-20')
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
SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'b5ff43f8-bb4e-4ec9-b1bf-cf9e06098b15'::uuid, 'authenticated', 'authenticated', 'sofia.marini@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Sofia Marini"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('sofia.marini@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, email, created_at, updated_at)
SELECT gen_random_uuid(), 'b5ff43f8-bb4e-4ec9-b1bf-cf9e06098b15', 'b5ff43f8-bb4e-4ec9-b1bf-cf9e06098b15'::uuid, jsonb_build_object('sub', 'b5ff43f8-bb4e-4ec9-b1bf-cf9e06098b15', 'email', 'sofia.marini@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', 'sofia.marini@synapse.com', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = 'b5ff43f8-bb4e-4ec9-b1bf-cf9e06098b15'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = 'b5ff43f8-bb4e-4ec9-b1bf-cf9e06098b15'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('b5ff43f8-bb4e-4ec9-b1bf-cf9e06098b15', 'sofia.marini@synapse.com', 'Sofia Marini', 'employee', 'f4042513-0aaa-47b1-a15b-c89ba455a9d8', 'comp-1', 'Sofia', 'Marini', 28800, 22, '1992-07-30', '+41 78 200 3302', 'Corso Elvezia 8, Lugano', 'nexa-r-11', 'nexa-cc-2', 'indeterminato', 40, '756.5234.5678.45', 'CH67 0020 2200 1234 5678 0', 'UBS', 'UBSWCHZH80A', 'Sofia Marini', 7100, 'TI', 'Lugano', '2020-09-01')
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
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '1df40524-999f-497e-b073-01ffe6b3c814'::uuid, 'authenticated', 'authenticated', 'andrea.greco@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Andrea Greco"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('andrea.greco@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, email, created_at, updated_at)
SELECT gen_random_uuid(), '1df40524-999f-497e-b073-01ffe6b3c814', '1df40524-999f-497e-b073-01ffe6b3c814'::uuid, jsonb_build_object('sub', '1df40524-999f-497e-b073-01ffe6b3c814', 'email', 'andrea.greco@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', 'andrea.greco@synapse.com', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '1df40524-999f-497e-b073-01ffe6b3c814'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = '1df40524-999f-497e-b073-01ffe6b3c814'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('1df40524-999f-497e-b073-01ffe6b3c814', 'andrea.greco@synapse.com', 'Andrea Greco', 'employee', 'f4042513-0aaa-47b1-a15b-c89ba455a9d8', 'comp-1', 'Andrea', 'Greco', 28800, 22, '1993-01-05', '+41 78 200 3303', 'Via Gaggiolo 14, Chiasso', 'nexa-r-12', 'nexa-cc-1', 'indeterminato', 40, '756.6234.5678.56', 'CH78 0483 5030 9876 5432 1', 'Credit Suisse', 'CRESCHZZ80A', 'Andrea Greco', 6800, 'TI', 'Chiasso', '2021-02-15')
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
SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'ee6289f5-bff6-45a1-b9e9-a5c9fa3714d3'::uuid, 'authenticated', 'authenticated', 'chiara.fontana@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Chiara Fontana"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('chiara.fontana@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, email, created_at, updated_at)
SELECT gen_random_uuid(), 'ee6289f5-bff6-45a1-b9e9-a5c9fa3714d3', 'ee6289f5-bff6-45a1-b9e9-a5c9fa3714d3'::uuid, jsonb_build_object('sub', 'ee6289f5-bff6-45a1-b9e9-a5c9fa3714d3', 'email', 'chiara.fontana@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', 'chiara.fontana@synapse.com', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = 'ee6289f5-bff6-45a1-b9e9-a5c9fa3714d3'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = 'ee6289f5-bff6-45a1-b9e9-a5c9fa3714d3'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('ee6289f5-bff6-45a1-b9e9-a5c9fa3714d3', 'chiara.fontana@synapse.com', 'Chiara Fontana', 'employee', 'f4042513-0aaa-47b1-a15b-c89ba455a9d8', 'comp-1', 'Chiara', 'Fontana', 28800, 22, '1994-10-11', '+41 78 200 3304', 'Via Campagna 9, Massagno', 'nexa-r-13', 'nexa-cc-2', 'indeterminato', 40, '756.7234.5678.67', 'CH89 0900 0000 9876 5432 0', 'PostFinance', 'POFICHBEXXX', 'Chiara Fontana', 6500, 'TI', 'Massagno', '2021-11-08')
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
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '62dd240f-1241-47e3-82f1-4a09ec025823'::uuid, 'authenticated', 'authenticated', 'davide.serra@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Davide Serra"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('davide.serra@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, email, created_at, updated_at)
SELECT gen_random_uuid(), '62dd240f-1241-47e3-82f1-4a09ec025823', '62dd240f-1241-47e3-82f1-4a09ec025823'::uuid, jsonb_build_object('sub', '62dd240f-1241-47e3-82f1-4a09ec025823', 'email', 'davide.serra@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', 'davide.serra@synapse.com', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '62dd240f-1241-47e3-82f1-4a09ec025823'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = '62dd240f-1241-47e3-82f1-4a09ec025823'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('62dd240f-1241-47e3-82f1-4a09ec025823', 'davide.serra@synapse.com', 'Davide Serra', 'employee', 'f4042513-0aaa-47b1-a15b-c89ba455a9d8', 'comp-1', 'Davide', 'Serra', 28800, 24, '1989-05-22', '+41 78 200 3305', 'Piazza Dante 1, Bellinzona', 'nexa-r-14', 'nexa-cc-1', 'indeterminato', 40, '756.8234.5678.78', 'CH90 0076 2000 1122 3344 5', 'UBS', 'UBSWCHZH80A', 'Davide Serra', 7500, 'TI', 'Bellinzona', '2019-11-01')
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
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '01584f70-6744-427d-9caf-11d17bb235fe'::uuid, 'authenticated', 'authenticated', 'francesca.vitale@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Francesca Vitale"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('francesca.vitale@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, email, created_at, updated_at)
SELECT gen_random_uuid(), '01584f70-6744-427d-9caf-11d17bb235fe', '01584f70-6744-427d-9caf-11d17bb235fe'::uuid, jsonb_build_object('sub', '01584f70-6744-427d-9caf-11d17bb235fe', 'email', 'francesca.vitale@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', 'francesca.vitale@synapse.com', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '01584f70-6744-427d-9caf-11d17bb235fe'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = '01584f70-6744-427d-9caf-11d17bb235fe'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('01584f70-6744-427d-9caf-11d17bb235fe', 'francesca.vitale@synapse.com', 'Francesca Vitale', 'employee', '9a0b7f7f-0073-4eef-a68c-e78bf78bb260', 'comp-1', 'Francesca', 'Vitale', 28800, 22, '1995-03-17', '+41 78 200 4401', 'Via Pretorio 30, Locarno', 'nexa-r-03', 'nexa-cc-3', 'indeterminato', 40, '756.9234.5678.89', 'CH01 0020 2200 9988 7766 5', 'UBS', 'UBSWCHZH80A', 'Francesca Vitale', 6200, 'TI', 'Locarno', '2022-01-10')
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
SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'ffa6c271-67a9-4612-8f52-3730c1bd141a'::uuid, 'authenticated', 'authenticated', 'matteo.caruso@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Matteo Caruso"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('matteo.caruso@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, email, created_at, updated_at)
SELECT gen_random_uuid(), 'ffa6c271-67a9-4612-8f52-3730c1bd141a', 'ffa6c271-67a9-4612-8f52-3730c1bd141a'::uuid, jsonb_build_object('sub', 'ffa6c271-67a9-4612-8f52-3730c1bd141a', 'email', 'matteo.caruso@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', 'matteo.caruso@synapse.com', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = 'ffa6c271-67a9-4612-8f52-3730c1bd141a'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = 'ffa6c271-67a9-4612-8f52-3730c1bd141a'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('ffa6c271-67a9-4612-8f52-3730c1bd141a', 'matteo.caruso@synapse.com', 'Matteo Caruso', 'employee', '9a0b7f7f-0073-4eef-a68c-e78bf78bb260', 'comp-1', 'Matteo', 'Caruso', 28800, 22, '1990-08-08', '+41 78 200 4402', 'Viale Stefano 6, Lugano', 'nexa-r-04', 'nexa-cc-4', 'indeterminato', 40, '756.1334.5678.90', 'CH02 0483 5040 5566 7788 0', 'Credit Suisse', 'CRESCHZZ80A', 'Matteo Caruso', 7000, 'TI', 'Lugano', '2020-04-01')
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
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '2ec3d5d6-74dd-47b6-af9b-88fcb1c819ae'::uuid, 'authenticated', 'authenticated', 'valentina.pellegrini@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Valentina Pellegrini"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('valentina.pellegrini@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, email, created_at, updated_at)
SELECT gen_random_uuid(), '2ec3d5d6-74dd-47b6-af9b-88fcb1c819ae', '2ec3d5d6-74dd-47b6-af9b-88fcb1c819ae'::uuid, jsonb_build_object('sub', '2ec3d5d6-74dd-47b6-af9b-88fcb1c819ae', 'email', 'valentina.pellegrini@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', 'valentina.pellegrini@synapse.com', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '2ec3d5d6-74dd-47b6-af9b-88fcb1c819ae'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = '2ec3d5d6-74dd-47b6-af9b-88fcb1c819ae'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('2ec3d5d6-74dd-47b6-af9b-88fcb1c819ae', 'valentina.pellegrini@synapse.com', 'Valentina Pellegrini', 'employee', '9a0b7f7f-0073-4eef-a68c-e78bf78bb260', 'comp-1', 'Valentina', 'Pellegrini', 28800, 22, '1993-12-01', '+41 78 200 4403', 'Strada Regina 44, Melide', 'nexa-r-05', 'nexa-cc-3', 'indeterminato', 40, '756.2334.5678.01', 'CH03 0900 0000 4433 2211 0', 'PostFinance', 'POFICHBEXXX', 'Valentina Pellegrini', 6400, 'TI', 'Melide', '2021-07-19')
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
