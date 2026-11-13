#!/usr/bin/env node
// Actual local Supabase Auth/PostgREST checks. No dotenv, SQL, migrations,
// production credentials, Lemon requests, Google requests, or new dependencies.
// The private manifest contains local fixture passwords/hashes. Never publish it.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const stages = ['baseline', '001', '002', '003'];
const variant = '2147845';
const slug = 'boseong-green-tea';
const purchaseColumns = 'id,lemon_order_id,lemon_variant_id,product_slug,product_name,buyer_email,user_id,status,currency,total_cents,test_mode,purchased_at,created_at,updated_at';
const report = { transport: 'actual-local-supabase-api', scope: 'legacy query shape via actual SDK; not whole Next.js route integration', stage: null, passed: 0, failed: 0, checks: [] };

class CheckError extends Error {
  constructor(code, apiCode, status) {
    super(code);
    this.checkCode = code;
    this.apiCode = typeof apiCode === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(apiCode) ? apiCode : undefined;
    this.httpStatus = Number.isInteger(status) ? status : undefined;
  }
}

function requireCondition(value, code) {
  if (!value) throw new CheckError(code);
}

function unwrap(result, code) {
  if (result.error) throw new CheckError(code, result.error.code, result.status);
  return result.data;
}

async function check(name, action) {
  if (report.failed) {
    report.checks.push({ name, skipped: true, reason: 'EARLIER_FAILURE' });
    return;
  }
  try {
    await action();
    report.passed += 1;
    report.checks.push({ name, ok: true });
  } catch (error) {
    report.failed += 1;
    report.checks.push({ name, ok: false, code: error.checkCode ?? (error instanceof assert.AssertionError ? 'ASSERTION_FAILED' : 'UNEXPECTED_ERROR'),
      ...(error.apiCode ? { apiCode: error.apiCode } : {}), ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}) });
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  requireCondition(args.length === 6, 'ARGUMENTS_REQUIRED');
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    requireCondition(['--stage', '--config', '--manifest'].includes(key) && !options[key] && args[index + 1], 'INVALID_ARGUMENTS');
    options[key] = args[index + 1];
  }
  requireCondition(stages.includes(options['--stage']), 'INVALID_STAGE');
  requireCondition(resolve(options['--config']) !== resolve(options['--manifest']), 'CONFIG_MANIFEST_MUST_DIFFER');
  return { stage: options['--stage'], configPath: resolve(options['--config']), manifestPath: resolve(options['--manifest']) };
}

async function privateJson(path) {
  const stat = await lstat(path);
  requireCondition(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, 'PRIVATE_FILE_REQUIRED');
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const { stage, configPath, manifestPath } = parseArgs();
  report.stage = stage;
  const config = await privateJson(configPath);
  const endpoint = new URL(config.API_URL);
  requireCondition(endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1'
    && endpoint.port && Number(endpoint.port) >= 1024 && Number(endpoint.port) <= 65535
    && endpoint.pathname === '/' && !endpoint.search && !endpoint.hash && !endpoint.username && !endpoint.password, 'LOOPBACK_URL_REQUIRED');
  requireCondition(typeof config.ANON_KEY === 'string' && config.ANON_KEY.trim()
    && typeof config.SERVICE_ROLE_KEY === 'string' && config.SERVICE_ROLE_KEY.trim(), 'LOCAL_KEYS_REQUIRED');
  const origin = endpoint.origin;
  const localFetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    requireCondition(url.origin === origin && !url.username && !url.password
      && /^\/(?:rest|auth)\/v1(?:\/|$)/.test(url.pathname), 'OUTBOUND_REQUEST_BLOCKED');
    const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
    return fetch(input, { ...init, redirect: 'error', signal });
  };
  const client = (key) => createClient(origin, key, {
    global: { fetch: localFetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const service = client(config.SERVICE_ROLE_KEY.trim());
  const anonymous = client(config.ANON_KEY.trim());
  const authenticated = client(config.ANON_KEY.trim());
  let manifest;
  try { manifest = await privateJson(manifestPath); }
  catch (error) {
    if (error.code !== 'ENOENT' || stage !== 'baseline') throw error;
    manifest = { version: 1, origin, runId: randomUUID(), users: {}, completed: {}, fixtures: [] };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  }
  requireCondition(manifest.version === 1 && manifest.origin === origin && /^[0-9a-f-]{36}$/.test(manifest.runId), 'MANIFEST_TARGET_MISMATCH');
  if (stage !== 'baseline') requireCondition(manifest.completed[stages[stages.indexOf(stage) - 1]], 'PREVIOUS_STAGE_NOT_PASSED');
  if (stage === 'baseline') requireCondition(!manifest.completed.baseline, 'BASELINE_ALREADY_COMPLETED');
  let persistence = Promise.resolve();
  const persist = () => {
    const snapshot = JSON.stringify(manifest, null, 2);
    persistence = persistence.then(() => writeFile(manifestPath, snapshot, { mode: 0o600 }));
    return persistence;
  };
  const record = async (table, id) => { manifest.fixtures.push({ table, id }); await persist(); };
  const attempt = randomUUID();
  const orderId = (name) => `audit-local-${manifest.runId}-${stage}-${attempt}-${name}`;
  const now = () => new Date().toISOString();
  const future = () => new Date(Date.now() + 86_400_000).toISOString();

  if (stage === 'baseline') {
    for (const label of ['a', 'b']) {
      if (manifest.users[label]?.id) continue;
      const email = `audit-${label}-${manifest.runId}@example.invalid`;
      const password = `${randomBytes(24).toString('base64url')}aA1!`;
      const data = unwrap(await service.auth.admin.createUser({ email, password, email_confirm: true }), 'AUTH_FIXTURE_CREATE_FAILED');
      requireCondition(data?.user?.id, 'AUTH_FIXTURE_ID_MISSING');
      manifest.users[label] = { id: data.user.id, email, password };
      await persist();
    }
  }
  const A = manifest.users.a;
  const B = manifest.users.b;
  requireCondition(A?.id && B?.id && A.password, 'AUTH_FIXTURES_MISSING');
  const session = unwrap(await authenticated.auth.signInWithPassword({ email: A.email, password: A.password }), 'AUTH_SIGNIN_FAILED');
  requireCondition(session?.session?.access_token && session.user.id === A.id, 'AUTH_SESSION_INVALID');
  const verifiedUser = unwrap(await authenticated.auth.getUser(), 'AUTH_JWT_VERIFICATION_FAILED');
  requireCondition(verifiedUser.user.id === A.id && verifiedUser.user.role === 'authenticated', 'AUTH_ROLE_INVALID');

  const order = (id, extra = {}) => ({ lemonOrderId: id, lemonVariantId: variant, productName: 'Boseong Green Tea',
    buyerEmail: B.email, status: 'paid', currency: 'USD', totalCents: 2900, testMode: false,
    storeId: 'synthetic-local-only', purchasedAt: now(), updatedAt: now(), ...extra });
  // Exact d02ebca payload: no explicit primary key, classification, or provider
  // update timestamp. Real PostgREST's omitted/default column handling is tested.
  const legacyValues = (input, status, userId) => ({
    lemon_order_id: input.lemonOrderId, lemon_variant_id: input.lemonVariantId,
    product_name: input.productName, buyer_email: input.buyerEmail, status,
    currency: input.currency, total_cents: input.totalCents, test_mode: input.testMode,
    purchased_at: input.purchasedAt, updated_at: now(), product_slug: slug,
    ...(userId ? { user_id: userId } : {})
  });
  const oldSave = async (input, status = input.status, userId) => {
    const saved = unwrap(await service.from('purchases').upsert(legacyValues(input, status, userId), { onConflict: 'lemon_order_id' })
      .select('id,lemon_order_id,product_slug,status,test_mode,purchased_at').maybeSingle(), 'LEGACY_UPSERT_FAILED');
    requireCondition(saved?.id, 'LEGACY_RETURN_ROW_MISSING');
    await record('purchases', saved.id);
    return saved;
  };
  const read = async (id) => unwrap(await service.from('purchases').select(purchaseColumns + (stage === 'baseline' ? '' : ',account_link_status'))
    .eq('lemon_order_id', id).single(), 'PURCHASE_REQUERY_FAILED');
  const saveArgs = (input, status = input.status, owner = A.id, classification = 'linked') => ({
    p_order: input, p_status: status, p_product_slug: slug, p_user_id: owner, p_link_status: classification
  });
  const save = async (...args) => {
    const saved = unwrap(await service.rpc('persist_payment_purchase', saveArgs(...args)), 'PURCHASE_RPC_FAILED');
    requireCondition(saved?.id, 'PURCHASE_RPC_ROW_MISSING');
    await record('purchases', saved.id);
    return saved;
  };
  const makeClaim = async (id, extra = {}) => {
    const values = { token_hash: randomBytes(32).toString('hex'), user_id: A.id, product_slug: slug,
      lemon_variant_id: variant, expires_at: future(), created_at: now(), consumed_at: now(), consumed_order_id: id, ...extra };
    const saved = unwrap(await service.from('purchase_account_claims').insert(values).select('id').single(), 'CLAIM_FIXTURE_FAILED');
    await record('purchase_account_claims', saved.id);
    return { ...values, id: saved.id };
  };
  const makeEvent = async (id, extra = {}) => {
    const values = { event_key: orderId(`event-${randomUUID()}`), event_name: 'order_created', lemon_order_id: id,
      order_data: order(id), source: 'webhook', ...extra };
    const saved = unwrap(await service.from('payment_webhook_events').insert(values).select('id').single(), 'EVENT_FIXTURE_FAILED');
    await record('payment_webhook_events', saved.id);
    return { ...values, id: saved.id };
  };
  const bulkEmailLink = () => service.from('purchases').update({ user_id: B.id, updated_at: now() })
    .is('user_id', null).eq('buyer_email', B.email).in('status', ['paid', 'partial_refund'])
    .eq('test_mode', false).in('lemon_variant_id', [variant]);

  // Bounded schema-cache probes. PGRST202/204 are readiness failures, never
  // counted as proof that anon/authenticated roles are denied access.
  let ready = false;
  for (let attemptIndex = 0; attemptIndex < 12; attemptIndex += 1) {
    const probes = [await service.from('purchases').select(stage === 'baseline' ? 'id' : 'id,account_link_status').limit(0)];
    if (stage !== 'baseline') {
      probes.push(await service.rpc('claim_payment_webhook_event', { p_event_id: randomUUID(), p_allow_quarantined: false }));
      const invalidSave = await service.rpc('persist_payment_purchase', saveArgs({}, null, null, null));
      probes.push(invalidSave.error?.code === '22023' ? { error: null } : { error: { code: 'RPC_VALIDATION_PROBE_FAILED' } });
    }
    if (stage === '002' || stage === '003') probes.push(await service.rpc('lease_purchase_analytics', {
      p_claim_id: randomUUID(), p_user_id: A.id, p_lease_token: randomUUID()
    }));
    if (probes.every(result => !result.error)) { ready = true; break; }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  requireCondition(ready, 'POSTGREST_SCHEMA_NOT_READY');
  await check('actual_auth_jwt_and_postgrest_ready', async () => {});
  if (stage === '001') {
    await check('stage_001_precedes_analytics_migration', async () => {
      const column = await service.from('purchase_account_claims').select('analytics_recovery_enabled').limit(0);
      requireCondition(['42703', 'PGRST204'].includes(column.error?.code), 'ANALYTICS_COLUMN_UNEXPECTEDLY_PRESENT');
      const rpc = await service.rpc('lease_purchase_analytics', {
        p_claim_id: randomUUID(), p_user_id: A.id, p_lease_token: randomUUID()
      });
      requireCondition(rpc.error?.code === 'PGRST202', 'ANALYTICS_RPC_UNEXPECTEDLY_PRESENT');
    });
  }

  if (stage === 'baseline') {
    await check('baseline_actual_legacy_duplicate_and_owner_refund_regression', async () => {
      const input = order(orderId('legacy-regression'));
      await oldSave(input, 'refunded', A.id);
      await oldSave(input, 'refunded', A.id);
      await oldSave(input, 'paid', B.id);
      const saved = await read(input.lemonOrderId);
      assert.equal(saved.user_id, B.id); assert.equal(saved.status, 'paid');
      const rows = unwrap(await service.from('purchases').select('id').eq('lemon_order_id', input.lemonOrderId), 'DUPLICATE_COUNT_FAILED');
      assert.equal(rows.length, 1);
      // Restore this isolated synthetic example; no baseline corruption is kept.
      unwrap(await service.from('purchases').update({ user_id: A.id, status: 'refunded' }).eq('id', saved.id), 'BASELINE_RESET_FAILED');
      const restored = await read(input.lemonOrderId);
      assert.equal(restored.user_id, A.id); assert.equal(restored.status, 'refunded');
    });
    await check('baseline_actual_legacy_email_link', async () => {
      const input = order(orderId('legacy-email'));
      await oldSave(input);
      unwrap(await bulkEmailLink(), 'BASELINE_EMAIL_UPDATE_FAILED');
      assert.equal((await read(input.lemonOrderId)).user_id, B.id);
    });
    await check('baseline_preserved_samples', async () => {
      const preserved = [];
      for (const [name, owner] of [['owned', A.id], ['unlinked', undefined]]) {
        const input = order(orderId(`preserve-${name}`), { buyerEmail: `preserve-${name}-${manifest.runId}@example.invalid` });
        await oldSave(input, 'paid', owner);
        preserved.push(await read(input.lemonOrderId));
      }
      const claim = await makeClaim(null, { consumed_at: null, consumed_order_id: null });
      const claimSnapshot = unwrap(await service.from('purchase_account_claims')
        .select('id,token_hash,user_id,product_slug,lemon_variant_id,expires_at,consumed_at,consumed_order_id,created_at')
        .eq('id', claim.id).single(), 'BASELINE_CLAIM_READ_FAILED');
      manifest.preserved = { purchases: preserved, claim: claimSnapshot };
      await persist();
    });
  } else {
    await check('baseline_rows_unchanged_by_migrations', async () => {
      requireCondition(manifest.preserved?.purchases?.length === 2, 'PRESERVED_SNAPSHOT_MISSING');
      for (const expected of manifest.preserved.purchases) {
        const actual = await read(expected.lemon_order_id);
        delete actual.account_link_status;
        assert.deepEqual(actual, expected);
      }
      const expected = manifest.preserved.claim;
      const actual = unwrap(await service.from('purchase_account_claims').select(Object.keys(expected).join(','))
        .eq('id', expected.id).single(), 'PRESERVED_CLAIM_READ_FAILED');
      assert.deepEqual(actual, expected);
    });
    await check('legacy_upsert_duplicate_owner_and_refund_guards', async () => {
      for (const status of ['refunded', 'partial_refund', 'fraudulent']) {
        const input = order(orderId(`legacy-${status}`));
        const first = await oldSave(input, status, A.id);
        const duplicate = await oldSave(input, status, A.id);
        assert.equal(duplicate.id, first.id);
        await oldSave(input, 'paid', B.id);
        const actual = await read(input.lemonOrderId);
        assert.equal(actual.id, first.id); assert.equal(actual.user_id, A.id); assert.equal(actual.status, status);
      }
    });
    await check('legacy_bulk_patch_review_blocked_normal_email_allowed', async () => {
      const protectedId = orderId('email-review'); const eligibleId = orderId('email-eligible');
      await save(order(protectedId), 'paid', null, 'claim_review');
      await oldSave(order(eligibleId));
      unwrap(await bulkEmailLink(), 'LEGACY_BULK_PATCH_FAILED');
      const protectedRow = await read(protectedId);
      assert.equal(protectedRow.user_id, null); assert.equal(protectedRow.account_link_status, 'claim_review');
      assert.equal((await read(eligibleId)).user_id, B.id);
    });
    await check('review_link_requires_exact_consumed_claim', async () => {
      const id = orderId('claim-review');
      await save(order(id), 'paid', null, 'claim_review');
      await save(order(id), 'paid', A.id, 'linked');
      assert.equal((await read(id)).user_id, null);
      const wrongVariantId = orderId('claim-wrong-variant');
      await save(order(wrongVariantId), 'paid', null, 'claim_review');
      await makeClaim(wrongVariantId, { lemon_variant_id: 'synthetic-wrong-variant' });
      await save(order(wrongVariantId), 'paid', A.id, 'linked');
      assert.equal((await read(wrongVariantId)).user_id, null);
      const wrongOrderId = orderId('claim-wrong-order');
      await save(order(wrongOrderId), 'paid', null, 'claim_review');
      await makeClaim(orderId('different-claim-order'));
      await save(order(wrongOrderId), 'paid', A.id, 'linked');
      assert.equal((await read(wrongOrderId)).user_id, null);
      await makeClaim(id);
      await save(order(id), 'paid', B.id, 'linked');
      assert.equal((await read(id)).user_id, null);
      await save(order(id), 'paid', A.id, 'linked');
      assert.equal((await read(id)).user_id, A.id);
    });
    await check('new_rpc_duplicate_and_concurrent_refund', async () => {
      const input = order(orderId('rpc-race'));
      const first = await save(input);
      assert.equal((await save(input)).id, first.id);
      await Promise.all([save(input, 'paid', B.id), save(input, 'refunded', A.id)]);
      const actual = await read(input.lemonOrderId);
      assert.equal(actual.user_id, A.id); assert.equal(actual.status, 'refunded');
      const rows = unwrap(await service.from('purchases').select('id').eq('lemon_order_id', input.lemonOrderId), 'RPC_DUPLICATE_COUNT_FAILED');
      assert.equal(rows.length, 1);
    });
    await check('identity_changes_rejected_and_paid_value_preserved', async () => {
      const input = order(orderId('identity'));
      await save(input);
      await oldSave({ ...input, totalCents: 0, currency: 'EUR' }, 'failed', B.id);
      let actual = await read(input.lemonOrderId);
      assert.equal(actual.status, 'paid'); assert.equal(actual.total_cents, 2900); assert.equal(actual.currency, 'USD');
      const changed = await service.from('purchases').update({ lemon_variant_id: 'synthetic-wrong-variant' }).eq('id', actual.id);
      assert.equal(changed.error?.code, '22023');
      actual = await read(input.lemonOrderId); assert.equal(actual.lemon_variant_id, variant);
    });
    await check('inbox_concurrent_lease_and_duplicate_capture', async () => {
      const event = await makeEvent(orderId('inbox-lease'));
      const lease = () => service.rpc('claim_payment_webhook_event', { p_event_id: event.id, p_allow_quarantined: false });
      const results = (await Promise.all([lease(), lease()])).map(value => unwrap(value, 'INBOX_LEASE_FAILED'));
      assert.equal(results.filter(Boolean).length, 1);
      const first = results.find(Boolean);
      const { id: _id, ...insertValues } = event;
      const duplicate = unwrap(await service.from('payment_webhook_events').upsert(insertValues, { onConflict: 'event_key', ignoreDuplicates: true })
        .select('id,state,lease_token,attempts').maybeSingle(), 'INBOX_DUPLICATE_CAPTURE_FAILED');
      assert.equal(duplicate, null);
      const existing = unwrap(await service.from('payment_webhook_events').select('id,state,lease_token,attempts')
        .eq('event_key', event.event_key).single(), 'INBOX_DUPLICATE_LOOKUP_FAILED');
      assert.equal(existing.id, event.id); assert.equal(existing.state, 'processing');
      assert.equal(existing.lease_token, first.lease_token); assert.equal(existing.attempts, 1);
      unwrap(await service.from('payment_webhook_events').update({ lease_until: new Date(Date.now() - 10_000).toISOString() }).eq('id', event.id), 'INBOX_EXPIRE_FAILED');
      const retried = unwrap(await lease(), 'INBOX_RETRY_FAILED');
      assert.equal(retried.attempts, 2); assert.notEqual(retried.lease_token, first.lease_token);
    });

    if (stage === '002' || stage === '003') {
      await check('analytics_lease_wrong_owner_concurrency_and_expiry', async () => {
        const id = orderId('analytics-lease'); await save(order(id));
        const claim = await makeClaim(id, { analytics_recovery_enabled: true });
        const lease = (userId = A.id) => service.rpc('lease_purchase_analytics', {
          p_claim_id: claim.id, p_user_id: userId, p_lease_token: randomUUID()
        });
        assert.equal(unwrap(await lease(B.id), 'ANALYTICS_WRONG_OWNER_FAILED'), false);
        const results = (await Promise.all([lease(), lease()])).map(value => unwrap(value, 'ANALYTICS_LEASE_FAILED'));
        assert.deepEqual(results.sort(), [false, true]);
        unwrap(await service.from('purchase_account_claims').update({ analytics_lease_expires_at: new Date(Date.now() - 10_000).toISOString() }).eq('id', claim.id), 'ANALYTICS_EXPIRE_FAILED');
        assert.equal(unwrap(await lease(), 'ANALYTICS_RETRY_FAILED'), true);
      });
    }

    for (const [role, browser] of [['anon', anonymous], ['authenticated', authenticated]]) {
      await check(`${role}_private_tables_and_rpc_denied`, async () => {
        const id = orderId(`${role}-permissions`); const input = order(id);
        const purchase = await save(input);
        const claim = await makeClaim(id, stage === '001' ? {} : { analytics_recovery_enabled: true });
        const event = await makeEvent(id);
        const fixtures = [
          ['purchases', purchase.id, legacyValues(order(orderId(`${role}-insert`)), 'paid', A.id), 'total_cents', 7],
          ['purchase_account_claims', claim.id, { token_hash: randomBytes(32).toString('hex'), user_id: A.id, product_slug: slug, lemon_variant_id: variant, expires_at: future() }, 'product_slug', 'unauthorized-synthetic-change'],
          ['payment_webhook_events', event.id, { event_key: orderId(`${role}-insert-event`), event_name: 'order_created', lemon_order_id: orderId(`${role}-insert-event-order`), order_data: input, source: 'webhook' }, 'reason', 'unauthorized-synthetic-change']
        ];
        for (const [table, fixtureId, insertValues, column, newValue] of fixtures) {
          const before = unwrap(await service.from(table).select(`id,${column}`).eq('id', fixtureId).single(), 'PERMISSION_CONTROL_READ_FAILED');
          const visible = await browser.from(table).select('id').eq('id', fixtureId);
          if (visible.error) assert.equal(visible.error.code, '42501');
          else assert.deepEqual(visible.data, []);
          const unauthorizedId = randomUUID();
          const inserted = await browser.from(table).insert({ ...insertValues, id: unauthorizedId }).select('id');
          assert.equal(inserted.error?.code, '42501');
          const checkInserted = unwrap(await service.from(table).select('id').eq('id', unauthorizedId), 'PERMISSION_INSERT_REQUERY_FAILED');
          assert.deepEqual(checkInserted, []);
          const updated = await browser.from(table).update({ [column]: newValue }).eq('id', fixtureId);
          if (updated.error) assert.equal(updated.error.code, '42501');
          const after = unwrap(await service.from(table).select(`id,${column}`).eq('id', fixtureId).single(), 'PERMISSION_UPDATE_REQUERY_FAILED');
          assert.deepEqual(after, before);
        }
        const deniedOrder = order(orderId(`${role}-rpc-denied`));
        const deniedPurchase = await browser.rpc('persist_payment_purchase', saveArgs(deniedOrder));
        assert.equal(deniedPurchase.error?.code, '42501');
        assert.deepEqual(unwrap(await service.from('purchases').select('id').eq('lemon_order_id', deniedOrder.lemonOrderId), 'DENIED_RPC_REQUERY_FAILED'), []);
        const deniedInbox = await browser.rpc('claim_payment_webhook_event', { p_event_id: event.id, p_allow_quarantined: false });
        assert.equal(deniedInbox.error?.code, '42501');
        const unchanged = unwrap(await service.from('payment_webhook_events').select('state,lease_token').eq('id', event.id).single(), 'DENIED_INBOX_REQUERY_FAILED');
        assert.equal(unchanged.state, 'pending'); assert.equal(unchanged.lease_token, null);
        if (stage !== '001') {
          const deniedAnalytics = await browser.rpc('lease_purchase_analytics', { p_claim_id: claim.id, p_user_id: A.id, p_lease_token: randomUUID() });
          assert.equal(deniedAnalytics.error?.code, '42501');
          const unchangedClaim = unwrap(await service.from('purchase_account_claims').select('analytics_lease_token').eq('id', claim.id).single(), 'DENIED_ANALYTICS_REQUERY_FAILED');
          assert.equal(unchangedClaim.analytics_lease_token, null);
        }
      });
    }
  }
  manifest.completed[stage] = report.failed === 0;
  manifest.lastResult = { stage, passed: report.passed, failed: report.failed };
  await persist();
}

try { await main(); }
catch (error) {
  report.failed += 1;
  report.checks.push({ name: 'setup_or_execution', ok: false, code: error.checkCode ?? 'SETUP_OR_EXECUTION_FAILED',
    ...(error.apiCode ? { apiCode: error.apiCode } : {}), ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}) });
}
console.log(JSON.stringify(report));
process.exitCode = report.failed ? 1 : 0;
