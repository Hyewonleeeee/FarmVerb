import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCheckoutSuccessOrderId,
  getConfirmedCheckoutPurchase,
  hasConfirmedCheckoutPurchase,
  initializeLemonSqueezy,
  loadCheckoutSuccessMarker,
  saveCheckoutSuccessMarker,
  clearCheckoutSuccessMarker,
  parseCheckoutSuccessMarker,
  serializeCheckoutSuccessMarker,
  tryOpenLemonCheckout
} from './lemonOverlay.ts';

test('checkout overlay opens through Lemon.js when available', () => {
  const opened = [];
  const target = {
    LemonSqueezy: {
      Url: {
        Open: (url) => opened.push(url)
      }
    }
  };

  assert.equal(tryOpenLemonCheckout('https://example.com/checkout', target), true);
  assert.deepEqual(opened, ['https://example.com/checkout']);
});

test('checkout overlay fails open to native navigation when Lemon.js is unavailable', () => {
  assert.equal(tryOpenLemonCheckout('https://example.com/checkout', undefined), false);
  assert.equal(tryOpenLemonCheckout('https://example.com/checkout', {}), false);
});

test('checkout overlay fails open when Lemon.js throws', () => {
  const target = {
    LemonSqueezy: {
      Url: {
        Open: () => {
          throw new Error('blocked');
        }
      }
    }
  };

  assert.equal(tryOpenLemonCheckout('https://example.com/checkout', target), false);
});

test('Lemon.js initialization is idempotent once the overlay API is available', () => {
  let initialized = 0;
  let refreshed = 0;
  const target = {
    createLemonSqueezy: () => {
      initialized += 1;
    },
    LemonSqueezy: {
      Refresh: () => {
        refreshed += 1;
      },
      Url: {
        Open: () => {}
      }
    }
  };

  assert.equal(initializeLemonSqueezy(target), true);
  assert.equal(initializeLemonSqueezy(target), true);
  assert.equal(initialized, 0);
  assert.equal(refreshed, 2);
});

test('Lemon.js initializes once when the overlay API is not ready yet', () => {
  let initialized = 0;
  const target = {
    createLemonSqueezy: () => {
      initialized += 1;
      target.LemonSqueezy = {
        Url: { Open: () => {} }
      };
    }
  };

  assert.equal(initializeLemonSqueezy(target), true);
  assert.equal(initializeLemonSqueezy(target), true);
  assert.equal(initialized, 1);
});

test('Lemon.js forwards Checkout.Success through the configured event handler', () => {
  let configuredHandler = null;
  const received = [];
  const target = {
    LemonSqueezy: {
      Setup: ({ eventHandler }) => {
        configuredHandler = eventHandler;
      },
      Url: { Open: () => {} }
    }
  };

  assert.equal(initializeLemonSqueezy(target, (event) => received.push(event)), true);
  configuredHandler?.({ event: 'Checkout.Success', data: { id: '1234' } });
  assert.deepEqual(received, [{ event: 'Checkout.Success', data: { id: '1234' } }]);
});

test('checkout success markers correlate only with a verified purchase response', () => {
  const openedAt = Date.parse('2026-09-22T10:00:00.000Z');
  const marker = parseCheckoutSuccessMarker(serializeCheckoutSuccessMarker({
    productName: 'Boseong Green Tea',
    openedAt,
    orderId: '9876'
  }));
  const purchases = [{
    lemon_order_id: '9876',
    product_name: 'Boseong Green Tea',
    purchased_at: '2026-09-22T10:00:10.000Z',
    status: 'paid',
    test_mode: false
  }];

  assert.equal(hasConfirmedCheckoutPurchase(purchases, marker), true);
  assert.equal(getConfirmedCheckoutPurchase(purchases, marker), purchases[0]);
  assert.equal(hasConfirmedCheckoutPurchase([{ ...purchases[0], lemon_order_id: 'other' }], marker), false);
  assert.equal(hasConfirmedCheckoutPurchase([{ ...purchases[0], status: 'pending' }], marker), false);
  assert.equal(hasConfirmedCheckoutPurchase([{ ...purchases[0], test_mode: true }], marker), false);
});

test('product/time similarity never confirms an order without its exact verified ID', () => {
  const openedAt = Date.parse('2026-09-22T10:00:00.000Z');
  const marker = { productName: 'Boseong Green Tea', openedAt, orderId: null };
  const purchase = {
    lemon_order_id: '9876',
    product_name: 'Boseong Green Tea',
    purchased_at: '2026-09-22T10:00:10.000Z',
    status: 'paid',
    test_mode: false
  };

  assert.equal(hasConfirmedCheckoutPurchase([purchase], marker), false);
  assert.equal(hasConfirmedCheckoutPurchase([{ ...purchase, product_name: 'Jeju Citrus Air' }], marker), false);
  assert.equal(hasConfirmedCheckoutPurchase([{ ...purchase, purchased_at: '2026-09-22T09:40:00.000Z' }], marker), false);
});

test('pending hosted checkout persists across sessions and stays scoped to its account', () => {
  const persisted = new Map();
  const storage = { getItem: (key) => persisted.get(key) ?? null, setItem: (key, value) => persisted.set(key, value), removeItem: (key) => persisted.delete(key) };
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  globalThis.window = { localStorage: storage, sessionStorage: blocked };
  const marker = { productName: 'Nebula Crush', openedAt: Date.now(), orderId: null, userId: 'owner', claimId: 'claim' };
  try {
    saveCheckoutSuccessMarker(marker);
    globalThis.window = { localStorage: storage, sessionStorage: blocked };
    assert.deepEqual(loadCheckoutSuccessMarker('owner'), marker);
    assert.equal(loadCheckoutSuccessMarker('other'), null);
    clearCheckoutSuccessMarker('unrelated');
    assert.deepEqual(loadCheckoutSuccessMarker('owner'), marker);
    saveCheckoutSuccessMarker({ ...marker, orderId: 'verified-order' });
    clearCheckoutSuccessMarker('verified-order');
    assert.equal(loadCheckoutSuccessMarker('owner'), null);
  } finally {
    delete globalThis.window;
  }
});

test('unavailable storage preserves same-document intent without throwing; stale intent is ignored', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  globalThis.window = { localStorage: blocked, sessionStorage: blocked };
  try {
    const marker = { productName: 'Nebula Crush', openedAt: Date.now(), orderId: null };
    assert.doesNotThrow(() => saveCheckoutSuccessMarker(marker));
    assert.deepEqual(loadCheckoutSuccessMarker(), marker);
    saveCheckoutSuccessMarker({ ...marker, openedAt: Date.now() - 73 * 60 * 60 * 1000 });
    assert.equal(loadCheckoutSuccessMarker(), null);
  } finally {
    delete globalThis.window;
  }
});

test('an exact return hint takes precedence over an older persisted checkout without borrowing its claim', () => {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  globalThis.window = { localStorage: storage, sessionStorage: storage, location: { search: '?checkout=success&order_id=new-order' } };
  try {
    saveCheckoutSuccessMarker({ productName: 'Nebula Crush', openedAt: Date.now(), orderId: 'old-order', claimId: 'old-claim', userId: 'owner' });
    const hint = loadCheckoutSuccessMarker('owner');
    assert.equal(hint.orderId, 'new-order');
    assert.equal(hint.claimId, undefined);
    assert.equal(getConfirmedCheckoutPurchase([], hint), null);
  } finally {
    delete globalThis.window;
  }
});

test('Checkout.Success order IDs are read without trusting other events', () => {
  assert.equal(getCheckoutSuccessOrderId({ event: 'Checkout.Success', data: { id: 1234 } }), '1234');
  assert.equal(getCheckoutSuccessOrderId({ event: 'Checkout.Closed', data: { id: 1234 } }), null);
  assert.equal(getCheckoutSuccessOrderId({ event: 'Checkout.Success', data: null }), null);
});
