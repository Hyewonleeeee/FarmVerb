import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// Real PostgreSQL SQL execution in memory. This suite never uses a DB URL,
// application environment variables, HTTP, or production data.
const db = new PGlite({ extensions: { pgcrypto } });
const owner = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
let historical;
const order = (id, overrides = {}) => ({
  lemonOrderId: id, lemonVariantId: '2147845', storeId: 'synthetic-store',
  productName: 'Boseong Green Tea', buyerEmail: 'synthetic@example.test',
  status: 'paid', currency: 'USD', totalCents: 2900, testMode: false,
  purchasedAt: '2026-10-13T01:00:00Z', updatedAt: '2026-10-13T01:00:00Z',
  ...overrides
});

async function save(input, status = input.status, userId = owner, linkStatus = 'linked') {
  const result = await db.query(
    'select public.persist_payment_purchase($1::jsonb, $2, $3, $4::uuid, $5) as purchase',
    [JSON.stringify(input), status, 'boseong-green-tea', userId, linkStatus]
  );
  return result.rows[0].purchase;
}

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${owner}'), ('${other}');
  `);
  const directory = new URL('./', import.meta.url);
  const files = readdirSync(directory).filter(file => file.endsWith('.sql')).sort();
  for (const file of files) {
    if (file.startsWith('20261013') && !historical) {
      await db.query(`insert into public.purchases
        (lemon_order_id, lemon_variant_id, product_slug, product_name, buyer_email, user_id,
         status, currency, total_cents, test_mode, purchased_at)
        values ('historical', '2147845', 'boseong-green-tea', 'Boseong Green Tea',
        'synthetic@example.test', $1, 'paid', 'USD', 2900, false, now())`, [owner]);
      historical = (await db.query(`select id, user_id, status, lemon_order_id, lemon_variant_id,
        total_cents, product_slug from public.purchases where lemon_order_id = 'historical'`)).rows[0];
    }
    await db.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
  // Use only the privileges installed by the migrations. Injected grants here
  // would hide missing service-role ACLs in a fresh or differently configured DB.
});

after(async () => { await db.close(); });

test('migration preserves existing customer owner, price, entitlement and order identifiers', async () => {
  const row = (await db.query(`select id, user_id, status, lemon_order_id, lemon_variant_id,
    total_cents, product_slug from public.purchases where lemon_order_id = 'historical'`)).rows[0];
  assert.deepEqual(row, historical);
});

test('duplicate SQL writes retain one order and never transfer an established owner', async () => {
  const first = await save(order('duplicate'));
  const duplicate = await save(order('duplicate'));
  const attemptedTransfer = await save(order('duplicate'), 'paid', other);
  assert.equal(first.id, duplicate.id);
  assert.equal(attemptedTransfer.user_id, owner);
  assert.equal((await db.query("select count(*)::int as count from public.purchases where lemon_order_id='duplicate'")).rows[0].count, 1);
});

test('late created, partial refund and full refund cannot restore refunded access', async () => {
  await save(order('refund-first'), 'refunded');
  assert.equal((await save(order('refund-first', { updatedAt: '2026-10-14T01:00:00Z' }), 'paid')).status, 'refunded');
  assert.equal((await save(order('refund-first'), 'partial_refund')).status, 'refunded');
  await save(order('partial-first'), 'partial_refund');
  assert.equal((await save(order('partial-first'), 'paid')).status, 'partial_refund');
  assert.equal((await save(order('partial-first'), 'refunded')).status, 'refunded');
  await save(order('fraudulent-first'), 'fraudulent');
  assert.equal((await save(order('fraudulent-first'), 'paid')).status, 'fraudulent');
});

test('older failed/pending snapshots cannot overwrite newer paid state', async () => {
  await save(order('newer-paid', { updatedAt: '2026-10-13T02:00:00Z' }));
  assert.equal((await save(order('newer-paid'), 'failed')).status, 'paid');
  assert.equal((await save(order('newer-paid'), 'pending')).status, 'paid');
  await save(order('newer-paid', { updatedAt: '2026-10-13T03:00:00Z', totalCents: 0 }), 'failed');
  assert.equal((await db.query("select total_cents from public.purchases where lemon_order_id='newer-paid'")).rows[0].total_cents, 2900);
});

test('newer verified payment fills pending totals but conflicting variant cannot change ownership or amount', async () => {
  await save(order('pending-payment', { totalCents: 0 }), 'pending', null, 'email_allowed');
  await save(order('pending-payment', { updatedAt: '2026-10-13T03:00:00Z' }));
  assert.equal((await db.query("select total_cents from public.purchases where lemon_order_id='pending-payment'")).rows[0].total_cents, 2900);
  await assert.rejects(save(order('pending-payment', { lemonVariantId: 'different', totalCents: 1 }), 'paid', other), /variant conflict/);
  const row = (await db.query("select total_cents, user_id, lemon_variant_id from public.purchases where lemon_order_id='pending-payment'")).rows[0];
  assert.deepEqual(row, { total_cents: 2900, user_id: owner, lemon_variant_id: '2147845' });
});

test('claim review cannot silently become email eligible; verified claim may fill empty owner', async () => {
  const first = await save(order('claim-review'), 'paid', null, 'claim_review');
  assert.equal(first.user_id, null);
  assert.equal((await save(order('claim-review'), 'paid', null, 'email_allowed')).account_link_status, 'claim_review');
  await db.query(`insert into public.purchase_account_claims
    (token_hash,user_id,product_slug,lemon_variant_id,expires_at,consumed_at,consumed_order_id)
    values (encode(gen_random_bytes(32),'hex'),$1,'boseong-green-tea','2147845',
      now()+interval '1 day',now(),'claim-review')`, [owner]);
  const linked = await save(order('claim-review'), 'paid', owner, 'linked');
  assert.equal(linked.user_id, owner);
  assert.equal(linked.account_link_status, 'linked');
});

test('SQL rejects Test Mode and unsupported entitlement state', async () => {
  await assert.rejects(save(order('test-order', { testMode: true })), /Invalid verified purchase input/);
  await assert.rejects(save(order('unsupported'), 'surprise'), /Invalid verified purchase input/);
  assert.equal((await db.query("select count(*)::int as count from public.purchases where lemon_order_id in ('test-order','unsupported')")).rows[0].count, 0);
});

test('inbox lease prevents concurrent duplicate work and permits expired-lease recovery', async () => {
  const { rows: [event] } = await db.query(`insert into public.payment_webhook_events
    (event_key, event_name, lemon_order_id, order_data, source)
    values ('synthetic-event', 'order_created', 'lease-order', $1::jsonb, 'webhook') returning id`,
  [JSON.stringify(order('lease-order'))]);
  const lease = async (allow = false) => (await db.query(
    'select public.claim_payment_webhook_event($1, $2) as event', [event.id, allow]
  )).rows[0].event;
  const first = await lease();
  assert.equal(first.attempts, 1);
  assert.equal(await lease(), null);
  await db.query("update public.payment_webhook_events set lease_until=now()-interval '1 second' where id=$1", [event.id]);
  const retry = await lease();
  assert.equal(retry.attempts, 2);
  assert.notEqual(retry.lease_token, first.lease_token);
  await db.query("update public.payment_webhook_events set state='quarantined' where id=$1", [event.id]);
  assert.equal(await lease(), null);
  assert.equal((await lease(true)).state, 'processing');
  await db.query("update public.payment_webhook_events set state='processed' where id=$1", [event.id]);
  assert.equal(await lease(true), null);
});

test('browser roles cannot inspect private inbox or execute payment mutation RPCs', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query('select * from public.payment_webhook_events'), /permission denied/);
      await assert.rejects(db.query("select public.claim_payment_webhook_event('10000000-0000-4000-8000-000000000009', false)"), /permission denied/);
      await assert.rejects(save(order('unauthorized')), /permission denied/);
      await assert.rejects(db.query('select public.lease_purchase_analytics($1, $2, $3)', [owner, owner, other]), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try { assert.equal((await save(order('service-role'))).status, 'paid'); }
  finally { await db.exec('reset role'); }
});

async function analyticsClaim(overrides = {}) {
  const input = {
    enabled: true, consumed: true, createdAt: new Date().toISOString(),
    ga4: null, ads: null, ...overrides
  };
  const { rows: [claim] } = await db.query(`insert into public.purchase_account_claims
    (token_hash, user_id, product_slug, lemon_variant_id, expires_at, consumed_at,
     consumed_order_id, analytics_recovery_enabled, created_at, ga4_processed_at, google_ads_processed_at)
    values (encode(gen_random_bytes(32), 'hex'), $1, 'boseong-green-tea', '2147845',
      now()+interval '1 day', $2, $3, $4, $5, $6, $7) returning id`,
  [owner, input.consumed ? new Date().toISOString() : null,
    input.consumed ? crypto.randomUUID() : null, input.enabled, input.createdAt, input.ga4, input.ads]);
  return claim.id;
}

const analyticsLease = async (claimId, userId = owner, token = crypto.randomUUID()) => (
  await db.query('select public.lease_purchase_analytics($1,$2,$3) as leased', [claimId, userId, token])
).rows[0].leased;

test('analytics delivery lease blocks second tab and wrong owner, recovers after expiry', async () => {
  const id = await analyticsClaim();
  assert.equal(await analyticsLease(id, other), false);
  assert.equal(await analyticsLease(id), true);
  assert.equal(await analyticsLease(id), false);
  await db.query("update public.purchase_account_claims set analytics_lease_expires_at=now()-interval '1 second' where id=$1", [id]);
  assert.equal(await analyticsLease(id), true);
});

test('analytics recovery excludes historical, unconsumed, old and fully acknowledged claims', async () => {
  for (const options of [
    { enabled: false }, { consumed: false }, { createdAt: '2020-01-01T00:00:00Z' },
    { ga4: new Date().toISOString(), ads: new Date().toISOString() }
  ]) {
    assert.equal(await analyticsLease(await analyticsClaim(options)), false);
  }
  const id = await analyticsClaim({ ga4: new Date().toISOString() });
  assert.equal(await analyticsLease(id), true, 'unfinished Ads channel remains recoverable');
});
