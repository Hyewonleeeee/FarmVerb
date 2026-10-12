import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as claims from '../checkout/accountClaim.ts';
import * as webhook from './lemonWebhook.ts';
import * as refunds from './lemonRefund.ts';
import * as processing from './paymentProcessing.ts';
import { getOfficialProductByLiveVariantId } from '../products/catalog.ts';
import * as crypto from 'node:crypto';

const routeSource = ts.transpileModule(readFileSync(new URL('../../app/api/webhooks/lemon-squeezy/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const token = 'a'.repeat(43);
function payload(eventName = 'order_created', attributeOverrides = {}) {
  return { meta: { event_name: eventName, custom_data: { farmverb_account_claim: token } }, data: { type: 'orders', id: '123', attributes: {
    store_id: '7', user_email: 'different-billing@example.invalid', currency: 'USD', total: 2900,
    status: eventName === 'order_refunded' ? 'refunded' : 'paid', created_at: '2026-10-12T00:00:00Z', updated_at: eventName === 'order_refunded' ? '2026-10-12T01:00:00Z' : '2026-10-12T00:00:00Z', test_mode: false,
    first_order_item: { variant_id: '2147845', product_name: 'Boseong Green Tea' }, ...attributeOverrides
  } } };
}
function setup() {
  const state = { events: new Map(), purchases: new Map(), failCapture: false, failSave: false, failLicense: false, claimStatus: 'linked', saves: 0, patches: 0 };
  const repository = {
    storeEvent: async (input) => {
      if (state.failCapture) throw new Error('database capture outage');
      if (!state.events.has(input.eventKey)) state.events.set(input.eventKey, {
        id: `event-${state.events.size + 1}`, event_name: input.eventName, lemon_order_id: input.order.lemonOrderId,
        order_data: input.order, claim_hash: input.claimHash, claim_present: input.claimPresent,
        source: input.source, state: 'pending', reason: null, lease_token: null
      });
      return { ...state.events.get(input.eventKey) };
    },
    leaseEvent: async (id, { allowQuarantined }) => {
      const event = [...state.events.values()].find((item) => item.id === id);
      if (event.state === 'processing' || event.state === 'processed' || (event.state === 'quarantined' && !allowQuarantined)) return null;
      event.state = 'processing'; event.lease_token = 'test-lease'; return { ...event };
    },
    finishEvent: async (event, status, reason) => {
      Object.assign([...state.events.values()].find((item) => item.id === event.id), { state: status, reason });
    },
    resolveClaim: async () => state.claimStatus === 'linked' ? { status: 'linked', userId: 'initiating-user', duplicate: false } : { status: state.claimStatus },
    savePurchase: async (input) => {
      if (state.failSave) throw new Error('database purchase outage');
      state.saves += 1;
      const existing = state.purchases.get(input.order.lemonOrderId);
      const record = { id: 'purchase-1', lemon_order_id: input.order.lemonOrderId, product_slug: input.productSlug, status: existing?.status === 'refunded' ? 'refunded' : input.status, user_id: existing?.user_id ?? input.userId ?? null, account_link_status: input.linkStatus };
      state.purchases.set(input.order.lemonOrderId, record); return record;
    }
  };
  class LemonApiError extends Error { constructor(status) { super('provider unavailable'); this.status = status; } }
  const modules = {
    'node:crypto': crypto,
    'next/server': { NextResponse: { json: (body, options = {}) => new Response(JSON.stringify(body), { status: options.status ?? 200, headers: { 'Content-Type': 'application/json' } }) } },
    '@/lib/checkout/accountClaim': claims,
    '@/lib/payments/lemonProducts.server': { getProductSlugByVariantId: (id) => getOfficialProductByLiveVariantId(id)?.slug ?? null },
    '@/lib/payments/lemonWebhook.server': webhook,
    '@/lib/payments/lemonRefund': refunds,
    '@/lib/payments/paymentProcessing': processing,
    '@/lib/payments/paymentRepository': { createPaymentRepository: () => repository },
    '@/lib/supabase/server': { createServerSupabaseClient: () => ({}) },
    '@/lib/payments/lemonApi.server': { LemonApiError,
      lemonApiRequest: async (path) => path.startsWith('/orders/')
        ? { data: { type: 'orders', id: '123', attributes: { store_id: '7', status: 'refunded', refunded: true, test_mode: false, total: 2900, refunded_amount: 2900 } } }
        : { data: [{ type: 'license-keys', id: 'license-1', attributes: { order_id: '123', status: 'active', disabled: false } }] },
      lemonApiPatch: async () => { state.patches += 1; if (state.failLicense) throw new LemonApiError(503); return { data: { type: 'license-keys', id: 'license-1', attributes: { status: 'disabled', disabled: true } } }; }
    }
  };
  const exports = {};
  new Function('require', 'exports', 'process', 'console', routeSource)((id) => {
    assert.ok(Object.hasOwn(modules, id), `unexpected runtime dependency ${id}`); return modules[id];
  }, exports, { env: { LEMON_SQUEEZY_WEBHOOK_SECRET: 'test-secret', LEMON_STORE_ID: '7' } }, { warn() {}, error() {} });
  const send = (body = payload(), overrides = {}) => {
    const raw = JSON.stringify(body);
    return exports.POST(new Request('https://local.invalid/api/webhooks/lemon-squeezy', { method: 'POST', body: raw, headers: { 'x-event-name': body.meta.event_name, 'x-signature': createHmac('sha256', 'test-secret').update(raw).digest('hex'), ...overrides } }));
  };
  return { state, send };
}

test('route rejects forged signature/event mismatch before any durable capture', async () => {
  const { state, send } = setup();
  assert.equal((await send(payload(), { 'x-signature': 'forged' })).status, 401);
  assert.equal((await send(payload(), { 'x-event-name': 'order_refunded' })).status, 400);
  assert.equal(state.events.size, 0);
});

test('route preserves Test Mode and wrong-store exclusion', async () => {
  const { state, send } = setup();
  for (const overrides of [{ test_mode: true }, { store_id: '99' }]) assert.equal((await send(payload('order_created', overrides))).status, 200);
  assert.equal(state.events.size, 0);
});

test('route durably captures an unmapped Live variant and quarantines without granting it', async () => {
  const { state, send } = setup();
  const response = await send(payload('order_created', { first_order_item: { variant_id: '999999', product_name: 'Unknown Live product' } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reason, 'unmapped_variant');
  assert.equal(state.events.size, 1); assert.equal(state.purchases.size, 0);
});

test('route never acknowledges capture failure; retry persists once and stores only the claim hash', async () => {
  const { state, send } = setup(); state.failCapture = true;
  assert.equal((await send()).status, 500); assert.equal(state.events.size, 0);
  state.failCapture = false;
  assert.equal((await send()).status, 200); assert.equal((await send()).status, 200);
  assert.equal(state.events.size, 1); assert.equal(state.saves, 1);
  const event = [...state.events.values()][0];
  assert.equal(event.claim_hash, claims.hashAccountClaimToken(token));
  assert.equal(JSON.stringify(event).includes(token), false);
  assert.equal(state.purchases.get('123').user_id, 'initiating-user');
});

test('route retains database outage events and processes the same event successfully on retry', async () => {
  const { state, send } = setup(); state.failSave = true;
  assert.equal((await send()).status, 500); assert.equal([...state.events.values()][0].state, 'failed');
  state.failSave = false;
  assert.equal((await send()).status, 200); assert.equal(state.events.size, 1); assert.equal(state.saves, 1);
});

test('route returns review acknowledgement for expired claim, never grants billing email access', async () => {
  const { state, send } = setup(); state.claimStatus = 'expired';
  const response = await send(); assert.equal(response.status, 200);
  assert.equal((await response.json()).reason, 'claim_expired');
  assert.equal(state.purchases.get('123').account_link_status, 'claim_review');
  assert.equal(state.purchases.get('123').user_id, null);
});

test('concurrent duplicate requests serialize processing and cannot create duplicate purchase writes', async () => {
  const { state, send } = setup();
  const responses = await Promise.all([send(), send()]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 503]);
  assert.equal(state.events.size, 1); assert.equal(state.saves, 1);
  assert.equal((await send()).status, 200); assert.equal(state.saves, 1);
});

test('refund API outage is durably retryable after the purchase is marked refunded', async () => {
  const { state, send } = setup(); await send(); state.failLicense = true;
  assert.equal((await send(payload('order_refunded'))).status, 500);
  assert.equal(state.purchases.get('123').status, 'refunded');
  assert.equal([...state.events.values()][1].state, 'failed');
  state.failLicense = false;
  assert.equal((await send(payload('order_refunded'))).status, 200);
  assert.equal([...state.events.values()][1].state, 'processed');
  assert.equal(state.patches, 2);
  // A repeated old created event is already processed, so it does no stale write.
  const saves = state.saves; await send(); assert.equal(state.saves, saves);
  assert.equal(state.purchases.get('123').status, 'refunded');
});
