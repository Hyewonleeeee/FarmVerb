import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { getOfficialProductForLivePurchase, OFFICIAL_LIVE_VARIANT_IDS } from '../../lib/products/catalog.ts';

// All database execution is in memory. No env files, credentials, HTTP, Supabase
// connection, checkout, or production customer data are used by this suite.
// The pinned d02ebca source below is a fixture, not a hand-written model of the
// legacy route: only the Supabase transport is replaced with real local SQL.
const migrationDirectory = new URL('./', import.meta.url);
const baselineFiles = [
  '202607130001_create_purchases.sql',
  '202609210001_create_purchase_account_claims.sql',
  '202609210002_reload_postgrest_schema.sql'
];
const firstUpgrade = '202610130001_payment_event_recovery.sql';
const secondUpgrade = '202610130002_analytics_checkout_recovery.sql';
const compatibilityUpgrade = '202610130003_purchase_write_guards.sql';
const owner = '10000000-0000-4000-8000-000000000001';
const billingUser = '10000000-0000-4000-8000-000000000002';
const buyerEmail = 'billing@example.invalid';
const variant = '2147845';
const slug = 'boseong-green-tea';
const order = (id, overrides = {}) => ({
  lemonOrderId: id, lemonVariantId: variant, storeId: 'synthetic-store',
  productName: 'Boseong Green Tea', buyerEmail, status: 'paid', currency: 'USD',
  totalCents: 2900, testMode: false, purchasedAt: '2026-10-13T01:00:00Z',
  updatedAt: '2026-10-13T02:00:00Z', ...overrides
});
const migrationSql = (name) => readFileSync(new URL(name, migrationDirectory), 'utf8');
const sharedGuard = /-- BEGIN SHARED PURCHASE WRITE GUARD[\s\S]*?-- END SHARED PURCHASE WRITE GUARD/;

async function database({ upgraded = false, asService = true } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    insert into auth.users values ('${owner}'), ('${billingUser}');
    grant usage on schema public to anon, authenticated, service_role;
  `);
  for (const file of baselineFiles) await db.exec(migrationSql(file));
  // Model browser grants typically present in Supabase so that RLS itself must
  // protect the existing tables. Missing ACLs alone must not make this pass.
  await db.exec('grant select, insert, update on public.purchases, public.purchase_account_claims to anon, authenticated;');
  if (upgraded) {
    for (const file of readdirSync(migrationDirectory).filter(name => name.endsWith('.sql') && !baselineFiles.includes(name)).sort()) {
      await db.exec(migrationSql(file));
    }
    // Deliberately no injected service_role grants here. The full migration set
    // must establish the table privileges on which its invoker RPCs depend.
  } else {
    await db.exec('grant select, insert, update on public.purchases, public.purchase_account_claims to service_role;');
  }
  if (asService) await db.exec('set role service_role');
  return db;
}

// A deliberately small PostgREST adapter. The predicates and update/upsert
// values come from the actual application source, not duplicated test filters.
function sqlSupabase(db, { userId = billingUser, email = buyerEmail, beforeWrite } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId, email, email_confirmed_at: '2026-10-12T00:00:00Z' } }, error: null }) },
    from(table) {
      assert.equal(table, 'purchases');
      let operation = 'select'; let values = {}; let columns = '*'; let conflict;
      let single = false; let orderBy = ''; const predicates = [];
      const query = {
        update(value) { operation = 'update'; values = value; return query; },
        upsert(value, options) { operation = 'upsert'; values = value; conflict = options.onConflict; return query; },
        select(value) { columns = value; return query; },
        eq(key, value) { predicates.push([key, '=', value]); return query; },
        is(key, value) { assert.equal(value, null); predicates.push([key, 'is', value]); return query; },
        in(key, value) { predicates.push([key, 'in', value]); return query; },
        order(key, options) { orderBy = ` order by ${key} ${options.ascending ? 'asc' : 'desc'}`; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          return (async () => {
            if (operation !== 'select') await beforeWrite?.({ operation, values });
            const params = []; const parameter = (value) => { params.push(value); return `$${params.length}`; };
            let sql;
            if (operation === 'upsert') {
              const keys = Object.keys(values);
              sql = `insert into public.purchases (${keys.join(',')}) values (${keys.map(key => parameter(values[key])).join(',')}) on conflict (${conflict}) do update set ${keys.filter(key => key !== conflict).map(key => `${key}=excluded.${key}`).join(',')} returning ${columns}`;
            } else {
              sql = operation === 'update'
                ? `update public.purchases set ${Object.entries(values).map(([key, value]) => `${key}=${parameter(value)}`).join(',')}`
                : `select ${columns} from public.purchases`;
              if (predicates.length) sql += ' where ' + predicates.map(([key, operator, value]) => operator === 'is'
                ? `${key} is null` : operator === 'in' ? `${key} in (${value.map(parameter).join(',')})` : `${key}=${parameter(value)}`).join(' and ');
              sql += operation === 'update' ? ` returning ${columns}` : orderBy;
            }
            try {
              const { rows } = await db.query(sql, params);
              return { data: single ? rows[0] ?? null : rows, error: null };
            } catch (error) {
              return { data: null, error: { code: error.code, message: 'Synthetic SQL execution failed.' } };
            }
          })().then(resolve, reject);
        }
      };
      return query;
    }
  };
}

function loadSource(source, supabase) {
  const imports = {
    'next/server': { NextResponse: { json: (body, options = {}) => Response.json(body, options) } },
    '@/lib/payments/purchases': { ENTITLED_PURCHASE_STATUSES: ['paid', 'partial_refund'] },
    '@/lib/products/catalog': { getOfficialProductForLivePurchase, OFFICIAL_LIVE_VARIANT_IDS },
    '@/lib/supabase/server': { createServerSupabaseClient: () => supabase }
  };
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exported = {};
  new Function('require', 'exports', 'console', output)((name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`); return imports[name];
  }, exported, { error() {} });
  return exported;
}
const legacyGet = (db, options) => loadSource(LEGACY_ACCOUNT_SOURCE, sqlSupabase(db, options)).GET;
const legacyPersist = (db, options) => loadSource(LEGACY_PERSIST_SOURCE, sqlSupabase(db, options)).persistPurchase;
const request = () => new Request('https://synthetic.invalid/api/account/purchases', { headers: { authorization: 'Bearer synthetic' } });
const row = async (db, id) => (await db.query('select * from public.purchases where lemon_order_id=$1', [id])).rows[0];
const save = async (db, input, status = 'paid', userId = owner, linkStatus = 'linked') => (await db.query(
  'select public.persist_payment_purchase($1::jsonb,$2,$3,$4::uuid,$5) as purchase',
  [JSON.stringify(input), status, slug, userId, linkStatus]
)).rows[0].purchase;
const oldSave = (db, input, status = 'paid', userId = owner, options) => legacyPersist(db, options)(sqlSupabase(db, options), input, status, slug, userId);
async function consumedClaim(db, id, userId = owner, variantId = variant) {
  await db.query(`insert into public.purchase_account_claims
    (token_hash,user_id,product_slug,lemon_variant_id,expires_at,consumed_at,consumed_order_id)
    values ($1,$2,$3,$4,now()+interval '1 day',now(),$5)`,
  [randomUUID().replaceAll('-', '').repeat(2), userId, slug, variantId, id]);
}
let baseline; let upgraded;
before(async () => { baseline = await database(); upgraded = await database({ upgraded: true }); });
after(async () => { await baseline?.close(); await upgraded?.close(); });

test('baseline old API still claims eligible email purchases and reads paid ownership', async () => {
  await oldSave(baseline, order('baseline-email'), 'paid', null);
  const response = await legacyGet(baseline)(request());
  assert.equal(response.status, 200);
  assert.ok((await response.json()).purchases.some(purchase => purchase.lemon_order_id === 'baseline-email'));
  assert.equal((await row(baseline, 'baseline-email')).user_id, billingUser);
});

test('baseline demonstrates direct old webhook refund reversal without a database compatibility guard', async () => {
  await oldSave(baseline, order('baseline-refund'), 'refunded');
  await oldSave(baseline, order('baseline-refund'), 'paid');
  assert.equal((await row(baseline, 'baseline-refund')).status, 'paid');
});

test('new app on the baseline schema fails without silently linking purchases; schema must ship first', async () => {
  await oldSave(baseline, order('new-app-old-db'), 'paid', null);
  const source = readFileSync(new URL('../../app/api/account/purchases/route.ts', import.meta.url), 'utf8');
  const response = await loadSource(source, sqlSupabase(baseline)).GET(request());
  assert.equal(response.status, 500);
  assert.equal((await row(baseline, 'new-app-old-db')).user_id, null);
  await assert.rejects(save(baseline, order('new-rpc-old-db')), error => error.code === '42883');
  assert.equal(await row(baseline, 'new-rpc-old-db'), undefined);
});

test('new database keeps old normal checkout and email-claim flows usable', async () => {
  await oldSave(upgraded, order('old-normal-unclaimed'), 'paid', null);
  await oldSave(upgraded, order('old-normal-owned'), 'paid', owner);
  const response = await legacyGet(upgraded)(request());
  assert.equal(response.status, 200);
  assert.equal((await row(upgraded, 'old-normal-unclaimed')).user_id, billingUser);
  assert.equal((await row(upgraded, 'old-normal-owned')).user_id, owner);
});

test('old account GET cannot acquire new claim_review rows and continues returning HTTP 200', async () => {
  await save(upgraded, order('old-get-review'), 'paid', null, 'claim_review');
  await oldSave(upgraded, order('old-get-eligible'), 'paid', null);
  const response = await legacyGet(upgraded)(request());
  assert.equal(response.status, 200);
  assert.equal((await row(upgraded, 'old-get-review')).user_id, null);
  assert.equal((await row(upgraded, 'old-get-review')).account_link_status, 'claim_review');
  const purchases = (await response.json()).purchases;
  assert.equal(purchases.some(purchase => purchase.lemon_order_id === 'old-get-review'), false);
  assert.ok(purchases.some(purchase => purchase.lemon_order_id === 'old-get-eligible'));
  assert.equal((await row(upgraded, 'old-get-eligible')).user_id, billingUser, 'one protected row must not abort the bulk legacy update');
});

test('old direct upsert cannot transfer an existing owner or restore refund/partial/fraudulent status', async () => {
  for (const status of ['refunded', 'partial_refund', 'fraudulent']) {
    const id = `old-upsert-${status}`;
    await save(upgraded, order(id), status);
    await oldSave(upgraded, order(id), 'paid', billingUser);
    const saved = await row(upgraded, id);
    assert.equal(saved.user_id, owner);
    assert.equal(saved.status, status);
  }
});

test('direct paid-to-pending/failed writes preserve paid monetary data', async () => {
  for (const status of ['pending', 'failed']) {
    const id = `old-unpaid-${status}`;
    await save(upgraded, order(id));
    await oldSave(upgraded, order(id, { totalCents: 0, currency: 'EUR' }), status);
    const saved = await row(upgraded, id);
    assert.equal(saved.status, 'paid'); assert.equal(saved.total_cents, 2900); assert.equal(saved.currency, 'USD');
  }
});

test('reviewed ownership requires a consumed claim matching order, user and variant even through new RPC', async () => {
  await save(upgraded, order('review-proof'), 'paid', null, 'claim_review');
  await save(upgraded, order('review-proof'), 'paid', owner, 'linked');
  assert.equal((await row(upgraded, 'review-proof')).user_id, null, 'caller-supplied linked flag is not evidence');
  await consumedClaim(upgraded, 'review-proof');
  await upgraded.query(`update public.purchase_account_claims set created_at=now()-interval '2 days',
    expires_at=now()-interval '1 day',consumed_at=now()-interval '36 hours' where consumed_order_id='review-proof'`);
  await save(upgraded, order('review-proof'), 'paid', billingUser, 'linked');
  assert.equal((await row(upgraded, 'review-proof')).user_id, null, 'a different account cannot reuse the evidence');
  await save(upgraded, order('review-proof'), 'paid', owner, 'linked');
  assert.equal((await row(upgraded, 'review-proof')).user_id, owner);
  assert.equal((await row(upgraded, 'review-proof')).account_link_status, 'linked');
  await save(upgraded, order('review-wrong-variant'), 'paid', null, 'claim_review');
  await consumedClaim(upgraded, 'review-wrong-variant', owner, 'different-variant');
  await save(upgraded, order('review-wrong-variant'), 'paid', owner, 'linked');
  assert.equal((await row(upgraded, 'review-wrong-variant')).user_id, null);
  await save(upgraded, order('review-wrong-order'), 'paid', null, 'claim_review');
  await save(upgraded, order('review-wrong-order'), 'paid', owner, 'linked');
  assert.equal((await row(upgraded, 'review-wrong-order')).user_id, null, 'another order cannot reuse the consumed evidence');
});

test('INSERT and ON CONFLICT both enforce committed inbox/consumed-claim evidence against old writes', async () => {
  for (const source of ['webhook', 'reconciliation']) {
    const id = `inbox-insert-${source}`;
    await upgraded.query(`insert into public.payment_webhook_events
      (event_key,event_name,lemon_order_id,order_data,source,claim_present)
      values ($1,'order_created',$2,$3::jsonb,$4,$5)`,
    [id, id, JSON.stringify(order(id)), source, source === 'webhook']);
    await oldSave(upgraded, order(id), 'paid', billingUser);
    assert.equal((await row(upgraded, id)).user_id, null);
    assert.equal((await row(upgraded, id)).account_link_status, 'claim_review');
    await consumedClaim(upgraded, id);
    await oldSave(upgraded, order(id), 'paid', billingUser);
    assert.equal((await row(upgraded, id)).user_id, null);
    await oldSave(upgraded, order(id), 'paid', owner);
    assert.equal((await row(upgraded, id)).user_id, owner);
  }
  await consumedClaim(upgraded, 'consumed-before-insert');
  await oldSave(upgraded, order('consumed-before-insert'), 'paid', billingUser);
  assert.equal((await row(upgraded, 'consumed-before-insert')).user_id, null);
  await oldSave(upgraded, order('consumed-before-insert'), 'paid', owner);
  assert.equal((await row(upgraded, 'consumed-before-insert')).user_id, owner);
});

test('legacy caller cannot clear claim_review by changing classification alone', async () => {
  await save(upgraded, order('review-classification'), 'paid', null, 'claim_review');
  await upgraded.query("update public.purchases set account_link_status='email_allowed' where lemon_order_id='review-classification'");
  await legacyGet(upgraded)(request());
  const saved = await row(upgraded, 'review-classification');
  assert.equal(saved.user_id, null); assert.equal(saved.account_link_status, 'claim_review');
});

test('legacy direct changes cannot replace immutable order, variant, product, id or Live identity', async () => {
  for (const [column, value] of [['lemon_order_id', 'different-order'], ['lemon_variant_id', 'different-variant'], ['test_mode', true], ['product_slug', 'different-product'], ['id', randomUUID()]]) {
    const id = `immutable-${column}`; await save(upgraded, order(id));
    await assert.rejects(upgraded.query(`update public.purchases set ${column}=$1 where lemon_order_id=$2`, [value, id]), error => error.code === '22023');
    const saved = await row(upgraded, id); assert.equal(saved.user_id, owner); assert.equal(saved.lemon_order_id, id);
  }
});

function writeBarrier(operation) {
  let release; let notify;
  const ready = new Promise(resolve => { notify = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  return { ready, release: () => release(), beforeWrite: async (input) => { if (input.operation === operation) { notify(); await gate; } } };
}

test('an old request already in flight cannot claim a review row created before its SQL write resumes', async () => {
  const barrier = writeBarrier('update');
  const inFlight = legacyGet(upgraded, { beforeWrite: barrier.beforeWrite })(request());
  await barrier.ready;
  await save(upgraded, order('inflight-review'), 'paid', null, 'claim_review');
  barrier.release(); assert.equal((await inFlight).status, 200);
  assert.equal((await row(upgraded, 'inflight-review')).user_id, null);
});

test('an old paid payload already in flight cannot undo a newer refund; either SQL schedule retains one order', async () => {
  await save(upgraded, order('inflight-refund'));
  const barrier = writeBarrier('upsert');
  const inFlight = oldSave(upgraded, order('inflight-refund'), 'paid', owner, { beforeWrite: barrier.beforeWrite });
  await barrier.ready; await save(upgraded, order('inflight-refund'), 'refunded'); barrier.release(); await inFlight;
  assert.equal((await row(upgraded, 'inflight-refund')).status, 'refunded');
  await oldSave(upgraded, order('reverse-schedule'), 'paid'); await save(upgraded, order('reverse-schedule'), 'refunded');
  assert.equal((await row(upgraded, 'reverse-schedule')).status, 'refunded');
  assert.equal((await upgraded.query("select count(*)::int as n from public.purchases where lemon_order_id='inflight-refund'")).rows[0].n, 1);
  // PGlite has one backend. These controlled schedules test request interleaving,
  // not multi-process lock waits/deadlocks or live PostgREST transaction behavior.
});

test('new account API still works on the hardened database and cannot attach review rows', async () => {
  const source = readFileSync(new URL('../../app/api/account/purchases/route.ts', import.meta.url), 'utf8');
  await save(upgraded, order('new-get-review'), 'paid', null, 'claim_review');
  const response = await loadSource(source, sqlSupabase(upgraded)).GET(request());
  assert.equal(response.status, 200); assert.equal((await row(upgraded, 'new-get-review')).user_id, null);
});

test('service role has explicit migration-established privileges and browser RLS prevents direct access', async () => {
  for (const table of ['purchases', 'purchase_account_claims', 'payment_webhook_events']) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) {
      const result = await upgraded.query('select has_table_privilege($1,$2,$3) as allowed', ['service_role', `public.${table}`, privilege]);
      assert.equal(result.rows[0].allowed, true, `${table} ${privilege}`);
    }
    assert.equal((await upgraded.query('select has_table_privilege($1,$2,$3) as allowed', ['service_role', `public.${table}`, 'DELETE'])).rows[0].allowed, false);
  }
  for (const role of ['anon', 'authenticated']) {
    await upgraded.exec(`reset role; set role ${role}`);
    try {
      for (const table of ['purchases', 'purchase_account_claims']) {
        try { assert.deepEqual((await upgraded.query(`select * from public.${table}`)).rows, []); }
        catch (error) { assert.equal(error.code, '42501'); }
      }
      await assert.rejects(upgraded.query('select * from public.payment_webhook_events'), error => error.code === '42501');
      await assert.rejects(save(upgraded, order('unauthorized-role')), error => error.code === '42501');
    } finally { await upgraded.exec('reset role; set role service_role'); }
  }
  assert.equal((await upgraded.query("select has_function_privilege('service_role','public.guard_purchase_write()','EXECUTE') as allowed")).rows[0].allowed, false);
});

test('restrictive RLS still denies browser reads/writes if historical permissive policies and grants survive', async () => {
  await upgraded.exec('reset role; begin');
  try {
    for (const table of ['purchases', 'purchase_account_claims', 'payment_webhook_events']) {
      await upgraded.exec(`grant select,insert,update on public.${table} to anon,authenticated;
        create policy compatibility_permissive on public.${table} for all to anon,authenticated using(true) with check(true);`);
    }
    for (const role of ['anon', 'authenticated']) {
      await upgraded.exec(`set role ${role}`);
      for (const table of ['purchases', 'purchase_account_claims', 'payment_webhook_events']) {
        assert.deepEqual((await upgraded.query(`select * from public.${table}`)).rows, []);
      }
      assert.deepEqual((await upgraded.query("update public.purchases set user_id=$1 where buyer_email=$2 returning id", [billingUser, buyerEmail])).rows, []);
      // Recover the transaction after PostgreSQL rejects the forbidden INSERT.
      await upgraded.exec('savepoint denied_write');
      await assert.rejects(upgraded.query(`insert into public.purchases
        (lemon_order_id,lemon_variant_id,product_name,buyer_email,status,test_mode)
        values ('rls-forbidden','2147845','Synthetic','synthetic@example.invalid','paid',false)`), error => error.code === '42501');
      await upgraded.exec('rollback to savepoint denied_write; reset role');
    }
  } finally { await upgraded.exec('reset role; rollback; set role service_role'); }
});

test('account deletion still performs FK SET NULL and leaves purchases safely unclaimable', async () => {
  const deletedUser = '10000000-0000-4000-8000-000000000003';
  await upgraded.exec('reset role');
  try { await upgraded.query('insert into auth.users values($1)', [deletedUser]); }
  finally { await upgraded.exec('set role service_role'); }
  await save(upgraded, order('deleted-owner'), 'paid', deletedUser, 'linked');
  await upgraded.exec('reset role');
  try { await upgraded.query('delete from auth.users where id=$1', [deletedUser]); }
  finally { await upgraded.exec('set role service_role'); }
  const saved = await row(upgraded, 'deleted-owner');
  assert.equal(saved.user_id, null); assert.equal(saved.account_link_status, 'claim_review');
  await legacyGet(upgraded)(request()); assert.equal((await row(upgraded, 'deleted-owner')).user_id, null);
});

test('migration failures roll back atomically; 001 rejects duplicate apply and 002/003 safely reapply', async () => {
  const db = await database({ asService: false });
  const injectFailureBeforeCommit = (sql) => {
    assert.match(sql, /\bbegin;/i); assert.match(sql, /\bcommit;\s*$/i);
    return sql.replace(/\bcommit;\s*$/i, 'select compatibility_intentional_failure();\ncommit;');
  };
  const failMigration = async (name) => {
    await assert.rejects(db.exec(injectFailureBeforeCommit(migrationSql(name))), error => error.code === '42883');
    await db.exec('rollback');
  };
  const columnExists = async (table, column) => (await db.query(`select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name=$1 and column_name=$2) as found`, [table, column])).rows[0].found;
  const guardExists = async () => (await db.query("select exists(select 1 from pg_trigger where tgname='purchases_guard_write') as found")).rows[0].found;
  try {
    await oldSave(db, order('migration-preserved'), 'refunded');
    const original = await row(db, 'migration-preserved');
    await failMigration(firstUpgrade);
    assert.equal(await columnExists('purchases', 'account_link_status'), false);
    assert.equal(await guardExists(), false);
    assert.equal((await db.query("select to_regclass('public.payment_webhook_events') as table_name")).rows[0].table_name, null);
    // Model a DB that already applied the original 2260fa1 migration, which did
    // not contain the compatibility barrier. 003 must upgrade it independently.
    assert.match(migrationSql(firstUpgrade), sharedGuard);
    await db.exec(migrationSql(firstUpgrade).replace(sharedGuard, ''));
    assert.equal(await guardExists(), false);
    await assert.rejects(db.exec(migrationSql(firstUpgrade)), error => error.code === '42710');
    await db.exec('rollback');
    assert.equal((await row(db, 'migration-preserved')).status, 'refunded');

    await failMigration(secondUpgrade);
    assert.equal(await columnExists('purchase_account_claims', 'analytics_recovery_enabled'), false);
    assert.equal((await db.query("select to_regprocedure('public.lease_purchase_analytics(uuid,uuid,uuid)') as fn")).rows[0].fn, null);
    await db.exec(migrationSql(secondUpgrade)); await db.exec(migrationSql(secondUpgrade));

    await failMigration(compatibilityUpgrade);
    assert.equal(await guardExists(), false);
    assert.equal((await db.query("select to_regprocedure('public.guard_purchase_write()') as fn")).rows[0].fn, null);
    assert.equal((await db.query("select has_table_privilege('anon','public.purchases','SELECT') as allowed")).rows[0].allowed, true, 'failed revoke must roll back');
    await db.exec(migrationSql(compatibilityUpgrade));
    await failMigration(compatibilityUpgrade);
    assert.equal(await guardExists(), true, 'failure during a rerun must retain the installed guard');
    await db.exec(migrationSql(compatibilityUpgrade));
    const preserved = await row(db, 'migration-preserved');
    for (const column of ['id', 'user_id', 'status', 'total_cents', 'lemon_order_id', 'lemon_variant_id']) assert.equal(preserved[column], original[column]);
    await db.exec('set role service_role');
    await oldSave(db, order('migration-preserved'), 'paid', billingUser);
    assert.equal((await row(db, 'migration-preserved')).status, 'refunded');
    assert.equal((await row(db, 'migration-preserved')).user_id, owner);
  } finally { await db.close(); }
});

test('fresh 001 commits its write barrier immediately and shares the exact idempotent 003 guard', async () => {
  const firstGuard = migrationSql(firstUpgrade).match(sharedGuard)?.[0];
  const thirdGuard = migrationSql(compatibilityUpgrade).match(sharedGuard)?.[0];
  assert.ok(firstGuard); assert.equal(firstGuard, thirdGuard, 'fresh install and existing-DB upgrade must install identical guards');
  const db = await database({ asService: false });
  try {
    await db.exec(migrationSql(firstUpgrade));
    assert.equal((await db.query("select to_regprocedure('public.lease_purchase_analytics(uuid,uuid,uuid)') as fn")).rows[0].fn, null, '002 and 003 have not been applied');
    await db.exec('set role service_role');
    await save(db, order('only-001-review'), 'paid', null, 'claim_review');
    await oldSave(db, order('only-001-eligible'), 'paid', null);
    assert.equal((await legacyGet(db)(request())).status, 200);
    assert.equal((await row(db, 'only-001-review')).user_id, null);
    assert.equal((await row(db, 'only-001-eligible')).user_id, billingUser);
    await save(db, order('only-001-refund'), 'refunded');
    await oldSave(db, order('only-001-refund'), 'paid', billingUser);
    assert.equal((await row(db, 'only-001-refund')).status, 'refunded');
    assert.equal((await row(db, 'only-001-refund')).user_id, owner);
  } finally { await db.close(); }
});

test('read-only schema gate passes full migrations and rejects a disabled guard without changing customer data', async () => {
  const gate = readFileSync(new URL('../../scripts/payment-schema-check.sql', import.meta.url), 'utf8');
  const countBefore = (await upgraded.query('select count(*)::int as n from public.purchases')).rows[0].n;
  await upgraded.exec('reset role');
  try {
    await upgraded.exec(gate);
    await upgraded.exec('alter table public.purchases disable trigger purchases_guard_write');
    await assert.rejects(upgraded.exec(gate), /Missing or unsafe purchase write guard/);
    await upgraded.exec('rollback; alter table public.purchases enable trigger purchases_guard_write');
    await upgraded.exec(gate);
    // A deliberate local write injected into the script must be prohibited by
    // the transaction itself, regardless of the administrative caller's grants.
    const attemptedWrite = gate.replace(/begin read only;/i, 'begin read only; delete from public.purchases;');
    await assert.rejects(upgraded.exec(attemptedWrite), error => error.code === '25006');
    await upgraded.exec('rollback');
    assert.equal((await upgraded.query('select count(*)::int as n from public.purchases')).rows[0].n, countBefore);
  } finally {
    await upgraded.exec('rollback; reset role; alter table public.purchases enable trigger purchases_guard_write; set role service_role');
  }
});

// Legacy source fixtures follow. They are intentionally fixed to d02ebca so a
// future edit to the current app cannot silently weaken the rollback regression.

const LEGACY_ACCOUNT_SOURCE = String.raw`import { NextResponse } from 'next/server';
import {
  ENTITLED_PURCHASE_STATUSES,
  type AccountPurchase
} from '@/lib/payments/purchases';
import {
  getOfficialProductForLivePurchase,
  OFFICIAL_LIVE_VARIANT_IDS
} from '@/lib/products/catalog';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
}

export async function GET(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return jsonError(401, 'Authentication required.');
  }

  let supabase: ReturnType<typeof createServerSupabaseClient>;
  try {
    supabase = createServerSupabaseClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase server client is not configured.';
    console.error('[Account Purchases] Supabase configuration error:', message);
    return jsonError(500, 'Purchase history is not configured.');
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user?.email) {
    return jsonError(401, 'Invalid or expired session.');
  }

  const verifiedEmail = user.email.trim().toLowerCase();
  const now = new Date().toISOString();

  // Only an entitled Live purchase for the official catalog can be claimed.
  // Historical Test Mode and unmapped product rows remain for audit purposes.
  const { error: claimError } = await supabase
    .from('purchases')
    .update({ user_id: user.id, updated_at: now })
    .is('user_id', null)
    .eq('buyer_email', verifiedEmail)
    .in('status', [...ENTITLED_PURCHASE_STATUSES])
    .eq('test_mode', false)
    .in('lemon_variant_id', [...OFFICIAL_LIVE_VARIANT_IDS]);

  if (claimError) {
    console.error('[Account Purchases] Failed to link purchases.', {
      userId: user.id,
      code: claimError.code,
      message: claimError.message
    });
    return jsonError(500, 'Failed to link purchase history.');
  }

  const { data, error } = await supabase
    .from('purchases')
    .select(
      'id, product_name, lemon_order_id, lemon_variant_id, total_cents, currency, purchased_at, status, test_mode'
    )
    .eq('user_id', user.id)
    .in('status', [...ENTITLED_PURCHASE_STATUSES])
    .eq('test_mode', false)
    .in('lemon_variant_id', [...OFFICIAL_LIVE_VARIANT_IDS])
    .order('purchased_at', { ascending: false });

  if (error) {
    console.error('[Account Purchases] Failed to load purchases.', {
      userId: user.id,
      code: error.code,
      message: error.message
    });
    return jsonError(500, 'Failed to load purchase history.');
  }

  const purchases: AccountPurchase[] = (data ?? []).flatMap((purchase) => {
    const product = getOfficialProductForLivePurchase(purchase);
    if (!product) {
      return [];
    }

    return [{
      id: purchase.id,
      product_slug: product.slug,
      product_name: product.name,
      lemon_order_id: purchase.lemon_order_id,
      total_cents: purchase.total_cents,
      currency: purchase.currency,
      test_mode: purchase.test_mode,
      purchased_at: purchase.purchased_at,
      status: purchase.status
    }];
  });

  return NextResponse.json(
    { ok: true, purchases },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
`;

const LEGACY_PERSIST_SOURCE = String.raw`class PurchasePersistenceError extends Error {
  constructor() {
    super('Failed to save purchase.');
    this.name = 'PurchasePersistenceError';
  }
}

async function persistPurchase(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  order: ReturnType<typeof normalizeLemonOrder>,
  status: string,
  productSlug: NonNullable<ReturnType<typeof getProductSlugByVariantId>>,
  userId?: string
) {
  const now = new Date().toISOString();
  const purchaseValues = {
    lemon_order_id: order.lemonOrderId,
    lemon_variant_id: order.lemonVariantId,
    product_name: order.productName,
    buyer_email: order.buyerEmail,
    status,
    currency: order.currency,
    total_cents: order.totalCents,
    test_mode: order.testMode,
    purchased_at: order.purchasedAt,
    updated_at: now,
    product_slug: productSlug,
    ...(userId ? { user_id: userId } : {})
  };

  const { data, error } = await supabase
    .from('purchases')
    .upsert(purchaseValues, { onConflict: 'lemon_order_id' })
    .select('id, lemon_order_id, product_slug, status, test_mode, purchased_at')
    .maybeSingle();

  if (error) {
    console.error('[Lemon Webhook] Failed to persist purchase.', {
      lemonOrderId: order.lemonOrderId,
      code: error.code
    });
    throw new PurchasePersistenceError();
  }

  return data;
}


export { persistPurchase };
`;
