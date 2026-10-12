-- Apply before the matching application release. No historical order is deleted
-- or reassigned. New recovery state is private to the service-role worker.
begin;

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

notify pgrst, 'reload schema';
commit;
