-- Restringe company_holidays al tenant: utile se 043 era già stato applicato con using(true).
drop policy if exists "nexa_company_holidays_select_authenticated" on public.company_holidays;
create policy "nexa_company_holidays_select_authenticated"
on public.company_holidays for select to authenticated
using (
  exists (
    select 1
    from public.users me
    where me.email = (select auth.email())
    and me."companyId" = public.company_holidays."companyId"
  )
);

notify pgrst, 'reload schema';
