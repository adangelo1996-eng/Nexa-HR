INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '1df40524-999f-497e-b073-01ffe6b3c814'::uuid, 'authenticated', 'authenticated', 'andrea.greco@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Andrea Greco"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('andrea.greco@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), '1df40524-999f-497e-b073-01ffe6b3c814', '1df40524-999f-497e-b073-01ffe6b3c814'::uuid, jsonb_build_object('sub', '1df40524-999f-497e-b073-01ffe6b3c814', 'email', 'andrea.greco@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
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

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'ee6289f5-bff6-45a1-b9e9-a5c9fa3714d3'::uuid, 'authenticated', 'authenticated', 'chiara.fontana@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Chiara Fontana"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('chiara.fontana@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), 'ee6289f5-bff6-45a1-b9e9-a5c9fa3714d3', 'ee6289f5-bff6-45a1-b9e9-a5c9fa3714d3'::uuid, jsonb_build_object('sub', 'ee6289f5-bff6-45a1-b9e9-a5c9fa3714d3', 'email', 'chiara.fontana@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
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

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '62dd240f-1241-47e3-82f1-4a09ec025823'::uuid, 'authenticated', 'authenticated', 'davide.serra@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Davide Serra"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('davide.serra@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), '62dd240f-1241-47e3-82f1-4a09ec025823', '62dd240f-1241-47e3-82f1-4a09ec025823'::uuid, jsonb_build_object('sub', '62dd240f-1241-47e3-82f1-4a09ec025823', 'email', 'davide.serra@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
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

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '01584f70-6744-427d-9caf-11d17bb235fe'::uuid, 'authenticated', 'authenticated', 'francesca.vitale@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Francesca Vitale"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('francesca.vitale@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), '01584f70-6744-427d-9caf-11d17bb235fe', '01584f70-6744-427d-9caf-11d17bb235fe'::uuid, jsonb_build_object('sub', '01584f70-6744-427d-9caf-11d17bb235fe', 'email', 'francesca.vitale@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
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

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'ffa6c271-67a9-4612-8f52-3730c1bd141a'::uuid, 'authenticated', 'authenticated', 'matteo.caruso@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Matteo Caruso"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('matteo.caruso@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), 'ffa6c271-67a9-4612-8f52-3730c1bd141a', 'ffa6c271-67a9-4612-8f52-3730c1bd141a'::uuid, jsonb_build_object('sub', 'ffa6c271-67a9-4612-8f52-3730c1bd141a', 'email', 'matteo.caruso@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
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