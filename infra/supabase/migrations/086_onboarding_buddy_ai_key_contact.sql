-- Buddy onboarding: rationale AI, referente a lungo termine (idempotente).

alter table public.onboarding_buddy_assignments
  add column if not exists ai_rationale text not null default '';

alter table public.onboarding_buddy_assignments
  add column if not exists expires_at timestamptz null;

alter table public.onboarding_buddy_assignments
  add column if not exists key_contact boolean not null default true;

comment on column public.onboarding_buddy_assignments.ai_rationale is
  'Spiegazione match generata da LLM (dati pseudonimizzati).';

comment on column public.onboarding_buddy_assignments.expires_at is
  'Fine visibilità buddy; NULL = referente attivo senza scadenza.';

comment on column public.onboarding_buddy_assignments.key_contact is
  'Se true, il buddy resta figura di riferimento oltre la fase onboarding stretta.';
