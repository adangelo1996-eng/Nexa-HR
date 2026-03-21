-- Allinea email utenti seed al README (manager / employee su @payday.ch).
update public.users
set email = 'manager@payday.ch'
where id = 'u-manager';

update public.users
set email = 'employee@payday.ch'
where id = 'u-employee';