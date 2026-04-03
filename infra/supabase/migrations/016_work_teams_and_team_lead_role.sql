-- Team di lavoro per centro di costo; ruolo piattaforma team_lead al posto di manager_controllo_gestione.

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

update users set role = 'team_lead' where role = 'manager_controllo_gestione';

update roles set name = 'team_lead' where name = 'manager_controllo_gestione';
