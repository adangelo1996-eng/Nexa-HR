-- Remote working: periodi multi-giorno; RLS preset turni (070)

alter table public.smartworking_requests
  add column if not exists "endDay" text;

update public.smartworking_requests
set "endDay" = "day"
where "endDay" is null or trim("endDay") = '';

comment on column public.smartworking_requests."endDay" is
  'Ultimo giorno incluso del periodo (YYYY-MM-DD). Se uguale a day è richiesta singola.';

create index if not exists idx_sw_req_user_day_range
  on public.smartworking_requests ("userId", "day", "endDay");

drop policy if exists "nexa_hr_shift_presets_select_company" on public.hr_shift_presets;
create policy "nexa_hr_shift_presets_select_company"
on public.hr_shift_presets for select to authenticated
using (
  exists (
    select 1
    from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.hr_shift_presets.company_id
  )
);

notify pgrst, 'reload schema';
