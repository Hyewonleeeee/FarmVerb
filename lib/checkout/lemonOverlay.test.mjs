import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initializeLemonSqueezy,
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
