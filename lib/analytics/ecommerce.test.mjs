import assert from 'node:assert/strict';
import test from 'node:test';
import { GOOGLE_ADS_PURCHASE_SEND_TO } from './config.ts';
import {
  isGoogleAdsPurchaseEligible,
  trackAddToCart,
  trackBeginCheckout,
  trackBuyNowClick,
  trackGoogleAdsPurchase,
  trackPurchase
} from './ecommerce.ts';

const product = {
  productName: 'Nebula Crush',
  productSlug: 'nebula-crush',
  productCategory: 'Audio Plugin',
  productSeries: 'Nebula Series',
  price: 39,
  currency: 'USD'
};

function installBrowser({ withGtag = true, hostname = 'farmverb.com' } = {}) {
  const calls = [];
  const storage = new Map();
  globalThis.document = { title: 'Nebula Crush | FarmVerb' };
  globalThis.window = {
    location: {
      hostname,
      pathname: '/crush',
      search: '?utm_source=instagram',
      href: 'https://farmverb.com/crush?utm_source=instagram'
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    ...(withGtag ? { gtag: (...args) => calls.push(args) } : {})
  };

  return { calls, storage };
}

function uninstallBrowser() {
  delete globalThis.window;
  delete globalThis.document;
}

test('the product funnel sends one GA4 event per action with shared product context', () => {
  const { calls } = installBrowser();

  try {
    assert.equal(trackBuyNowClick(product), true);
    assert.equal(trackAddToCart(product), true);
    assert.equal(trackBeginCheckout(product), true);
    assert.equal(trackPurchase(product, {
      transactionId: 'order-123',
      value: 39,
      currency: 'usd'
    }), true);
    assert.equal(trackPurchase(product, {
      transactionId: 'order-123',
      value: 39,
      currency: 'usd'
    }), false);

    assert.deepEqual(calls.map((call) => call[1]), [
      'buy_now_click',
      'add_to_cart',
      'begin_checkout',
      'purchase'
    ]);

    for (const [, , parameters] of calls) {
      assert.equal(parameters.product_name, 'Nebula Crush');
      assert.equal(parameters.product_slug, 'nebula-crush');
      assert.equal(parameters.product_category, 'Audio Plugin');
      assert.equal(parameters.product_series, 'Nebula Series');
      assert.equal(parameters.price, 39);
      assert.equal(parameters.currency, 'USD');
      assert.equal(parameters.page_path, '/crush?utm_source=instagram');
      assert.equal(parameters.items[0].item_id, 'nebula-crush');
      assert.equal(parameters.items[0].quantity, 1);
    }

    assert.equal(calls[3][2].transaction_id, 'order-123');
  } finally {
    uninstallBrowser();
  }
});

test('an early click is queued until gtag.js is ready', () => {
  installBrowser({ withGtag: false });

  try {
    assert.equal(trackBuyNowClick(product), true);
    assert.equal(window.dataLayer.length, 1);
    assert.equal(window.dataLayer[0][0], 'event');
    assert.equal(window.dataLayer[0][1], 'buy_now_click');
    assert.equal(window.gtag, undefined);
  } finally {
    uninstallBrowser();
  }
});

test('a verified Live paid order sends one Google Ads conversion with actual order values', () => {
  const { calls, storage } = installBrowser();
  const purchase = {
    transactionId: 'lemon-order-9876',
    value: 69,
    currency: 'usd',
    status: 'paid',
    testMode: false
  };

  try {
    assert.equal(trackGoogleAdsPurchase(purchase, GOOGLE_ADS_PURCHASE_SEND_TO), true);
    assert.equal(trackGoogleAdsPurchase(purchase, GOOGLE_ADS_PURCHASE_SEND_TO), false);
    assert.deepEqual(calls, [[
      'event',
      'conversion',
      {
        send_to: GOOGLE_ADS_PURCHASE_SEND_TO,
        value: 69,
        currency: 'USD',
        transaction_id: 'lemon-order-9876'
      }
    ]]);
    assert.equal(
      storage.get('farmverb.google-ads.purchase.v1:lemon-order-9876'),
      'sent'
    );
  } finally {
    uninstallBrowser();
  }
});

test('Google Ads conversion rejects non-paid, Test Mode, invalid, and non-production purchases', () => {
  const basePurchase = {
    transactionId: 'lemon-order-9876',
    value: 29,
    currency: 'USD',
    status: 'paid',
    testMode: false
  };
  const blockedStatuses = ['pending', 'failed', 'refunded', 'partial_refund', 'fraudulent'];

  for (const status of blockedStatuses) {
    assert.equal(isGoogleAdsPurchaseEligible({ ...basePurchase, status }), false);
  }
  assert.equal(isGoogleAdsPurchaseEligible({ ...basePurchase, testMode: true }), false);
  assert.equal(isGoogleAdsPurchaseEligible({ ...basePurchase, transactionId: '  ' }), false);
  assert.equal(isGoogleAdsPurchaseEligible({ ...basePurchase, value: Number.NaN }), false);
  assert.equal(isGoogleAdsPurchaseEligible({ ...basePurchase, currency: 'US' }), false);

  const { calls } = installBrowser({ hostname: 'localhost' });
  try {
    assert.equal(trackGoogleAdsPurchase(basePurchase, GOOGLE_ADS_PURCHASE_SEND_TO), false);
    assert.equal(calls.length, 0);
  } finally {
    uninstallBrowser();
  }
});

test('page and checkout funnel actions never emit a Google Ads purchase conversion', () => {
  const { calls } = installBrowser();

  try {
    trackBuyNowClick(product);
    trackBeginCheckout(product);
    trackAddToCart(product);

    assert.deepEqual(calls.map((call) => call[1]), [
      'buy_now_click',
      'begin_checkout',
      'add_to_cart'
    ]);
    assert.equal(calls.some((call) => call[1] === 'conversion'), false);
  } finally {
    uninstallBrowser();
  }
});
