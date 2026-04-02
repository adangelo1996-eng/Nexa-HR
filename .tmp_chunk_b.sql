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


