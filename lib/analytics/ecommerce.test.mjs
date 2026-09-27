import assert from 'node:assert/strict';
import test from 'node:test';
import {
  trackAddToCart,
  trackBeginCheckout,
  trackBuyNowClick,
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

function installBrowser({ withGtag = true } = {}) {
  const calls = [];
  const storage = new Map();
  globalThis.document = { title: 'Nebula Crush | FarmVerb' };
  globalThis.window = {
    location: {
      hostname: 'farmverb.com',
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
