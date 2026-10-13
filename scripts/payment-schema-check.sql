-- Read-only post-migration gate. Use an authorized administrative DB session;
-- no customer rows, credentials, emails or claim tokens are read/output.
-- This verifies catalog configuration, not PostgREST or real payment delivery.
begin read only;
do $$
declare
  relation_name text;
  function_name text;
  browser_role text;
  expected record;
begin
  for expected in select * from (values
    ('public.purchases', 'account_link_status', 'text', true),
    ('public.purchases', 'lemon_updated_at', 'timestamp with time zone', false),
    ('public.purchase_account_claims', 'analytics_recovery_enabled', 'boolean', true),
    ('public.purchase_account_claims', 'ga4_processed_at', 'timestamp with time zone', false),
    ('public.purchase_account_claims', 'google_ads_processed_at', 'timestamp with time zone', false),
    ('public.purchase_account_claims', 'analytics_lease_token', 'uuid', false),
    ('public.purchase_account_claims', 'analytics_lease_expires_at', 'timestamp with time zone', false)
  ) as required_columns(relation_name, column_name, type_name, not_null) loop
    if not exists (
      select 1 from pg_attribute
      where attrelid = to_regclass(expected.relation_name)
        and attname = expected.column_name and not attisdropped
        and format_type(atttypid, atttypmod) = expected.type_name
        and attnotnull = expected.not_null
    ) then
      raise exception 'Missing or incompatible payment column: %.%', expected.relation_name, expected.column_name;
    end if;
  end loop;

  foreach relation_name in array array[
    'public.purchases', 'public.purchase_account_claims', 'public.payment_webhook_events'
  ] loop
    if to_regclass(relation_name) is null then
      raise exception 'Missing payment table: %', relation_name;
    end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass(relation_name)) then
      raise exception 'RLS disabled: %', relation_name;
    end if;
    if not has_table_privilege('service_role', relation_name, 'SELECT')
       or not has_table_privilege('service_role', relation_name, 'INSERT')
       or not has_table_privilege('service_role', relation_name, 'UPDATE')
       or has_table_privilege('service_role', relation_name, 'DELETE')
       or has_table_privilege('service_role', relation_name, 'TRUNCATE') then
      raise exception 'Unexpected service-role table privileges: %', relation_name;
    end if;
    foreach browser_role in array array['anon', 'authenticated'] loop
      if not exists (
        select 1 from pg_policy
        where polrelid = to_regclass(relation_name) and not polpermissive
          and polcmd = '*' and (browser_role::regrole)::oid = any(polroles)
          and pg_get_expr(polqual, polrelid) = 'false'
          and pg_get_expr(polwithcheck, polrelid) = 'false'
      ) then
        raise exception 'Missing restrictive browser policy: % / %', relation_name, browser_role;
      end if;
    end loop;
  end loop;

  if not (select rolbypassrls from pg_roles where rolname = 'service_role') then
    raise exception 'Expected Supabase service_role BYPASSRLS';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.purchases'::regclass and t.tgname = 'purchases_guard_write'
      and not t.tgisinternal and t.tgenabled in ('O', 'A') and t.tgtype = 23
      and p.oid = to_regprocedure('public.guard_purchase_write()') and p.prosecdef
      and 'search_path=pg_catalog, pg_temp' = any(p.proconfig)
  ) then
    raise exception 'Missing or unsafe purchase write guard';
  end if;

  foreach function_name in array array[
    'public.claim_payment_webhook_event(uuid,boolean)',
    'public.persist_payment_purchase(jsonb,text,text,uuid,text)',
    'public.lease_purchase_analytics(uuid,uuid,uuid)'
  ] loop
    if to_regprocedure(function_name) is null then
      raise exception 'Missing payment RPC: %', function_name;
    end if;
    if not has_function_privilege('service_role', function_name, 'EXECUTE')
       or has_function_privilege('anon', function_name, 'EXECUTE')
       or has_function_privilege('authenticated', function_name, 'EXECUTE')
       or (select prosecdef from pg_proc where oid = to_regprocedure(function_name)) then
      raise exception 'Unexpected payment RPC privileges: %', function_name;
    end if;
  end loop;
  raise notice 'Payment catalog checks passed. PostgREST and isolated behavior checks are still required.';
end;
$$;
rollback;
