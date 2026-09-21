-- One-time opaque claims securely link a Lemon order to the authenticated
-- FarmVerb account that initiated checkout. Raw claim tokens are never stored.

create extension if not exists pgcrypto;

create table if not exists public.purchase_account_claims (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_slug text not null,
  lemon_variant_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_order_id text,
  created_at timestamptz not null default now(),
  constraint purchase_account_claims_token_hash_length check (length(token_hash) = 64),
  constraint purchase_account_claims_consumption_pair check (
    (consumed_at is null and consumed_order_id is null)
    or (consumed_at is not null and consumed_order_id is not null)
  )
);

create unique index if not exists purchase_account_claims_token_hash_unique
  on public.purchase_account_claims (token_hash);

create unique index if not exists purchase_account_claims_consumed_order_unique
  on public.purchase_account_claims (consumed_order_id)
  where consumed_order_id is not null;

create index if not exists purchase_account_claims_user_created_index
  on public.purchase_account_claims (user_id, created_at desc);

create index if not exists purchase_account_claims_expires_index
  on public.purchase_account_claims (expires_at);

-- Browser clients must never read or mutate claim rows. All access happens via
-- server routes using the Supabase secret/service-role key.
alter table public.purchase_account_claims enable row level security;
