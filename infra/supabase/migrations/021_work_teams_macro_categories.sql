-- Macro-team per centro di costo (seed demo nexa-cc-* da 013).
-- Inserisce solo se il cost_center esiste (nessun errore su tenant con altri id).

insert into work_teams (id, "costCenterId", name, "leadUserId")
select v.id, v.cc, v.name, null
from (
  values
    ('wt-nexa-cc-1-delivery', 'nexa-cc-1', 'Delivery & PMO'),
    ('wt-nexa-cc-1-client', 'nexa-cc-1', 'Client operations'),
    ('wt-nexa-cc-2-eng', 'nexa-cc-2', 'Engineering core'),
    ('wt-nexa-cc-2-product', 'nexa-cc-2', 'Product & QA'),
    ('wt-nexa-cc-3-hr', 'nexa-cc-3', 'HR & People ops'),
    ('wt-nexa-cc-3-workplace', 'nexa-cc-3', 'Workplace'),
    ('wt-nexa-cc-4-controlling', 'nexa-cc-4', 'Controlling'),
    ('wt-nexa-cc-4-accounting', 'nexa-cc-4', 'Accounting & compliance'),
    ('wt-nexa-cc-5-sales', 'nexa-cc-5', 'Sales & partners'),
    ('wt-nexa-cc-5-gtm', 'nexa-cc-5', 'Marketing & brand')
) as v (id, cc, name)
inner join cost_centers c on c.id = v.cc
on conflict (id) do update set
  name = excluded.name,
  "costCenterId" = excluded."costCenterId";
