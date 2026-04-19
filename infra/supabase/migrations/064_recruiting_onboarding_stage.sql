-- Fase pipeline «onboarding assunzione» + rinomina «Scartato» → «Respinti».

alter table public.recruit_pipeline_stages drop constraint if exists recruit_pipeline_stages_stage_kind_check;

alter table public.recruit_pipeline_stages
  add constraint recruit_pipeline_stages_stage_kind_check
  check (stage_kind in ('screening', 'interview', 'offer', 'hired', 'rejected', 'custom', 'onboarding'));

update public.recruit_pipeline_stages
set name = 'Respinti'
where stage_kind = 'rejected'
  and (lower(trim(name)) in ('scartato', 'scartati') or name ilike 'scartat%');

insert into public.recruit_pipeline_stages (id, pipeline_id, stage_order, name, stage_kind)
select gen_random_uuid(), p.id, 58, 'Onboarding assunzione', 'onboarding'
from public.recruit_pipelines p
where not exists (
  select 1
  from public.recruit_pipeline_stages s
  where s.pipeline_id = p.id
    and s.stage_kind = 'onboarding'
);
