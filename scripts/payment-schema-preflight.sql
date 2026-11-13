-- Read-only catalog inventory for commit 32ae5f8. Paste this WHOLE file into
-- Supabase SQL Editor using an authorized administrative role (normally postgres).
-- Safe before 001/002/003: absent NEW objects are expected, not an error.
-- Also useful after migration, alongside payment-schema-check.sql.
-- No application RPC is invoked and no customer row is read.
-- CUSTOM defaults, function bodies and trigger arguments are intentionally hidden:
-- custom DB webhook triggers can contain credentials. Hashes are comparison aids,
-- not proof that a function has the correct behavior.
-- SQL string literals in constraint/index/policy definitions are redacted too.
-- Compare their full definitions privately or hashes against a same-version
-- staging schema. Noncanonical function settings are represented only by hashes.
-- This is an inventory, NOT an automatic deployment approval.
begin isolation level repeatable read read only;
set local statement_timeout = '10s';
set local lock_timeout = '1s';

with
expected(table_name, column_name, type_name, not_null, default_expr, phase) as (values
  ('purchases','id','uuid',true,'gen_random_uuid()','BASELINE'),
  ('purchases','lemon_order_id','text',true,null,'BASELINE'),
  ('purchases','lemon_variant_id','text',false,null,'BASELINE'),
  ('purchases','product_slug','text',false,null,'BASELINE'),
  ('purchases','product_name','text',true,null,'BASELINE'),
  ('purchases','buyer_email','text',true,null,'BASELINE'),
  ('purchases','user_id','uuid',false,null,'BASELINE'),
  ('purchases','status','text',true,null,'BASELINE'),
  ('purchases','currency','text',true,null,'BASELINE'),
  ('purchases','total_cents','integer',true,null,'BASELINE'),
  ('purchases','test_mode','boolean',true,'false','BASELINE'),
  ('purchases','lemon_license_key','text',false,null,'BASELINE'),
  ('purchases','download_url','text',false,null,'BASELINE'),
  ('purchases','purchased_at','timestamp with time zone',true,null,'BASELINE'),
  ('purchases','created_at','timestamp with time zone',true,'now()','BASELINE'),
  ('purchases','updated_at','timestamp with time zone',true,'now()','BASELINE'),
  ('purchase_account_claims','id','uuid',true,'gen_random_uuid()','BASELINE'),
  ('purchase_account_claims','token_hash','text',true,null,'BASELINE'),
  ('purchase_account_claims','user_id','uuid',true,null,'BASELINE'),
  ('purchase_account_claims','product_slug','text',true,null,'BASELINE'),
  ('purchase_account_claims','lemon_variant_id','text',true,null,'BASELINE'),
  ('purchase_account_claims','expires_at','timestamp with time zone',true,null,'BASELINE'),
  ('purchase_account_claims','consumed_at','timestamp with time zone',false,null,'BASELINE'),
  ('purchase_account_claims','consumed_order_id','text',false,null,'BASELINE'),
  ('purchase_account_claims','created_at','timestamp with time zone',true,'now()','BASELINE'),
  ('purchases','account_link_status','text',true,'''email_allowed''::text','NEW'),
  ('purchases','lemon_updated_at','timestamp with time zone',false,null,'NEW'),
  ('purchase_account_claims','analytics_recovery_enabled','boolean',true,'false','NEW'),
  ('purchase_account_claims','ga4_processed_at','timestamp with time zone',false,null,'NEW'),
  ('purchase_account_claims','google_ads_processed_at','timestamp with time zone',false,null,'NEW'),
  ('purchase_account_claims','analytics_lease_token','uuid',false,null,'NEW'),
  ('purchase_account_claims','analytics_lease_expires_at','timestamp with time zone',false,null,'NEW'),
  ('payment_webhook_events','id','uuid',true,'gen_random_uuid()','NEW'),
  ('payment_webhook_events','event_key','text',true,null,'NEW'),
  ('payment_webhook_events','event_name','text',true,null,'NEW'),
  ('payment_webhook_events','lemon_order_id','text',true,null,'NEW'),
  ('payment_webhook_events','order_data','jsonb',true,null,'NEW'),
  ('payment_webhook_events','claim_hash','text',false,null,'NEW'),
  ('payment_webhook_events','claim_present','boolean',true,'false','NEW'),
  ('payment_webhook_events','source','text',true,null,'NEW'),
  ('payment_webhook_events','state','text',true,'''pending''::text','NEW'),
  ('payment_webhook_events','reason','text',false,null,'NEW'),
  ('payment_webhook_events','attempts','integer',true,'0','NEW'),
  ('payment_webhook_events','lease_token','uuid',false,null,'NEW'),
  ('payment_webhook_events','lease_until','timestamp with time zone',false,null,'NEW'),
  ('payment_webhook_events','received_at','timestamp with time zone',true,'now()','NEW'),
  ('payment_webhook_events','updated_at','timestamp with time zone',true,'now()','NEW'),
  ('payment_webhook_events','processed_at','timestamp with time zone',false,null,'NEW')
), targets(table_name) as (values
  ('purchases'), ('purchase_account_claims'), ('payment_webhook_events')
), relations as (
  select t.table_name, c.* from targets t
  left join pg_class c on c.oid = to_regclass('public.' || t.table_name)
), actual as (
  select r.table_name, a.attname::text as column_name,
    format_type(a.atttypid,a.atttypmod) as type_name, a.attnotnull as not_null,
    a.attidentity, a.attgenerated, a.attacl,
    pg_get_expr(d.adbin,d.adrelid) as default_expr
  from relations r join pg_attribute a on a.attrelid = r.oid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped
), wanted_roles(role_name) as (values ('anon'), ('authenticated'), ('service_role')),
functions as (
  select p.* from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'claim_payment_webhook_event','persist_payment_purchase',
    'lease_purchase_analytics','guard_purchase_write')
), report as (
  select '00_SESSION'::text as section, current_database()::text as object,
    jsonb_build_object('current_user',current_user,'session_user',session_user,
      'read_only',current_setting('transaction_read_only'),
      'server_version',current_setting('server_version'),
      'history_table',to_regclass('supabase_migrations.schema_migrations')::text,
      'auth_users',to_regclass('auth.users')::text,
      'uuid_function',to_regprocedure('gen_random_uuid()')::text,
      'public_schema_create',has_schema_privilege(current_user,'public','CREATE')) as details
  union all
  select '01_TABLE', 'public.' || r.table_name,
    jsonb_build_object('exists',r.oid is not null,'kind',r.relkind,
      'owner',pg_get_userbyid(r.relowner),'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,
      'column_count',(select count(*) from actual a where a.table_name = r.table_name),
      'acl',r.relacl::text, 'current_role_is_owner_member',
      case when r.oid is not null then pg_has_role(current_user,r.relowner,'USAGE') end)
  from relations r
  union all
  select '02_COLUMN', 'public.' || coalesce(e.table_name,a.table_name) || '.' || coalesce(e.column_name,a.column_name),
    jsonb_build_object('phase',coalesce(e.phase,'EXTRA'),
      'result',case when e.column_name is null then 'REVIEW_EXTRA_COLUMN'
        when a.column_name is null and e.phase = 'NEW' then 'EXPECTED_ABSENT_BEFORE_ONLY'
        when a.column_name is null then 'MISSING_BASELINE'
        when a.type_name <> e.type_name or a.not_null <> e.not_null
          or a.attidentity <> '' or a.attgenerated <> ''
          or regexp_replace(a.default_expr,'^(public|extensions|pg_catalog)\.', '') is distinct from e.default_expr
          then 'REVIEW_DEFINITION_DIFFERENCE'
        when e.phase = 'NEW' then 'MATCH_NEW_REVIEW_IF_BEFORE'
        else 'MATCH_BASELINE' end,
      'expected_type',e.type_name,'actual_type',a.type_name,
      'expected_not_null',e.not_null,'actual_not_null',a.not_null,
      'expected_default',e.default_expr,
      'actual_default',case when a.default_expr is null then null
        when regexp_replace(a.default_expr,'^(public|extensions|pg_catalog)\.', '')
          in ('gen_random_uuid()','now()','false','0','''email_allowed''::text','''pending''::text')
          then a.default_expr else '[CUSTOM: review privately]' end,
      'default_md5',md5(a.default_expr),'identity',a.attidentity,'generated',a.attgenerated,
      'column_acl',a.attacl::text)
  from expected e full join actual a using (table_name,column_name)
  union all
  select '03_CONSTRAINT', r.table_name || '.' || c.conname,
    jsonb_build_object('type',c.contype,'validated',c.convalidated,
      'deferrable',c.condeferrable,'initially_deferred',c.condeferred,
      'definition_literals_redacted',regexp_replace(pg_get_constraintdef(c.oid,true),
        $redact$'(?:[^'\\]|\\.|'')*'$redact$,'[literal redacted]','g'),
      'definition_md5',md5(pg_get_constraintdef(c.oid,true)))
  from relations r join pg_constraint c on c.conrelid = r.oid
  union all
  select '04_INDEX', r.table_name || '.' || c.relname,
    jsonb_build_object('unique',i.indisunique,'primary',i.indisprimary,
      'valid',i.indisvalid,'ready',i.indisready,'immediate',i.indimmediate,
      'definition_literals_redacted',regexp_replace(pg_get_indexdef(i.indexrelid),
        $redact$'(?:[^'\\]|\\.|'')*'$redact$,'[literal redacted]','g'),
      'definition_md5',md5(pg_get_indexdef(i.indexrelid)))
  from relations r join pg_index i on i.indrelid = r.oid join pg_class c on c.oid = i.indexrelid
  union all
  select '05_POLICY', r.table_name || '.' || p.polname,
    jsonb_build_object('permissive',p.polpermissive,'command',p.polcmd,
      'roles',(select jsonb_agg(case when x = 0 then 'PUBLIC' else pg_get_userbyid(x) end)
        from unnest(p.polroles) x),
      'using_literals_redacted',regexp_replace(pg_get_expr(p.polqual,p.polrelid),
        $redact$'(?:[^'\\]|\\.|'')*'$redact$,'[literal redacted]','g'),
      'check_literals_redacted',regexp_replace(pg_get_expr(p.polwithcheck,p.polrelid),
        $redact$'(?:[^'\\]|\\.|'')*'$redact$,'[literal redacted]','g'),
      'using_md5',md5(pg_get_expr(p.polqual,p.polrelid)),
      'check_md5',md5(pg_get_expr(p.polwithcheck,p.polrelid)))
  from relations r join pg_policy p on p.polrelid = r.oid
  union all
  select '06_ROLE', w.role_name,
    jsonb_build_object('exists',p.oid is not null,'superuser',p.rolsuper,'bypass_rls',p.rolbypassrls,
      'inherit',p.rolinherit,'can_login',p.rolcanlogin)
  from wanted_roles w left join pg_roles p on p.rolname = w.role_name
  union all
  select '07_TABLE_PRIVILEGE', w.role_name || ':' || r.table_name,
    jsonb_build_object('select',has_table_privilege(p.oid,r.oid,'SELECT'),
      'insert',has_table_privilege(p.oid,r.oid,'INSERT'),'update',has_table_privilege(p.oid,r.oid,'UPDATE'),
      'delete',has_table_privilege(p.oid,r.oid,'DELETE'),'truncate',has_table_privilege(p.oid,r.oid,'TRUNCATE'),
      'trigger',has_table_privilege(p.oid,r.oid,'TRIGGER'),
      'any_column_select',has_any_column_privilege(p.oid,r.oid,'SELECT'),
      'any_column_insert',has_any_column_privilege(p.oid,r.oid,'INSERT'),
      'any_column_update',has_any_column_privilege(p.oid,r.oid,'UPDATE'),
      'public_schema_usage',has_schema_privilege(p.oid,'public','USAGE'))
  from wanted_roles w left join pg_roles p on p.rolname = w.role_name cross join relations r
  union all
  select '08_ROLE_MEMBERSHIP', pg_get_userbyid(m.member) || ' -> ' || pg_get_userbyid(m.roleid),
    jsonb_build_object('admin_option',m.admin_option)
  from pg_auth_members m
  union all
  select '09_DEFAULT_ACL', pg_get_userbyid(d.defaclrole) || ':' || coalesce(n.nspname,'ALL_SCHEMAS') || ':' || d.defaclobjtype::text,
    jsonb_build_object('acl',d.defaclacl::text)
  from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
  where d.defaclnamespace = 0 or n.nspname in ('public','auth')
  union all
  select '10_FUNCTION', p.oid::regprocedure::text,
    jsonb_build_object('owner',pg_get_userbyid(p.proowner),'kind',p.prokind,
      'result',pg_get_function_result(p.oid),'argument_names',p.proargnames,
      'argument_default_count',p.pronargdefaults,'argument_defaults_md5',md5(p.proargdefaults::text),
      'security_definer',p.prosecdef,'canonical_search_path',
        (select v from unnest(p.proconfig) v where v in
          ('search_path=public, pg_temp','search_path=pg_catalog, pg_temp') limit 1),
      'settings_count',cardinality(p.proconfig),'settings_md5',md5(p.proconfig::text),'acl',p.proacl::text,
      'body_md5',md5(p.prosrc),'owner_auth_users_select',
        has_table_privilege(p.proowner,to_regclass('auth.users'),'SELECT'),
      'owner_auth_schema_usage',case when to_regnamespace('auth') is not null
        then has_schema_privilege(p.proowner,to_regnamespace('auth'),'USAGE') end,
      'owner_bypass_rls',(select rolbypassrls or rolsuper from pg_roles where oid=p.proowner))
  from functions p
  union all
  select '11_FUNCTION_PRIVILEGE', w.role_name || ':' || p.oid::regprocedure::text,
    jsonb_build_object('execute',has_function_privilege(r.oid,p.oid,'EXECUTE'))
  from functions p cross join wanted_roles w left join pg_roles r on r.rolname = w.role_name
  union all
  select '12_TRIGGER', r.table_name || '.' || t.tgname,
    jsonb_build_object('enabled',t.tgenabled,'type_bits',t.tgtype,
      'has_when',t.tgqual is not null,'argument_count',t.tgnargs,'column_filter',t.tgattr::text,
      'definition_md5',md5(pg_get_triggerdef(t.oid)),
      'function',p.oid::regprocedure::text,'function_owner',pg_get_userbyid(p.proowner),
      'security_definer',p.prosecdef,'canonical_search_path',
        (select v from unnest(p.proconfig) v where v in
          ('search_path=public, pg_temp','search_path=pg_catalog, pg_temp') limit 1),
      'settings_count',cardinality(p.proconfig),'settings_md5',md5(p.proconfig::text),'body_md5',md5(p.prosrc))
  from relations r join pg_trigger t on t.tgrelid = r.oid
  join pg_proc p on p.oid = t.tgfoid where not t.tgisinternal
  union all
  select '13_NEW_RELATION_NAME', n.name,
    jsonb_build_object('exists',c.oid is not null,'kind',c.relkind,
      'before_action',case when c.oid is null then 'EXPECTED_ABSENT' else 'STOP_REVIEW_COLLISION' end)
  from (values ('payment_webhook_events'),('payment_webhook_events_pkey'),
    ('payment_webhook_events_event_key_key'),('payment_webhook_events_order_index'),
    ('payment_webhook_events_pending_index')) n(name)
  left join pg_class c on c.oid = to_regclass('public.' || n.name)
  union all
  select '14_NEW_FUNCTION_SIGNATURE', f.name,
    jsonb_build_object('exists',to_regprocedure(f.name) is not null,'creation',f.creation,
      'before_action',case when to_regprocedure(f.name) is null then 'EXPECTED_ABSENT'
        else 'STOP_REVIEW_EXISTING_DEFINITION' end)
  from (values ('public.claim_payment_webhook_event(uuid,boolean)','CREATE'),
    ('public.persist_payment_purchase(jsonb,text,text,uuid,text)','CREATE'),
    ('public.lease_purchase_analytics(uuid,uuid,uuid)','CREATE OR REPLACE'),
    ('public.guard_purchase_write()','CREATE OR REPLACE')) f(name,creation)
  union all
  select '15_NEW_CONSTRAINT_NAME','purchases_account_link_status_check',
    jsonb_build_object('exists',exists (select 1 from pg_constraint where
      conrelid = to_regclass('public.purchases') and conname = 'purchases_account_link_status_check'))
  union all
  select '16_NEW_TYPE_NAME','public.payment_webhook_events',
    jsonb_build_object('exists',to_regtype('public.payment_webhook_events') is not null)
)
select section, object, details from report order by section, object;

rollback;
