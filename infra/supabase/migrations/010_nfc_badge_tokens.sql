create table if not exists nfc_badge_tokens (
  token text primary key check (char_length(token) = 16),
  "userId" text not null references users(id) on delete cascade,
  "createdAt" text not null
);

create index if not exists idx_nfc_tokens_user on nfc_badge_tokens ("userId");
