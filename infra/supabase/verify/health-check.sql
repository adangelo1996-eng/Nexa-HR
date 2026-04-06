-- Nexa-HR — verifica rapida coerenza DB / Realtime (eseguire in Supabase → SQL Editor)
-- Dopo le query, controlla anche: Dashboard → Database → Publications → supabase_realtime

-- 1) Tabelle attese nella publication Realtime (usate da apps/frontend/lib/supabase-realtime.ts)
select pt.schemaname, pt.tablename
from pg_publication_tables pt
where pt.pubname = 'supabase_realtime'
  and pt.schemaname = 'public'
  and pt.tablename in ('user_notifications', 'approvals', 'smartworking_requests')
order by pt.tablename;

-- 2) RLS attivo su tabelle sensibili al client anon + JWT
select c.relname, c.relrowsecurity as rls_on
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('user_notifications', 'approvals', 'smartworking_requests', 'users')
order by c.relname;

-- 3) Replica identity FULL (richiesta da Supabase Realtime per postgres_changes)
select c.relname,
  case c.relreplident
    when 'd' then 'default'
    when 'n' then 'nothing'
    when 'f' then 'full'
    when 'i' then 'index'
  end as replica_identity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('user_notifications', 'approvals', 'smartworking_requests')
order by c.relname;

-- 4) Policy notifiche: lettura solo righe proprie (auth.email → public.users)
select pol.polname, pol.polcmd
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
where c.relname = 'user_notifications'
order by pol.polname;
