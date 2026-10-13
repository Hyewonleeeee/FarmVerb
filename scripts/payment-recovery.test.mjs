import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRecoveryArgs, runRecovery, createRecoveryDependencies } from './payment-recovery.mjs';
const eventId = '00000000-0000-4000-8000-000000000001';
const order = { lemonOrderId: '123', storeId: '7', testMode: false, status: 'paid', lemonVariantId: '2147845', purchasedAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z' };
const event = { id: eventId, lemon_order_id: '123', event_name: 'order_created', state: 'failed', reason: 'PROCESSING_FAILED', order_data: order, source: 'webhook', claim_present: true, claim_hash: 'a'.repeat(64), email: 'private@example.invalid' };
function makeDeps(overrides = {}) {
  const writes = [];
  return { writes, deps: {
    storeId: '7', listEvents: async () => [event], getEvent: async () => event, getOrder: async () => order,
    compareOrder: async () => ({ purchase: null, events: [] }),
    storeEvent: async (input) => { writes.push(input); return event; },
    process: async (input) => { writes.push(input); return { state: 'processed', purchase: { user_id: 'private-id' } }; },
    ...overrides
  } };
}

test('CLI defaults to read-only and requires exact IDs for mutation commands', () => {
  assert.equal(parseRecoveryArgs([]).command, 'status');
  assert.equal(parseRecoveryArgs(['replay', '--event-id', eventId]).apply, false);
  for (const args of [['replay', '--apply'], ['reconcile', '--apply'], ['status', '--apply'], ['status', '--user-id', 'x'], ['replay', '--event-id', eventId, '--check']]) assert.throws(() => parseRecoveryArgs(args));
  assert.equal(parseRecoveryArgs(['status', '--check']).check, true);
});

test('status, replay preview and reconciliation preview make zero writes and omit PII', async () => {
  for (const args of [[], ['replay', '--event-id', eventId], ['reconcile', '--order-id', '123']]) {
    const { writes, deps } = makeDeps();
    const result = await runRecovery(parseRecoveryArgs(args), deps);
    assert.equal(writes.length, 0);
    assert.equal(JSON.stringify(result).includes('private'), false);
    assert.equal(JSON.stringify(result).includes('claim_hash'), false);
  }
});

test('reconcile refuses a different store, order or Test Mode even with apply', async () => {
  for (const change of [{ storeId: 'other' }, { lemonOrderId: 'other' }, { testMode: true }]) {
    const { writes, deps } = makeDeps({ getOrder: async () => ({ ...order, ...change }) });
    await assert.rejects(runRecovery(parseRecoveryArgs(['reconcile', '--order-id', '123', '--apply']), deps));
    assert.equal(writes.length, 0);
  }
});

test('apply reuses a claim-bearing created webhook when a newer refund has no custom data', async () => {
  const noClaimRefund = { ...event, event_name: 'order_refunded', claim_present: false, claim_hash: null };
  const { writes, deps } = makeDeps({ compareOrder: async () => ({ purchase: null, events: [noClaimRefund, event] }) });
  await runRecovery(parseRecoveryArgs(['reconcile', '--order-id', '123', '--apply']), deps);
  assert.equal(writes[0].claimHash, event.claim_hash);
  assert.equal(writes[0].claimPresent, true);
});

test('claim evidence from a different variant is not reused, and recovered refund uses refund processor', async () => {
  const wrongVariant = { ...event, order_data: { ...order, lemonVariantId: 'different' } };
  const { writes, deps } = makeDeps({ getOrder: async () => ({ ...order, status: 'refunded' }), compareOrder: async () => ({ purchase: null, events: [wrongVariant] }) });
  await runRecovery(parseRecoveryArgs(['reconcile', '--order-id', '123', '--apply']), deps);
  assert.equal(writes[0].claimHash, null);
  assert.equal(writes[0].claimPresent, false);
  assert.equal(writes[0].source, 'reconciliation');
  assert.equal(writes[0].eventName, 'order_refunded');
});

test('status dependencies do not require Lemon credentials and perform no network request on construction', () => {
  assert.doesNotThrow(() => createRecoveryDependencies({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'local-test-only-key' }));
});

test('recovery Supabase falls back for blank primary keys and prefers a nonblank primary key', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url: String(url), headers: new Headers(options.headers) });
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  for (const primary of [undefined, '', ' \t\n', '  synthetic-primary-key  ']) {
    const dependencies = createRecoveryDependencies({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid',
      SUPABASE_SECRET_KEY: primary,
      SUPABASE_SERVICE_ROLE_KEY: '  synthetic-legacy-key  '
    });
    await dependencies.listEvents({});
    const request = requests.at(-1);
    assert.equal(new URL(request.url).hostname, 'example.invalid');
    const expected = primary?.trim() ? 'synthetic-primary-key' : 'synthetic-legacy-key';
    assert.equal(request.headers.get('apikey'), expected);
    assert.equal(request.headers.get('authorization'), `Bearer ${expected}`);
  }
  assert.equal(requests.length, 4);
});

test('recovery Supabase fails before requests when both keys are missing or blank', () => {
  for (const keys of [{}, { SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: ' \n' }]) {
    assert.throws(() => createRecoveryDependencies({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', ...keys
    }), /Supabase server credentials are required/);
  }
});

test('conflicting signature-verified claim hashes require review instead of choosing an owner', async () => {
  const { writes, deps } = makeDeps({ compareOrder: async () => ({ purchase: null, events: [event, { ...event, claim_hash: 'b'.repeat(64) }] }) });
  await runRecovery(parseRecoveryArgs(['reconcile', '--order-id', '123', '--apply']), deps);
  assert.equal(writes[0].claimPresent, true);
  assert.equal(writes[0].claimHash, null);
});
