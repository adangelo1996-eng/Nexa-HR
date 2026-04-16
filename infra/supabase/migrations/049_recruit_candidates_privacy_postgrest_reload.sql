-- Garantisce colonne privacy/consenso su recruit_candidates e ricarica PostgREST.
-- Risolve: "column recruit_candidates_1.privacy_notice_version does not exist",
-- "Could not find the 'consent_recorded_at' column ... in the schema cache" (PGRST204)
-- se 048 non è mai stata applicata, è fallita a metà, o la cache schema non si è aggiornata.

alter table public.recruit_candidates
  add column if not exists privacy_notice_version text null,
  add column if not exists consent_recorded_at timestamptz null;

comment on column public.recruit_candidates.privacy_notice_version is 'Versione informativa privacy accettata in creazione (testo gestito dal d.l.).';
comment on column public.recruit_candidates.consent_recorded_at is 'Timestamp registrazione consenso/base giuridica lato organizzazione.';

notify pgrst, 'reload schema';
