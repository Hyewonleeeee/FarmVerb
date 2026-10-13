-- Apply before the matching application release. No historical order is deleted
-- or reassigned. New recovery state is private to the service-role worker.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.purchases add column if not exists account_link_status text not null default 'email_allowed';
alter table public.purchases add column if not exists lemon_updated_at timestamptz;
update public.purchases set account_link_status = 'linked' where user_id is not null and account_link_status = 'email_allowed';
alter table public.purchases add constraint purchases_account_link_status_check
  check (account_link_status in ('email_allowed', 'claim_review', 'linked'));

create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_name text not null check (event_name in ('order_created', 'order_refunded')),
  lemon_order_id text not null,
  -- Minimal normalized snapshot; never the raw webhook, signature, or claim token.
  order_data jsonb not null,
  claim_hash text check (claim_hash is null or claim_hash ~ '^[a-f0-9]{64}$'),
  claim_present boolean not null default false,
  source text not null check (source in ('webhook', 'reconciliation')),
  state text not null default 'pending' check (state in ('pending', 'processing', 'processed', 'quarantined', 'failed')),
  reason text,
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);
create index payment_webhook_events_order_index on public.payment_webhook_events (lemon_order_id, received_at desc);
create index payment_webhook_events_pending_index on public.payment_webhook_events (state, updated_at)
  where state <> 'processed';
alter table public.payment_webhook_events enable row level security;
revoke all on table public.payment_webhook_events from public, anon, authenticated;
grant all on table public.payment_webhook_events to service_role;

create function public.claim_payment_webhook_event(p_event_id uuid, p_allow_quarantined boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare claimed public.payment_webhook_events;
begin
  update public.payment_webhook_events
  set state = 'processing', attempts = attempts + 1,
      lease_token = gen_random_uuid(), lease_until = now() + interval '2 minutes', updated_at = now()
  where id = p_event_id and (
    state in ('pending', 'failed')
    or (state = 'quarantined' and p_allow_quarantined)
    or (state = 'processing' and lease_until < now())
  )
  returning * into claimed;
  if not found then return null; end if;
  return to_jsonb(claimed);
end;
$$;
revoke all on function public.claim_payment_webhook_event(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_payment_webhook_event(uuid, boolean) to service_role;

-- ON CONFLICT locks the order row before evaluating the merge. Both duplicate
-- deliveries and concurrent created/refunded events obey the same state rule.
create function public.persist_payment_purchase(
  p_order jsonb,
  p_status text,
  p_product_slug text,
  p_user_id uuid,
  p_link_status text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare saved public.purchases;
begin
  if p_order->>'lemonOrderId' is null or p_order->>'lemonVariantId' is null
     or p_order->>'testMode' is distinct from 'false'
     or p_product_slug is null
     or p_status is null or p_status not in ('pending', 'paid', 'failed', 'refunded', 'partial_refund', 'fraudulent')
     or p_link_status is null or p_link_status not in ('email_allowed', 'claim_review', 'linked')
     or (p_link_status = 'linked' and p_user_id is null) then
    raise exception 'Invalid verified purchase input' using errcode = '22023';
  end if;

  insert into public.purchases as existing (
    lemon_order_id, lemon_variant_id, product_slug, product_name, buyer_email,
    user_id, account_link_status, status, currency, total_cents, test_mode,
    purchased_at, lemon_updated_at, updated_at
  ) values (
    p_order->>'lemonOrderId', p_order->>'lemonVariantId', p_product_slug,
    p_order->>'productName', p_order->>'buyerEmail', p_user_id,
    case when p_user_id is not null then 'linked' else p_link_status end,
    p_status, p_order->>'currency', (p_order->>'totalCents')::integer, false,
    (p_order->>'purchasedAt')::timestamptz, (p_order->>'updatedAt')::timestamptz, now()
  )
  on conflict (lemon_order_id) do update set
    -- An event can fill an empty owner only. It can never transfer a purchase.
    user_id = coalesce(existing.user_id, excluded.user_id),
    account_link_status = case
      when coalesce(existing.user_id, excluded.user_id) is not null then 'linked'
      when existing.account_link_status = 'claim_review' or excluded.account_link_status = 'claim_review' then 'claim_review'
      else 'email_allowed' end,
    status = case
      when existing.status in ('refunded', 'fraudulent') then existing.status
      when excluded.status in ('refunded', 'fraudulent') then excluded.status
      when existing.status = 'partial_refund' then existing.status
      when excluded.status = 'partial_refund' then excluded.status
      when existing.status = 'paid' and excluded.status in ('pending', 'failed') then existing.status
      when existing.lemon_updated_at > excluded.lemon_updated_at then existing.status
      else excluded.status end,
    total_cents = case when coalesce(existing.lemon_updated_at, '-infinity'::timestamptz) <= excluded.lemon_updated_at
      and not (existing.status in ('paid', 'partial_refund', 'refunded', 'fraudulent') and excluded.status in ('pending', 'failed')) then excluded.total_cents else existing.total_cents end,
    currency = case when coalesce(existing.lemon_updated_at, '-infinity'::timestamptz) <= excluded.lemon_updated_at
      and not (existing.status in ('paid', 'partial_refund', 'refunded', 'fraudulent') and excluded.status in ('pending', 'failed')) then excluded.currency else existing.currency end,
    buyer_email = case when coalesce(existing.lemon_updated_at, '-infinity'::timestamptz) <= excluded.lemon_updated_at
      and not (existing.status in ('paid', 'partial_refund', 'refunded', 'fraudulent') and excluded.status in ('pending', 'failed')) then excluded.buyer_email else existing.buyer_email end,
    lemon_updated_at = greatest(existing.lemon_updated_at, excluded.lemon_updated_at),
    updated_at = now()
  where existing.lemon_variant_id = excluded.lemon_variant_id
  returning * into saved;

  if not found then
    raise exception 'Order variant conflict requires review' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', saved.id, 'lemon_order_id', saved.lemon_order_id,
    'product_slug', saved.product_slug, 'status', saved.status,
    'user_id', saved.user_id, 'account_link_status', saved.account_link_status
  );
end;
$$;
revoke all on function public.persist_payment_purchase(jsonb, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.persist_payment_purchase(jsonb, text, text, uuid, text) to service_role;

-- Fresh installations must publish the new columns/RPC and their legacy-write
-- guard in the SAME commit. 003 repeats this block for installations that already
-- applied the original 2260fa1 migration. Keep both copies identical (SQL test).
-- BEGIN SHARED PURCHASE WRITE GUARD
-- Do not depend on a project's historical default privileges. Browser clients
-- use authenticated server routes, never these tables. Restrictive policies also
-- deny access if a historical permissive policy/column grant remains present.
alter table public.purchases enable row level security;
alter table public.purchase_account_claims enable row level security;
alter table public.payment_webhook_events enable row level security;
revoke all on table public.purchases, public.purchase_account_claims,
  public.payment_webhook_events from public, anon, authenticated, service_role;
grant usage on schema public to service_role;
grant select, insert, update on table public.purchases,
  public.purchase_account_claims, public.payment_webhook_events to service_role;

drop policy if exists purchases_deny_browser on public.purchases;
create policy purchases_deny_browser on public.purchases as restrictive
  for all to anon, authenticated using (false) with check (false);
drop policy if exists purchase_account_claims_deny_browser on public.purchase_account_claims;
create policy purchase_account_claims_deny_browser on public.purchase_account_claims as restrictive
  for all to anon, authenticated using (false) with check (false);
drop policy if exists payment_webhook_events_deny_browser on public.payment_webhook_events;
create policy payment_webhook_events_deny_browser on public.payment_webhook_events as restrictive
  for all to anon, authenticated using (false) with check (false);

-- A narrow SECURITY DEFINER trigger can read private claim evidence and check
-- auth.users deletion without granting callers access to auth.users. It exposes
-- no RPC, accepts no arguments, uses qualified names, and never runs dynamic SQL.
create or replace function public.guard_purchase_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  claim_owner uuid;
  claim_variant text;
  requires_claim boolean;
  deleting_owner boolean := false;
  regressive_snapshot boolean := false;
begin
  if tg_op = 'UPDATE' then
    -- Never let another order, variant or environment inherit this entitlement.
    if new.id is distinct from old.id
       or new.lemon_order_id is distinct from old.lemon_order_id
       or new.lemon_variant_id is distinct from old.lemon_variant_id
       or new.test_mode is distinct from old.test_mode
       or (old.product_slug is not null and new.product_slug is distinct from old.product_slug) then
      raise exception 'Purchase identity conflict requires review' using errcode = '22023';
    end if;

    -- Preserve the existing FK ON DELETE SET NULL behavior, but do not make a
    -- deleted account's purchase available to another billing-email account.
    deleting_owner := old.user_id is not null and new.user_id is null
      and not exists (select 1 from auth.users where id = old.user_id);

    regressive_snapshot :=
      (old.status in ('refunded', 'fraudulent') and new.status is distinct from old.status)
      or (old.status = 'partial_refund' and new.status not in ('partial_refund', 'refunded', 'fraudulent'))
      or (old.status = 'paid' and new.status in ('pending', 'failed'))
      or (old.lemon_updated_at > new.lemon_updated_at);

    -- These rules run after ON CONFLICT has locked the existing row; old webhook
    -- upserts cannot bypass them. They match the RPC's terminal-state policy.
    new.status := case
      when old.status in ('refunded', 'fraudulent') then old.status
      when new.status in ('refunded', 'fraudulent') then new.status
      when old.status = 'partial_refund' then old.status
      when new.status = 'partial_refund' then new.status
      when old.status = 'paid' and new.status in ('pending', 'failed') then old.status
      when old.lemon_updated_at > new.lemon_updated_at then old.status
      else new.status end;

    if regressive_snapshot then
      new.total_cents := old.total_cents;
      new.currency := old.currency;
      new.buyer_email := old.buyer_email;
      new.product_name := old.product_name;
      new.purchased_at := old.purchased_at;
    end if;
    new.lemon_updated_at := greatest(old.lemon_updated_at, new.lemon_updated_at);

    if old.user_id is not null then
      if deleting_owner then
        new.account_link_status := 'claim_review';
      else
        new.user_id := old.user_id;
        new.account_link_status := 'linked';
      end if;
      return new;
    end if;
  end if;

  select user_id, lemon_variant_id into claim_owner, claim_variant
    from public.purchase_account_claims
    where consumed_order_id = new.lemon_order_id and consumed_at is not null;

  requires_claim := new.account_link_status = 'claim_review'
    or (tg_op = 'UPDATE' and old.account_link_status = 'claim_review')
    or claim_owner is not null
    or exists (
      select 1 from public.payment_webhook_events
      where lemon_order_id = new.lemon_order_id
        and (claim_present or source = 'reconciliation')
    );

  if requires_claim and not coalesce(
    new.user_id = claim_owner and new.lemon_variant_id = claim_variant, false
  ) then
    -- Do not abort a legacy bulk account UPDATE: other eligible purchases must
    -- still link successfully. RETURNING contains the actual protected row.
    new.user_id := null;
    new.account_link_status := 'claim_review';
  elsif new.user_id is not null then
    new.account_link_status := 'linked';
  elsif requires_claim or new.account_link_status = 'linked' then
    new.account_link_status := 'claim_review';
  else
    -- Genuine legacy no-claim purchases retain their existing email flow.
    new.account_link_status := 'email_allowed';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_purchase_write() from public, anon, authenticated, service_role;

-- DROP/CREATE is atomic with the rest of this migration. A failed lock/statement
-- leaves the previous schema and guard intact; a successful re-run is harmless.
drop trigger if exists purchases_guard_write on public.purchases;
create trigger purchases_guard_write
  before insert or update on public.purchases
  for each row execute function public.guard_purchase_write();

-- END SHARED PURCHASE WRITE GUARD

notify pgrst, 'reload schema';
commit;
