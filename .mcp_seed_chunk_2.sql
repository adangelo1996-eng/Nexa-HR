INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '2ec3d5d6-74dd-47b6-af9b-88fcb1c819ae'::uuid, 'authenticated', 'authenticated', 'valentina.pellegrini@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Valentina Pellegrini"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('valentina.pellegrini@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), '2ec3d5d6-74dd-47b6-af9b-88fcb1c819ae', '2ec3d5d6-74dd-47b6-af9b-88fcb1c819ae'::uuid, jsonb_build_object('sub', '2ec3d5d6-74dd-47b6-af9b-88fcb1c819ae', 'email', 'valentina.pellegrini@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
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

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '950438cd-cbfd-419d-a203-48a85c795606'::uuid, 'authenticated', 'authenticated', 'alessandro.deluca@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Alessandro De Luca"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('alessandro.deluca@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), '950438cd-cbfd-419d-a203-48a85c795606', '950438cd-cbfd-419d-a203-48a85c795606'::uuid, jsonb_build_object('sub', '950438cd-cbfd-419d-a203-48a85c795606', 'email', 'alessandro.deluca@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '950438cd-cbfd-419d-a203-48a85c795606'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = '950438cd-cbfd-419d-a203-48a85c795606'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('950438cd-cbfd-419d-a203-48a85c795606', 'alessandro.deluca@synapse.com', 'Alessandro De Luca', 'employee', '9a0b7f7f-0073-4eef-a68c-e78bf78bb260', 'comp-1', 'Alessandro', 'De Luca', 28800, 23, '1988-06-14', '+41 78 200 4404', 'Via Zurigo 22, Rivera', 'nexa-r-18', 'nexa-cc-5', 'indeterminato', 40, '756.3334.5678.12', 'CH04 0076 2000 6677 8899 0', 'UBS', 'UBSWCHZH80A', 'Alessandro De Luca', 6900, 'TI', 'Rivera', '2019-09-15')
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
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '19514edf-4a98-4722-a28e-20fca4ebca7c'::uuid, 'authenticated', 'authenticated', 'ilaria.romano@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Ilaria Romano"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('ilaria.romano@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), '19514edf-4a98-4722-a28e-20fca4ebca7c', '19514edf-4a98-4722-a28e-20fca4ebca7c'::uuid, jsonb_build_object('sub', '19514edf-4a98-4722-a28e-20fca4ebca7c', 'email', 'ilaria.romano@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '19514edf-4a98-4722-a28e-20fca4ebca7c'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = '19514edf-4a98-4722-a28e-20fca4ebca7c'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('19514edf-4a98-4722-a28e-20fca4ebca7c', 'ilaria.romano@synapse.com', 'Ilaria Romano', 'employee', '9a0b7f7f-0073-4eef-a68c-e78bf78bb260', 'comp-1', 'Ilaria', 'Romano', 28800, 22, '1992-04-25', '+41 78 200 4405', 'Via Medici 7, Castel San Pietro', 'nexa-r-19', 'nexa-cc-5', 'indeterminato', 40, '756.4334.5678.23', 'CH05 0020 2200 3344 5566 7', 'UBS', 'UBSWCHZH80A', 'Ilaria Romano', 6600, 'TI', 'Castel San Pietro', '2020-11-01')
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
SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'cd7edf88-7d58-42a6-8190-742524680c30'::uuid, 'authenticated', 'authenticated', 'paolo.bianco@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Paolo Bianco"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('paolo.bianco@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), 'cd7edf88-7d58-42a6-8190-742524680c30', 'cd7edf88-7d58-42a6-8190-742524680c30'::uuid, jsonb_build_object('sub', 'cd7edf88-7d58-42a6-8190-742524680c30', 'email', 'paolo.bianco@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = 'cd7edf88-7d58-42a6-8190-742524680c30'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = 'cd7edf88-7d58-42a6-8190-742524680c30'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('cd7edf88-7d58-42a6-8190-742524680c30', 'paolo.bianco@synapse.com', 'Paolo Bianco', 'employee', '6cf802ea-332f-4720-88bf-bfa3ba43c49b', 'comp-1', 'Paolo', 'Bianco', 28800, 25, '1984-01-29', '+41 91 500 2201', 'Via Maggio 15, Lugano', 'nexa-r-17', 'nexa-cc-4', 'indeterminato', 40, '756.5334.5678.34', 'CH06 0483 5050 7788 9900 1', 'Credit Suisse', 'CRESCHZZ80A', 'Paolo Bianco', 9100, 'TI', 'Lugano', '2018-06-01')
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
SELECT '00000000-0000-0000-0000-000000000000'::uuid, '82925417-7cc7-4a90-a648-ff57004891d4'::uuid, 'authenticated', 'authenticated', 'nadia.costa@synapse.com', crypt('Synapse2026', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name": "Nadia Costa"}'::jsonb, false, false, 0, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower('nadia.costa@synapse.com'));

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), '82925417-7cc7-4a90-a648-ff57004891d4', '82925417-7cc7-4a90-a648-ff57004891d4'::uuid, jsonb_build_object('sub', '82925417-7cc7-4a90-a648-ff57004891d4', 'email', 'nadia.costa@synapse.com', 'email_verified', true, 'phone_verified', false), 'email', now(), now()
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '82925417-7cc7-4a90-a648-ff57004891d4'::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = '82925417-7cc7-4a90-a648-ff57004891d4'::uuid AND i.provider = 'email');

INSERT INTO public.users (id, email, "fullName", role, "managerId", "companyId", "firstName", "lastName", "dailyTargetSeconds", "vacationAllowanceDays", "birthDate", phone, address, "roleId", "costCenterId", "contractType", "weeklyContractHours", "avsNumber", iban, "bankName", "bicSwift", "accountHolder", "baseSalaryMonthly", "taxCanton", "taxMunicipality", "hireDate")
VALUES ('82925417-7cc7-4a90-a648-ff57004891d4', 'nadia.costa@synapse.com', 'Nadia Costa', 'employee', 'f4042513-0aaa-47b1-a15b-c89ba455a9d8', 'comp-1', 'Nadia', 'Costa', 28800, 22, '1991-09-09', '+41 78 200 5501', 'Corso Pestalozzi 48, Lugano', 'nexa-r-15', 'nexa-cc-2', 'indeterminato', 40, '756.6334.5678.45', 'CH07 0900 0000 5566 4433 2', 'PostFinance', 'POFICHBEXXX', 'Nadia Costa', 6700, 'TI', 'Lugano', '2021-04-12')
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