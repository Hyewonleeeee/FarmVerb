-- Review this migration in the Supabase SQL Editor before applying it.
-- It does not delete or migrate data from orders, licenses, profiles, or auth.users.

create extension if not exists pgcrypto;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  lemon_order_id text not null,
  lemon_variant_id text,
  product_slug text,
  product_name text not null,
  buyer_email text not null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null,
  currency text not null,
  total_cents integer not null check (total_cents >= 0),
  test_mode boolean not null default false,
  lemon_license_key text,
  download_url text,
  purchased_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- These additions keep the migration non-destructive if purchases already exists.
alter table public.purchases add column if not exists lemon_order_id text;
alter table public.purchases add column if not exists lemon_variant_id text;
alter table public.purchases add column if not exists product_slug text;
alter table public.purchases add column if not exists product_name text;
alter table public.purchases add column if not exists buyer_email text;
alter table public.purchases add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.purchases add column if not exists status text;
alter table public.purchases add column if not exists currency text;
alter table public.purchases add column if not exists total_cents integer;
alter table public.purchases add column if not exists test_mode boolean default false;
alter table public.purchases add column if not exists lemon_license_key text;
alter table public.purchases add column if not exists download_url text;
alter table public.purchases add column if not exists purchased_at timestamptz;
alter table public.purchases add column if not exists created_at timestamptz default now();
alter table public.purchases add column if not exists updated_at timestamptz default now();

-- Webhooks initially store purchases by email, so both fields must remain nullable.
alter table public.purchases alter column user_id drop not null;
alter table public.purchases alter column product_slug drop not null;

-- This index is the final guard against duplicate webhook deliveries.
-- If legacy purchases already contain duplicate lemon_order_id values, this statement
-- will stop rather than deleting or merging those rows automatically.
create unique index if not exists purchases_lemon_order_id_unique
  on public.purchases (lemon_order_id);

create index if not exists purchases_buyer_email_index
  on public.purchases (buyer_email);

create index if not exists purchases_user_id_purchased_at_index
  on public.purchases (user_id, purchased_at desc);

-- Browser clients do not access purchases directly. Authenticated reads are handled
-- by the server API after verifying the Supabase access token.
alter table public.purchases enable row level security;

comment on column public.purchases.total_cents is
  'Total charged by Lemon Squeezy in the smallest currency unit (for USD, cents).';

comment on column public.purchases.product_slug is
  'FarmVerb product slug resolved from the Lemon Squeezy variant ID; null when unmapped.';
