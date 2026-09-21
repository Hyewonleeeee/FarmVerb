import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  getLemonAccountClaimToken,
  normalizeLemonOrder,
  verifyLemonWebhookSignature
} from './lemonWebhook.ts';

function makePayload(overrides = {}) {
  return {
    meta: {
      event_name: 'order_created',
      custom_data: {
        farmverb_account_claim: 'claim-token'
      }
    },
    data: {
      type: 'orders',
      id: 'order-1',
      attributes: {
        store_id: 370799,
        user_email: 'Buyer@Example.com',
        currency: 'USD',
        total: 2900,
        status: 'paid',
        created_at: '2026-09-21T00:00:00.000Z',
        test_mode: false,
        first_order_item: {
          product_name: 'Boseong Green Tea',
          variant_id: 2147845,
          test_mode: false
        },
        ...overrides
      }
    }
  };
}

test('webhook signature verification accepts only the matching HMAC', () => {
  const body = JSON.stringify(makePayload());
  const secret = 'test-secret';
  const signature = createHmac('sha256', secret).update(body).digest('hex');

  assert.equal(verifyLemonWebhookSignature(body, signature, secret), true);
  assert.equal(verifyLemonWebhookSignature(`${body} `, signature, secret), false);
  assert.equal(verifyLemonWebhookSignature(body, 'bad-signature', secret), false);
});

test('Live order normalization retains store, variant, mode, and normalized email', () => {
  const order = normalizeLemonOrder(makePayload());

  assert.equal(order.storeId, '370799');
  assert.equal(order.lemonVariantId, '2147845');
  assert.equal(order.testMode, false);
  assert.equal(order.buyerEmail, 'buyer@example.com');
});

test('test mode must be explicit so malformed payloads fail closed', () => {
  const payload = makePayload();
  delete payload.data.attributes.test_mode;
  delete payload.data.attributes.first_order_item.test_mode;

  assert.throws(() => normalizeLemonOrder(payload), /Missing Lemon Squeezy test mode/);
});

test('custom data is optional for legacy and externally-created purchases', () => {
  assert.equal(getLemonAccountClaimToken(makePayload()), 'claim-token');

  const payload = makePayload();
  delete payload.meta.custom_data;
  assert.equal(getLemonAccountClaimToken(payload), null);
});
