-- Permessi espliciti Centro AI: ambito team/riporti e ambito organizzazione.
-- Allinea i ruoli catalogo che usano ancora chiavi legacy (`read:team`, `nexa.admin_users:read`).
-- Idempotente: non duplica voci nell'array `permissions` (jsonb).

-- Manager / ruoli con visibilità team → possono usare ambito assistente su riporti e team gestiti
update public.roles
set permissions = permissions || '["nexa.ai_assistant:scope_managed"]'::jsonb
where permissions @> '["read:team"]'::jsonb
  and not permissions @> '["nexa.ai_assistant:scope_managed"]'::jsonb;

-- HR / ruoli con lettura anagrafica admin → possono usare ambito organizzazione in Centro AI
update public.roles
set permissions = permissions || '["nexa.ai_assistant:scope_org"]'::jsonb
where permissions @> '["nexa.admin_users:read"]'::jsonb
  and not permissions @> '["nexa.ai_assistant:scope_org"]'::jsonb;
