-- Idempotente: crea work_teams / users.teamId se mancanti (es. migrazione 016 non applicata).
-- Aggiunge ruolo catalogo `team_lead` per nominhe e UI admin.
-- Rimuove nomenclatura legacy "manager controllo gestione" dal catalogo ruoli (non tocca users.role = employee).

create table if not exists work_teams (
  id text primary key,
  "costCenterId" text not null references cost_centers (id) on delete cascade,
  name text not null,
  "leadUserId" text null references users (id) on delete set null
);

create index if not exists idx_work_teams_cost_center on work_teams ("costCenterId");

alter table users add column if not exists "teamId" text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_teamid_fkey'
  ) then
    alter table users
      add constraint users_teamid_fkey
      foreign key ("teamId") references work_teams (id) on delete set null;
  end if;
end $$;

create index if not exists idx_users_team_id on users ("teamId");

-- Allineamento ruolo piattaforma legacy
update users set role = 'team_lead' where role = 'manager_controllo_gestione';

-- Catalogo: riga nome `team_lead`. `on conflict (id)` fallisce se il nome esiste già con altro id (es. seed r2);
-- si usa `on conflict (name)` per allineare permessi senza violare roles_name_key.
insert into roles (id, name, description, permissions) values
  (
    'nexa-r-team-lead',
    'team_lead',
    'Responsabile di team — approvazioni ferie, malattia, smart working',
    '["read:team", "approve:leave", "approve:sickness", "nexa.approvals:read", "nexa.approvals:write", "nexa.work_calendar:read"]'::jsonb
  )
on conflict (name) do update set
  description = excluded.description,
  permissions = excluded.permissions;

-- Porta gli utenti da eventuali altre righe catalogo team_lead / legacy sull'id effettivo del ruolo `team_lead`
update users u
set "roleId" = (select r2.id from roles r2 where r2.name = 'team_lead' limit 1)
from roles r
where u."roleId" = r.id
  and r.id <> (select r2.id from roles r2 where r2.name = 'team_lead' limit 1)
  and (
    lower(r.name) in ('manager_controllo_gestione', 'manager controllo gestione')
    or r.name = 'team_lead'
  );

-- Rimuovi duplicati catalogo team_lead / legacy non più referenziati
delete from roles r
where r.id <> (select r2.id from roles r2 where r2.name = 'team_lead' limit 1)
  and (
    lower(r.name) in ('manager_controllo_gestione', 'manager controllo gestione')
    or r.name = 'team_lead'
  )
  and not exists (select 1 from users u where u."roleId" = r.id);
