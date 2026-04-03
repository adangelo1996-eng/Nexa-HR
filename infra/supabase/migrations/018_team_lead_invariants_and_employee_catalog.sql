-- Catalogo `employee` (richiesto da script di riallineamento e lookup backend per roleId di default).
-- Invarianti prodotto: `users.role = 'team_lead'` solo se l'utente è `leadUserId` di un `work_team`
-- e, se è lead di un solo team, `users."teamId"` coincide con quel team.
-- Idempotente, sicuro su DB già migrati con 016/017.

-- -----------------------------------------------------------------------------
-- 1) Riga catalogo profilo dipendente (nome canonico `employee`, univoco su roles.name)
-- -----------------------------------------------------------------------------
insert into roles (id, name, description, permissions)
select
  'nexa-r-catalog-employee',
  'employee',
  'Profilo dipendente — permessi operativi base',
  '["clock", "read:self"]'::jsonb
where not exists (select 1 from roles where lower(name) = 'employee' limit 1);

-- Se esiste già una riga `employee` con altro id, non duplicare: niente altro da fare.

-- -----------------------------------------------------------------------------
-- 2) Garantisce ruolo catalogo team_lead canonico (per promozioni da work_teams)
-- -----------------------------------------------------------------------------
insert into roles (id, name, description, permissions)
values
  (
    'nexa-r-team-lead',
    'team_lead',
    'Responsabile di team — approvazioni ferie, malattia, smart working',
    '["read:team", "approve:leave", "approve:sickness", "nexa.approvals:read", "nexa.approvals:write", "nexa.work_calendar:read"]'::jsonb
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  permissions = excluded.permissions;

-- -----------------------------------------------------------------------------
-- 3) Promuove a team_lead chi è lead su un solo work_team ma non ha ancora il ruolo piattaforma
-- -----------------------------------------------------------------------------
update users u
set
  role = 'team_lead',
  "teamId" = wt.id,
  "roleId" = 'nexa-r-team-lead'
from work_teams wt
where wt."leadUserId" = u.id
  and u.role not in ('admin', 'team_lead')
  and not exists (
    select 1
    from work_teams wt2
    where wt2."leadUserId" = u.id
      and wt2.id <> wt.id
  );

-- -----------------------------------------------------------------------------
-- 4) Allinea teamId al team di cui si è lead (un solo team come lead)
-- -----------------------------------------------------------------------------
update users u
set "teamId" = wt.id
from work_teams wt
where wt."leadUserId" = u.id
  and u.role = 'team_lead'
  and (u."teamId" is distinct from wt.id)
  and not exists (
    select 1
    from work_teams wt2
    where wt2."leadUserId" = u.id
      and wt2.id <> wt.id
  );

-- -----------------------------------------------------------------------------
-- 5) Retrocede team_lead orfani (nessun work_teams li dichiara lead): solo ruolo piattaforma → employee
--    Conserva roleId catalogo (es. HR BP) — non forziamo il profilo generico `employee`.
-- -----------------------------------------------------------------------------
update users u
set role = 'employee'
where u.role = 'team_lead'
  and not exists (
    select 1 from work_teams wt where wt."leadUserId" = u.id
  );

-- -----------------------------------------------------------------------------
-- 6) Rimuove lead fantasma su work_teams
-- -----------------------------------------------------------------------------
update work_teams wt
set "leadUserId" = null
where wt."leadUserId" is not null
  and not exists (select 1 from users u where u.id = wt."leadUserId");
