-- Note spese: tipologia, conservazione documentale (immagine + hash integrità), traccia OCR

alter table expense_claims add column if not exists "expenseType" text not null default 'altro';
alter table expense_claims add column if not exists "receiptMime" text null;
alter table expense_claims add column if not exists "receiptSha256" text null;
alter table expense_claims add column if not exists "receiptBodyBase64" text null;
alter table expense_claims add column if not exists "ocrRawText" text null;
alter table expense_claims add column if not exists "ocrSuggestedCents" integer null;
alter table expense_claims add column if not exists "legalArchivalAt" text null;

comment on column expense_claims."receiptBodyBase64" is 'Immagine scontrino in base64 (conservazione inalterabile lato submit; hash in receiptSha256)';
comment on column expense_claims."receiptSha256" is 'SHA-256 dell''octet-stream decodificato da receiptBodyBase64 al momento dell''invio';
comment on column expense_claims."legalArchivalAt" is 'Timestamp ISO server al salvataggio (tracciabilità conservazione)';

create index if not exists idx_expense_claims_expense_type on expense_claims ("expenseType");
