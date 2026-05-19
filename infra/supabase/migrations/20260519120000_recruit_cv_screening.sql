-- AI CV screening: score and rationale per candidatura (candidato x posizione).

alter table if exists public.recruit_candidate_stage_state
  add column if not exists candidate_cv_screening_score integer null
    check (
      candidate_cv_screening_score is null
      or (candidate_cv_screening_score >= 0 and candidate_cv_screening_score <= 100)
    ),
  add column if not exists screening_summary jsonb not null default '{}'::jsonb,
  add column if not exists screened_at timestamptz null;

create index if not exists idx_recruit_candidate_stage_screening_score
  on public.recruit_candidate_stage_state (position_id, candidate_cv_screening_score desc nulls last);

comment on column public.recruit_candidate_stage_state.candidate_cv_screening_score is
  'Punteggio AI 0-100 vs requisiti posizione aperta.';
comment on column public.recruit_candidate_stage_state.screening_summary is
  'Rationale screening JSON: matches, mismatches, summary.';
comment on column public.recruit_candidate_stage_state.screened_at is
  'Timestamp ultimo screening CV completato.';

-- Testo CV estratto al upload (accesso HR via API Nest; nessuna esposizione PostgREST pubblica aggiuntiva).
alter table if exists public.recruit_candidate_documents
  add column if not exists extracted_text text null;

comment on column public.recruit_candidate_documents.extracted_text is
  'Testo estratto da CV caricato (PDF/Word) per screening interno HR.';

notify pgrst, 'reload schema';
