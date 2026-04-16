-- Corporate Policies (documenti aziendali per retrieval / assistente) + audit interazioni AI.

insert into storage.buckets (id, name, public)
values ('corporate-policy-files', 'corporate-policy-files', false)
on conflict (id) do nothing;

create table if not exists public.corporate_policy_documents (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  title text not null,
  description text not null default '',
  storage_bucket text not null default 'corporate-policy-files',
  storage_path text not null,
  mime_type text null,
  byte_size bigint null,
  version integer not null default 1,
  created_by_user_id text null references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_corporate_policy_docs_company
  on public.corporate_policy_documents (company_id, created_at desc);

comment on table public.corporate_policy_documents is 'Policy aziendali (Corporate Policies): titolo, descrizione, file in storage; lettura per company.';

alter table public.corporate_policy_documents enable row level security;

drop policy if exists "nexa_corporate_policies_select_company" on public.corporate_policy_documents;
create policy "nexa_corporate_policies_select_company"
on public.corporate_policy_documents for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me."companyId" = public.corporate_policy_documents.company_id
  )
);

drop policy if exists "nexa_corporate_policies_write_admin" on public.corporate_policy_documents;
create policy "nexa_corporate_policies_write_admin"
on public.corporate_policy_documents for insert to authenticated
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.corporate_policy_documents.company_id
  )
);

drop policy if exists "nexa_corporate_policies_update_admin" on public.corporate_policy_documents;
create policy "nexa_corporate_policies_update_admin"
on public.corporate_policy_documents for update to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.corporate_policy_documents.company_id
  )
)
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.corporate_policy_documents.company_id
  )
);

drop policy if exists "nexa_corporate_policies_delete_admin" on public.corporate_policy_documents;
create policy "nexa_corporate_policies_delete_admin"
on public.corporate_policy_documents for delete to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.role in ('superuser', 'admin')
    and me."companyId" = public.corporate_policy_documents.company_id
  )
);

create table if not exists public.ai_interaction_audit (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  user_id text not null references public.users (id) on delete cascade,
  role_snapshot text not null default '',
  feature text not null,
  schema_version text null,
  session_id text null,
  input_fingerprint text null,
  data_sources jsonb not null default '[]'::jsonb,
  response_size_bytes integer null,
  outcome text null,
  human_confirmed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_interaction_audit_company_created
  on public.ai_interaction_audit (company_id, created_at desc);

create index if not exists idx_ai_interaction_audit_user_created
  on public.ai_interaction_audit (user_id, created_at desc);

comment on table public.ai_interaction_audit is 'Tracciamento interazioni AI: nessun payload raw; solo metadati e fingerprint.';

alter table public.ai_interaction_audit enable row level security;

drop policy if exists "nexa_ai_audit_select_hr" on public.ai_interaction_audit;
create policy "nexa_ai_audit_select_hr"
on public.ai_interaction_audit for select to authenticated
using (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and (
      me.role in ('superuser', 'admin')
      or me.id = public.ai_interaction_audit.user_id
    )
    and me."companyId" = public.ai_interaction_audit.company_id
  )
);

drop policy if exists "nexa_ai_audit_insert_service" on public.ai_interaction_audit;
create policy "nexa_ai_audit_insert_service"
on public.ai_interaction_audit for insert to authenticated
with check (
  exists (
    select 1 from public.users me
    where me.email = (select auth.email())
    and me.id = public.ai_interaction_audit.user_id
    and me."companyId" = public.ai_interaction_audit.company_id
  )
);

notify pgrst, 'reload schema';
