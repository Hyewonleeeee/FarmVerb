-- READ ONLY before/after preservation snapshot for the 001/002/003 deployment.
-- Paste this WHOLE file into the SAME project's Supabase SQL Editor, using an
-- authorized administrative role. Export the complete result as CSV before the
-- migrations, then run this unchanged file and export again after the migrations.
-- No raw IDs, emails, license keys, claim hashes/tokens or customer fields leave
-- the database. The output is pseudonymous: keep both exports private.
--
-- Comparison (key = dataset + record_kind + row_handle):
-- 1. Both runs must complete without error and export every result row. Compare
--    snapshot_version and each schema fingerprint first; a mismatch needs review.
--    For each dataset, summary.rows must equal distinct_handles and the number
--    of exported kind=row records; otherwise stop and resolve missing/duplicate
--    identities or an incomplete export before interpreting preservation.
-- 2. For EVERY pre-existing kind=row handle, find the same post handle. Equal
--    baseline_sha256 means ALL baseline fields, including updated_at, survived.
--    A missing handle needs investigation (deletion/ID change); a different hash
--    needs investigation (it may be a legitimate concurrent payment/refund/claim).
--    Never repair, reassign or delete records based only on this comparison.
-- 3. Post-only handles are new rows, not lost data. Legitimate concurrent growth
--    may increase totals; matching totals alone cannot prove preservation.
-- 4. Check the pre snapshot's unmapped=true purchase handle the same way. Its
--    existence/fingerprint must survive even though its customer is not exposed.
--    Expected earlier preflight context: purchases=8 (test=3, unmapped=1), claims=13.
--    User clarification: the other 5 purchases are 4 owner purchases and 1 NFR,
--    not 5 ordinary external-customer sales. Preserve all 8. The relationship
--    between the unmapped record and NFR is UNKNOWN; this SQL does not infer it.
--    If this fresh snapshot differs, reconcile activity since that preflight; do
--    not force it to those counts. Preserve EVERY handle in this fresh snapshot.
--
-- Only fields ADDED by 001/002 are excluded, including account_link_status's
-- intentional backfill and lemon_updated_at. All other existing/custom columns
-- are included. This does not validate the excluded new values: use the separate
-- schema gate and migration/behavior checks for the new schema and guard.
-- SHA-256 is a comparison fingerprint, not encryption or proof of causality.
-- Accidental collisions are negligible but not mathematically impossible; this
-- is not an independently signed audit record. Someone who knows a row's UUID
-- can link its handle. Comparing two complete snapshots cannot reveal transient
-- changes/deletions that were fully restored between the snapshots.
--
-- A timeout, permission/RLS error or truncated export is NOT a passing result.
-- row_security=off does NOT bypass RLS: it fails if RLS would filter this session.
-- Use PostgreSQL's built-in SHA-256; no pgcrypto installation or writes required.
begin isolation level repeatable read read only;
set local statement_timeout = '10s';
set local lock_timeout = '1s';
set local row_security = off;
set local timezone = 'UTC';
set local datestyle = 'ISO, YMD';
set local intervalstyle = 'postgres';
set local extra_float_digits = 3;

with excluded(dataset, columns) as (values
  ('purchases', array['account_link_status', 'lemon_updated_at']::text[]),
  ('purchase_account_claims', array[
    'analytics_recovery_enabled', 'ga4_processed_at', 'google_ads_processed_at',
    'analytics_lease_token', 'analytics_lease_expires_at'
  ]::text[])
), baseline_rows as materialized (
  select 'purchases'::text as dataset, p.id::text as row_id,
    pg_catalog.to_jsonb(p) - e.columns as baseline,
    pg_catalog.jsonb_build_object(
      'test_mode', p.test_mode,
      'unmapped', p.product_slug is null or p.lemon_variant_id is null
    ) as context
  from public.purchases p join excluded e on e.dataset = 'purchases'
  union all
  select 'purchase_account_claims', c.id::text,
    pg_catalog.to_jsonb(c) - e.columns, '{}'::jsonb
  from public.purchase_account_claims c
  join excluded e on e.dataset = 'purchase_account_claims'
), fingerprints as materialized (
  select dataset,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      'farmverb-preservation-v1:' || dataset || ':' || row_id, 'UTF8'
    )), 'hex') as row_handle,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      baseline::text, 'UTF8'
    )), 'hex') as baseline_sha256,
    context
  from baseline_rows
), result as (
  select 'row'::text as record_kind, dataset, row_handle, baseline_sha256,
    context as details from fingerprints
  union all
  select 'summary', e.dataset, ''::text,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      coalesce(pg_catalog.string_agg(f.row_handle || ':' || f.baseline_sha256,
        ',' order by f.row_handle), ''), 'UTF8'
    )), 'hex'),
    pg_catalog.jsonb_build_object(
      'rows', count(f.dataset),
      'distinct_handles', count(distinct f.row_handle),
      'test_rows', count(*) filter (where f.context->>'test_mode' = 'true'),
      'unmapped_rows', count(*) filter (where f.context->>'unmapped' = 'true'),
      'excluded_new_fields', e.columns
    )
  from excluded e left join fingerprints f on f.dataset = e.dataset
  group by e.dataset, e.columns
  union all
  select 'schema', e.dataset, ''::text,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', a.attname,
        'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull
      ) order by a.attname)::text, 'UTF8'
    )), 'hex'),
    pg_catalog.jsonb_build_object('baseline_column_count', count(*))
  from excluded e
  join pg_catalog.pg_attribute a
    on a.attrelid = pg_catalog.to_regclass('public.' || e.dataset)
    and a.attnum > 0 and not a.attisdropped
    and not (a.attname = any(e.columns))
  group by e.dataset
)
select 'farmverb-preservation-v1'::text as snapshot_version,
  pg_catalog.transaction_timestamp() as captured_at_utc,
  record_kind, dataset, row_handle, baseline_sha256, details
from result
order by dataset, record_kind, row_handle;

rollback;
