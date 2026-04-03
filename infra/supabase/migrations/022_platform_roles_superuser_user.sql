-- Ruoli piattaforma canonici su `users.role`: superuser | user.
-- Migra valori legacy (admin, employee, team_lead) dopo il refactor applicativo.

update users
set role = 'superuser'
where role = 'admin';

update users
set role = 'user'
where role in ('employee', 'team_lead');
