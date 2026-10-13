-- Compatibility barrier for d02ebca direct writes AND the new payment RPC.
-- Additive: no purchase, claim, inbox entry or license is rewritten/deleted.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

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
