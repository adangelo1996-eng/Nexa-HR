-- Backend-only RLS per scenari workforce e gap copertura ruoli (accesso via API Nest, non PostgREST).

do $block$
declare
  t text;
  tables text[] := array['workforce_planning_scenarios', 'hr_role_coverage_gaps'];
begin
  foreach t in array tables
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('drop policy if exists %I on public.%I', 'nexa_no_postgrest_anon_' || t, t);
      execute format(
        'create policy %I on public.%I for all to anon using (false) with check (false)',
        'nexa_no_postgrest_anon_' || t, t
      );
      execute format('drop policy if exists %I on public.%I', 'nexa_no_postgrest_authenticated_' || t, t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (false) with check (false)',
        'nexa_no_postgrest_authenticated_' || t, t
      );
    end if;
  end loop;
end
$block$;
