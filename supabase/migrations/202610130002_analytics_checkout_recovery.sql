-- New checkouts opt in explicitly. Existing/historical orders are never replayed.
begin;

alter table public.purchase_account_claims
  add column if not exists analytics_recovery_enabled boolean not null default false,
  add column if not exists ga4_processed_at timestamptz,
  add column if not exists google_ads_processed_at timestamptz,
  add column if not exists analytics_lease_token uuid,
  add column if not exists analytics_lease_expires_at timestamptz;

comment on column public.purchase_account_claims.ga4_processed_at is
  'Browser Google tag callback acknowledged; not proof of receipt by Google Analytics.';
comment on column public.purchase_account_claims.google_ads_processed_at is
  'Browser Google tag callback acknowledged; not proof of receipt by Google Ads.';

-- Only the server may lease. A lease prevents two account tabs/devices from
-- simultaneously emitting the same purchase. After a crash it becomes retryable.
create or replace function public.lease_purchase_analytics(
  p_claim_id uuid, p_user_id uuid, p_lease_token uuid
) returns boolean
language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  update public.purchase_account_claims
  set analytics_lease_token = p_lease_token,
      analytics_lease_expires_at = now() + interval '60 seconds'
  where id = p_claim_id
    and user_id = p_user_id
    and analytics_recovery_enabled = true
    and consumed_order_id is not null
    and created_at >= now() - interval '72 hours'
    and (ga4_processed_at is null or google_ads_processed_at is null)
    and (analytics_lease_expires_at is null or analytics_lease_expires_at <= now());
  return found;
end;
$$;

revoke all on function public.lease_purchase_analytics(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.lease_purchase_analytics(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
