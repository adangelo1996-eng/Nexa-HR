-- Reset recruiting (candidati + posizioni + pipeline collegate) per una company.
-- Esegui in SQL Editor Supabase o con psql come ruolo con permessi DELETE sulle tabelle.
--
-- 1. Sostituire 'YOUR_COMPANY_ID' con il company_id Nexa (stesso valore usato dall'app).
-- 2. Ordine: prima candidati (CASCADE su documenti, stage_state, interview, review, transition_log),
--    poi posizioni (CASCADE su pipeline, stages, assignees).
--    hr_standard_contracts ha ON DELETE SET NULL su recruit_* → i link si azzerano.
-- 3. Opzionale: rigenera progressivi job_code per anno (nuove posizioni ripartono da 1 per anno).

begin;

delete from public.recruit_candidates
where company_id = 'YOUR_COMPANY_ID';

delete from public.recruit_positions
where company_id = 'YOUR_COMPANY_ID';

delete from public.recruit_job_code_seq
where company_id = 'YOUR_COMPANY_ID';

commit;

-- Dopo l'esecuzione: notifica PostgREST se usi cache schema (spesso non necessario su DELETE).
-- select pg_notify('pgrst', 'reload schema');
