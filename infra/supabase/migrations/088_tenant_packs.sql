-- SYN-246: pacchetto standard tenant (Nexa HR + Plasticity). Scrittura solo via backend (service role).

create table if not exists public.tenant_packs (
  company_id text primary key,
  template_id text not null,
  pack jsonb not null,
  applied_at timestamptz not null default now(),
  applied_by_user_id text null,
  updated_at timestamptz not null default now(),
  constraint tenant_packs_template_id_chk check (char_length(template_id) between 1 and 64),
  constraint tenant_packs_pack_object_chk check (jsonb_typeof(pack) = 'object')
);

comment on table public.tenant_packs is
  'Contratto di configurazione unico per tenant: template attività, moduli, limiti, default. Niente fork per cliente.';

create index if not exists idx_tenant_packs_template on public.tenant_packs (template_id);

alter table public.tenant_packs enable row level security;

drop policy if exists "nexa_tenant_packs_select_same_company" on public.tenant_packs;
create policy "nexa_tenant_packs_select_same_company"
on public.tenant_packs for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
      and me."companyId" = public.tenant_packs.company_id
  )
);

grant select on public.tenant_packs to authenticated;
grant all on public.tenant_packs to service_role;

insert into public.tenant_packs (company_id, template_id, pack, applied_at, updated_at)
select
  'comp-1',
  'full_suite',
  jsonb_build_object(
    'version', 1,
    'templateId', 'full_suite',
    'note', 'Seed: tenant demo SYNAPSE. Il backend ricalcola il pack dal template all''apply.'
  ),
  now(),
  now()
where not exists (select 1 from public.tenant_packs where company_id = 'comp-1');
