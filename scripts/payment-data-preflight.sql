-- OPTIONAL aggregate-only check. First review payment-schema-preflight.sql:
-- both BASELINE tables, columns/types and auth.users must exist as expected.
-- Run with an authorized administrative role that sees ALL rows (normally postgres).
-- No migration 001/002/003 columns, customer identifiers, emails, tokens or license
-- values are output. This reads existing rows but never modifies them.
-- Bounded full-table scans: a timeout/permission error is NOT a passing result.
-- row_security=off does NOT bypass RLS: it raises an error if RLS would filter
-- this session's results, preventing misleading zero counts with a limited role.
-- Nonzero anomaly counts require review; never repair/delete customer rows blindly.
-- Compare pre/post totals only while accounting for legitimate concurrent orders.
begin isolation level repeatable read read only;
set local statement_timeout = '10s';
set local lock_timeout = '1s';
set local row_security = off;

select 'purchases' as object, jsonb_build_object(
  'rows',count(*),
  'required_nulls',count(*) filter (where id is null or lemon_order_id is null
    or product_name is null or buyer_email is null or status is null or currency is null
    or total_cents is null or test_mode is null or purchased_at is null
    or created_at is null or updated_at is null),
  'negative_total',count(*) filter (where total_cents < 0),
  'orphan_owner',count(*) filter (where user_id is not null and not exists
    (select 1 from auth.users u where u.id = p.user_id)),
  'duplicate_order_groups',(select count(*) from
    (select lemon_order_id from public.purchases group by lemon_order_id having count(*) > 1) d),
  'unlinked_rows_for_context',count(*) filter (where user_id is null),
  'unmapped_rows_for_context',count(*) filter (where product_slug is null or lemon_variant_id is null),
  'test_rows_for_context',count(*) filter (where test_mode)
) as details from public.purchases p
union all
select 'purchase_account_claims', jsonb_build_object(
  'rows',count(*),
  'required_nulls',count(*) filter (where id is null or token_hash is null or user_id is null
    or product_slug is null or lemon_variant_id is null or expires_at is null or created_at is null),
  'invalid_token_hash_length',count(*) filter (where length(token_hash) <> 64),
  'unpaired_consumption',count(*) filter (where (consumed_at is null) <> (consumed_order_id is null)),
  'orphan_owner',count(*) filter (where not exists (select 1 from auth.users u where u.id = c.user_id)),
  'duplicate_token_groups',(select count(*) from
    (select token_hash from public.purchase_account_claims group by token_hash having count(*) > 1) d),
  'duplicate_consumed_order_groups',(select count(*) from
    (select consumed_order_id from public.purchase_account_claims where consumed_order_id is not null
      group by consumed_order_id having count(*) > 1) d)
) from public.purchase_account_claims c;

rollback;
