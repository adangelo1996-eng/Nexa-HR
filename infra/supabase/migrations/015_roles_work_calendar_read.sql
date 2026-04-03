-- Consente ai ruoli con visibilità team di aprire il calendario lavoro HR.
update roles
set permissions = permissions || '["nexa.work_calendar:read"]'::jsonb
where permissions @> '["read:team"]'::jsonb
  and not permissions @> '["nexa.work_calendar:read"]'::jsonb;
