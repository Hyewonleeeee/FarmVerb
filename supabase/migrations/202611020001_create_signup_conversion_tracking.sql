-- Track only Auth users created after this migration and only after their email
-- OTP has been verified. This intentionally adds no auth.users trigger: existing
-- profile/Auth triggers keep their current order and analytics can never block
-- account creation.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.signup_conversion_tracking_config (
  singleton boolean primary key default true check (singleton),
  enabled_at timestamptz not null
);

insert into public.signup_conversion_tracking_config (singleton, enabled_at)
values (true, statement_timestamp())
on conflict (singleton) do nothing;

create table if not exists public.signup_conversion_events (
  user_id uuid primary key references auth.users(id) on delete cascade,
  event_id uuid not null unique default gen_random_uuid(),
  signup_method text not null default 'email_otp'
    check (signup_method = 'email_otp'),
  auth_created_at timestamptz not null,
  completed_at timestamptz not null default now(),
  ga4_processed_at timestamptz,
  google_ads_processed_at timestamptz,
  analytics_lease_token uuid,
  analytics_lease_expires_at timestamptz
);

comment on table public.signup_conversion_events is
  'Future-only, server-verified signup analytics delivery state. Contains no email, OTP, or profile data.';
comment on column public.signup_conversion_events.ga4_processed_at is
  'Browser Google tag callback acknowledged; not proof of receipt by Google Analytics.';
comment on column public.signup_conversion_events.google_ads_processed_at is
  'Browser Google tag callback acknowledged; not proof of receipt by Google Ads.';

alter table public.signup_conversion_tracking_config enable row level security;
alter table public.signup_conversion_events enable row level security;

revoke all on table public.signup_conversion_tracking_config,
  public.signup_conversion_events from public, anon, authenticated, service_role;

drop policy if exists signup_conversion_tracking_config_deny_browser
  on public.signup_conversion_tracking_config;
create policy signup_conversion_tracking_config_deny_browser
  on public.signup_conversion_tracking_config as restrictive
  for all to anon, authenticated using (false) with check (false);

drop policy if exists signup_conversion_events_deny_browser
  on public.signup_conversion_events;
create policy signup_conversion_events_deny_browser
  on public.signup_conversion_events as restrictive
  for all to anon, authenticated using (false) with check (false);

-- The authenticated API supplies p_user_id only after supabase.auth.getUser()
-- verifies the bearer token. This function independently proves that the Auth
-- row is post-migration, email-confirmed, and not a server-marked test account.
create or replace function public.reserve_signup_conversion(
  p_user_id uuid,
  p_lease_token uuid
) returns table (
  event_id uuid,
  signup_method text,
  ga4_pending boolean,
  google_ads_pending boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  insert into public.signup_conversion_events (
    user_id,
    signup_method,
    auth_created_at,
    completed_at
  )
  select
    auth_user.id,
    'email_otp',
    auth_user.created_at,
    now()
  from auth.users as auth_user
  join public.signup_conversion_tracking_config as config
    on config.singleton = true
  where auth_user.id = p_user_id
    and auth_user.created_at >= config.enabled_at
    and auth_user.email_confirmed_at is not null
    and coalesce(auth_user.raw_app_meta_data ->> 'analytics_test', 'false') <> 'true'
  on conflict on constraint signup_conversion_events_pkey do nothing;

  return query
  update public.signup_conversion_events as signup_event
  set analytics_lease_token = p_lease_token,
      analytics_lease_expires_at = now() + interval '60 seconds'
  where signup_event.user_id = p_user_id
    and (signup_event.ga4_processed_at is null
      or signup_event.google_ads_processed_at is null)
    and (signup_event.analytics_lease_expires_at is null
      or signup_event.analytics_lease_expires_at <= now())
  returning
    signup_event.event_id,
    signup_event.signup_method,
    signup_event.ga4_processed_at is null,
    signup_event.google_ads_processed_at is null;
end;
$$;

create or replace function public.ack_signup_conversion(
  p_user_id uuid,
  p_event_id uuid,
  p_lease_token uuid,
  p_channel text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_channel = 'ga4' then
    update public.signup_conversion_events as signup_event
    set ga4_processed_at = coalesce(signup_event.ga4_processed_at, now())
    where signup_event.user_id = p_user_id
      and signup_event.event_id = p_event_id
      and signup_event.analytics_lease_token = p_lease_token;
  elsif p_channel = 'google_ads' then
    update public.signup_conversion_events as signup_event
    set google_ads_processed_at = coalesce(signup_event.google_ads_processed_at, now())
    where signup_event.user_id = p_user_id
      and signup_event.event_id = p_event_id
      and signup_event.analytics_lease_token = p_lease_token;
  else
    return false;
  end if;

  if not found then
    return false;
  end if;

  update public.signup_conversion_events as signup_event
  set analytics_lease_token = null,
      analytics_lease_expires_at = null
  where signup_event.user_id = p_user_id
    and signup_event.event_id = p_event_id
    and signup_event.analytics_lease_token = p_lease_token
    and signup_event.ga4_processed_at is not null
    and signup_event.google_ads_processed_at is not null;

  return true;
end;
$$;

revoke all on function public.reserve_signup_conversion(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.ack_signup_conversion(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_signup_conversion(uuid, uuid)
  to service_role;
grant execute on function public.ack_signup_conversion(uuid, uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
