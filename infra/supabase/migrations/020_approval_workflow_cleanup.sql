-- Pulizia workflow approvazioni: orfani, incoerenze, duplicati pending.
-- Deep link notifiche → schermata approvazioni.
-- Allineamento richieste remote working (tabella smartworking_requests) già pending alla tabella approvals.

alter table public.user_notifications
  add column if not exists "actionPath" text null;

comment on column public.user_notifications."actionPath" is 'Path in-app opzionale (es. /workflow/approvals?approvalId=...)';

-- Approvazioni senza entità collegata
delete from public.approvals a
where a.type = 'leave'
  and not exists (select 1 from public.leave_plans l where l.id = a."entityId");

delete from public.approvals a
where a.type = 'sickness'
  and not exists (select 1 from public.sickness_events s where s.id = a."entityId");

delete from public.approvals a
where a.type = 'smartworking'
  and not exists (select 1 from public.smartworking_requests sw where sw.id = a."entityId");

-- Pending su approvals ma entità già decisa
delete from public.approvals a
where a.status = 'pending'
  and a.type = 'leave'
  and exists (
    select 1 from public.leave_plans l
    where l.id = a."entityId" and l.status is not null and l.status <> 'pending'
  );

delete from public.approvals a
where a.status = 'pending'
  and a.type = 'sickness'
  and exists (
    select 1 from public.sickness_events s
    where s.id = a."entityId" and s.status is not null and s.status <> 'pending'
  );

delete from public.approvals a
where a.status = 'pending'
  and a.type = 'smartworking'
  and exists (
    select 1 from public.smartworking_requests sw
    where sw.id = a."entityId" and sw.status is not null and sw.status <> 'pending'
  );

-- Duplicati pending per stessa entità e tipo: mantieni la riga con at più recente
delete from public.approvals a
where a.id in (
  select id from (
    select id,
           row_number() over (
             partition by "entityId", type
             order by at desc, id desc
           ) as rn
    from public.approvals
    where status = 'pending'
      and type in ('leave', 'sickness', 'smartworking')
  ) d
  where d.rn > 1
);

-- Retrofit: richieste SW pending senza riga approvals
insert into public.approvals (id, "entityId", type, "requestedBy", "approverId", status, at)
select
  'ap-sw-' || sw.id,
  sw.id,
  'smartworking',
  sw."userId",
  sw."approverId",
  'pending',
  sw."createdAt"
from public.smartworking_requests sw
where sw.status = 'pending'
  and not exists (
    select 1 from public.approvals a2
    where a2."entityId" = sw.id and a2.type = 'smartworking'
  )
on conflict (id) do nothing;
