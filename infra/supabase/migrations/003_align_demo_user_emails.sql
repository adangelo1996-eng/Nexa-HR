-- Allinea email utenti demo legacy (se presenti) al dominio @synapse.com.
update public.users
set email = 'manager@synapse.com'
where id = 'u-manager';

update public.users
set email = 'employee@synapse.com'
where id = 'u-employee';