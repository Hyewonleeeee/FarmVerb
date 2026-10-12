import assert from 'node:assert/strict';
import test from 'node:test';
import { processPaymentEvent } from './paymentProcessing.ts';

const makeEvent = (overrides = {}) => ({
  id: 'event-1', event_name: 'order_created', lemon_order_id: '123', claim_hash: 'a'.repeat(64),
  claim_present: true, source: 'webhook', state: 'pending', reason: null, lease_token: null,
  order_data: { lemonOrderId: '123', storeId: '7', lemonVariantId: '2147845', productName: 'Boseong Green Tea', buyerEmail: 'billing@example.invalid', status: 'paid', currency: 'USD', totalCents: 2900, testMode: false, purchasedAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z' },
  ...overrides
});
function dependencies(event, overrides = {}) {
  const calls = [];
  const deps = {
    configuredStoreId: '7',
    leaseEvent: async () => { calls.push('lease'); return { ...event, lease_token: 'lease-1', state: 'processing' }; },
    finishEvent: async (_, state, reason) => { calls.push({ state, reason }); },
    getProductSlug: () => 'boseong-green-tea',
    resolveClaim: async () => ({ status: 'linked', userId: 'initiating-account', duplicate: false }),
    savePurchase: async (input) => {
      calls.push({ save: input });
      return { id: 'purchase-1', lemon_order_id: '123', product_slug: input.productSlug, status: input.status, user_id: input.userId ?? null, account_link_status: input.linkStatus };
    },
    processRefund: async (_, recordStatus) => { await recordStatus('refunded'); },
    ...overrides
  };
  return { calls, deps };
}

test('verified claim chooses the initiating account independently of billing email', async () => {
  const event = makeEvent(); const { calls, deps } = dependencies(event);
  const result = await processPaymentEvent(event, deps);
  assert.equal(result.state, 'processed');
  assert.equal(result.purchase.user_id, 'initiating-account');
  assert.equal(calls.find((call) => call.save).save.linkStatus, 'linked');
});

test('claim expiry, tampering, reuse, and variant mismatch are durable review cases, never billing-email fallback', async () => {
  for (const status of ['expired', 'invalid', 'reused', 'variant_mismatch']) {
    const event = makeEvent(); const { calls, deps } = dependencies(event, { resolveClaim: async () => ({ status }) });
    const result = await processPaymentEvent(event, deps);
    assert.equal(result.state, 'quarantined');
    assert.equal(result.reason, `claim_${status}`);
    const saved = calls.find((call) => call.save).save;
    assert.equal(saved.userId, undefined);
    assert.equal(saved.linkStatus, 'claim_review');
  }
});

test('unmapped variant is retained in the inbox without granting a purchase and can be retried after mapping', async () => {
  const event = makeEvent(); const { calls, deps } = dependencies(event, { getProductSlug: () => null });
  assert.equal((await processPaymentEvent(event, deps)).reason, 'unmapped_variant');
  assert.equal(calls.some((call) => call.save), false);
  const reviewed = { ...event, state: 'quarantined', reason: 'unmapped_variant' };
  const retry = dependencies(reviewed);
  assert.equal((await processPaymentEvent(reviewed, retry.deps, { retryQuarantined: true })).state, 'processed');
});

test('processed duplicates and actively leased events perform no purchase write', async () => {
  for (const event of [makeEvent({ state: 'processed' }), makeEvent()]) {
    const { calls, deps } = dependencies(event, { leaseEvent: async () => null });
    assert.equal((await processPaymentEvent(event, deps)).state, event.state === 'processed' ? 'processed' : 'busy');
    assert.equal(calls.length, 0);
  }
});

test('database outage marks the event failed, and the retained event succeeds on retry', async () => {
  const event = makeEvent();
  const failure = dependencies(event, { savePurchase: async () => { throw new Error('temporary database outage'); } });
  await assert.rejects(processPaymentEvent(event, failure.deps), /processing failed/);
  assert.deepEqual(failure.calls.at(-1), { state: 'failed', reason: 'PROCESSING_FAILED' });
  const retry = dependencies({ ...event, state: 'failed' });
  assert.equal((await processPaymentEvent({ ...event, state: 'failed' }, retry.deps)).state, 'processed');
});

test('refund revocation outage records refunded first then remains retryable', async () => {
  const event = makeEvent({ event_name: 'order_refunded' });
  const { calls, deps } = dependencies(event, { processRefund: async (_, recordStatus) => { await recordStatus('refunded'); throw new Error('license API unavailable'); } });
  await assert.rejects(processPaymentEvent(event, deps));
  assert.equal(calls.find((call) => call.save).save.status, 'refunded');
  assert.deepEqual(calls.at(-1), { state: 'failed', reason: 'PROCESSING_FAILED' });
});

test('claim failure does not prevent verified refund recording and license revocation', async () => {
  const event = makeEvent({ event_name: 'order_refunded' }); let revoked = false;
  const { deps } = dependencies(event, { resolveClaim: async () => ({ status: 'expired' }), processRefund: async (_, recordStatus) => { await recordStatus('refunded'); revoked = true; } });
  const result = await processPaymentEvent(event, deps);
  assert.equal(revoked, true); assert.equal(result.purchase.status, 'refunded'); assert.equal(result.reason, 'claim_expired');
});

test('reconciliation without original claim never assigns a billing-email owner', async () => {
  const event = makeEvent({ source: 'reconciliation', claim_present: false, claim_hash: null });
  const { deps } = dependencies(event);
  const result = await processPaymentEvent(event, deps);
  assert.equal(result.reason, 'reconciliation_owner_review');
  assert.equal(result.purchase.account_link_status, 'claim_review');
  assert.equal(result.purchase.user_id, null);
});

test('a persisted different owner is preserved and surfaced for review', async () => {
  const event = makeEvent(); const { deps } = dependencies(event, { savePurchase: async () => ({ id: 'purchase', user_id: 'existing-owner', account_link_status: 'linked', status: 'paid' }) });
  const result = await processPaymentEvent(event, deps);
  assert.equal(result.reason, 'ownership_conflict');
  assert.equal(result.purchase.user_id, 'existing-owner');
});

test('replay rechecks Live and store boundaries before any claim or purchase operation', async () => {
  for (const order of [{ testMode: true }, { storeId: 'other' }, { lemonOrderId: 'other' }]) {
    const event = makeEvent(); Object.assign(event.order_data, order);
    const { calls, deps } = dependencies(event);
    assert.equal((await processPaymentEvent(event, deps)).reason, 'order_guard_failed');
    assert.equal(calls.some((call) => call.save), false);
  }
});
