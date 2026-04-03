-- =============================================================================
-- Verifica (e opzionale riallineamento) invarianti team_lead ↔ work_teams
-- =============================================================================
-- Invariante prodotto: `users.role = 'team_lead'` solo se esiste `work_teams`
-- con `"leadUserId" = users.id` e `users."teamId" = work_teams.id`.
--
-- Prerequisito: migrazione 016 (tabella work_teams, colonna users."teamId").
--
-- Uso:
--   1) Esegui questo file così com'è: ottieni solo i risultati delle verifiche.
--   2) Se la query VERIFICA 4 restituisce righe, correggi a mano i lead duplicati.
--   3) Apri la sezione RIPARAZIONE sotto, decommenta il blocco BEGIN…COMMIT ed esegui.
--   4) Esegui le query POST-VERIFICA: i conteggi devono essere 0.
--
-- psql:  \i scripts/sql/realign_team_lead_invariants.sql
-- =============================================================================


-- -----------------------------------------------------------------------------
-- VERIFICA 1 — team_lead senza alcun work_teams che li dichiari lead
-- -----------------------------------------------------------------------------
SELECT
  u.id,
  u.email,
  u."fullName",
  u.role,
  u."teamId",
  u."costCenterId"
FROM users u
WHERE u.role = 'team_lead'
  AND NOT EXISTS (
    SELECT 1
    FROM work_teams wt
    WHERE wt."leadUserId" = u.id
  )
ORDER BY u.email;


-- -----------------------------------------------------------------------------
-- VERIFICA 2 — team_lead con teamId diversa (o NULL) dal team di cui sono lead
-- -----------------------------------------------------------------------------
SELECT
  u.id,
  u.email,
  u."fullName",
  u.role,
  u."teamId" AS user_team_id,
  wt.id AS expected_team_id,
  wt.name AS team_name
FROM users u
JOIN work_teams wt ON wt."leadUserId" = u.id
WHERE u.role = 'team_lead'
  AND (u."teamId" IS DISTINCT FROM wt.id)
ORDER BY u.email, wt.id;


-- -----------------------------------------------------------------------------
-- VERIFICA 3 — work_teams.lead impostato ma utente non è team_lead (non admin)
-- -----------------------------------------------------------------------------
SELECT
  wt.id AS team_id,
  wt.name,
  wt."leadUserId",
  u.email,
  u."fullName",
  u.role AS user_platform_role,
  u."teamId"
FROM work_teams wt
JOIN users u ON u.id = wt."leadUserId"
WHERE u.role IS DISTINCT FROM 'team_lead'
  AND u.role IS DISTINCT FROM 'admin'
ORDER BY wt.name;


-- -----------------------------------------------------------------------------
-- VERIFICA 4 — Stesso utente lead su più team (correggere a mano prima del fix)
-- -----------------------------------------------------------------------------
SELECT
  wt."leadUserId",
  u.email,
  u."fullName",
  COUNT(*)::int AS team_count,
  array_agg(wt.id ORDER BY wt.id) AS team_ids,
  array_agg(wt.name ORDER BY wt.id) AS team_names
FROM work_teams wt
JOIN users u ON u.id = wt."leadUserId"
WHERE wt."leadUserId" IS NOT NULL
GROUP BY wt."leadUserId", u.email, u."fullName"
HAVING COUNT(*) > 1;


-- -----------------------------------------------------------------------------
-- VERIFICA 5 — leadUserId che punta a utente inesistente
-- -----------------------------------------------------------------------------
SELECT wt.id, wt.name, wt."leadUserId"
FROM work_teams wt
WHERE wt."leadUserId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = wt."leadUserId");


-- =============================================================================
-- RIPARAZIONE — Decommentare l'intero blocco seguente, poi eseguire lo script.
-- =============================================================================
/*
BEGIN;

-- A) Retrocedi team_lead "orfani" (nessun work_teams li ha come lead)
WITH employee_role AS (
  SELECT r.id
  FROM roles r
  WHERE lower(r.name) = 'employee'
  ORDER BY r.id
  LIMIT 1
)
UPDATE users u
SET
  role = 'employee',
  "roleId" = COALESCE((SELECT id FROM employee_role), u."roleId")
WHERE u.role = 'team_lead'
  AND NOT EXISTS (
    SELECT 1 FROM work_teams wt WHERE wt."leadUserId" = u.id
  );

-- B) Allinea teamId al team di cui l'utente è lead (solo se è lead di un solo team)
UPDATE users u
SET "teamId" = wt.id
FROM work_teams wt
WHERE wt."leadUserId" = u.id
  AND u.role = 'team_lead'
  AND (u."teamId" IS DISTINCT FROM wt.id)
  AND NOT EXISTS (
    SELECT 1
    FROM work_teams wt2
    WHERE wt2."leadUserId" = u.id
      AND wt2.id <> wt.id
  );

-- C) Promuovi a team_lead chi è lead su work_teams ma non ha ancora il ruolo (non admin)
WITH team_lead_role AS (
  SELECT r.id
  FROM roles r
  WHERE lower(r.name) = 'team_lead'
  ORDER BY r.id
  LIMIT 1
)
UPDATE users u
SET
  role = 'team_lead',
  "teamId" = wt.id,
  "roleId" = COALESCE((SELECT id FROM team_lead_role), u."roleId")
FROM work_teams wt
WHERE wt."leadUserId" = u.id
  AND u.role NOT IN ('admin', 'team_lead')
  AND NOT EXISTS (
    SELECT 1
    FROM work_teams wt2
    WHERE wt2."leadUserId" = u.id
      AND wt2.id <> wt.id
  );

-- D) Rimuovi lead fantasma (nessun utente)
UPDATE work_teams wt
SET "leadUserId" = NULL
WHERE wt."leadUserId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = wt."leadUserId");

COMMIT;
*/


-- =============================================================================
-- POST-VERIFICA (dopo aver eseguito la RIPARAZIONE) — conteggi attesi: 0
-- =============================================================================
SELECT 'post: orphan team_lead' AS check_name, COUNT(*)::int AS n
FROM users u
WHERE u.role = 'team_lead'
  AND NOT EXISTS (SELECT 1 FROM work_teams wt WHERE wt."leadUserId" = u.id);

SELECT 'post: teamId mismatch' AS check_name, COUNT(*)::int AS n
FROM users u
JOIN work_teams wt ON wt."leadUserId" = u.id
WHERE u.role = 'team_lead'
  AND (u."teamId" IS DISTINCT FROM wt.id);

SELECT 'post: lead not team_lead (non-admin)' AS check_name, COUNT(*)::int AS n
FROM work_teams wt
JOIN users u ON u.id = wt."leadUserId"
WHERE u.role IS DISTINCT FROM 'team_lead'
  AND u.role IS DISTINCT FROM 'admin';
