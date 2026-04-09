-- Auth refresh tokens (server-side). Access token remains JWT (12h) and refresh token is stored hashed.

create table if not exists public.auth_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null
);

create index if not exists idx_auth_refresh_tokens_user on public.auth_refresh_tokens (user_id);
create index if not exists idx_auth_refresh_tokens_expires on public.auth_refresh_tokens (expires_at) where revoked_at is null;

alter table public.auth_refresh_tokens enable row level security;

-- No policies on purpose: only service-role should access this table.
