import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../test/loadSourceModule.mjs';

function setup(initialFailure = null) {
  const saved = new Map();
  const events = [];
  let failure = initialFailure;
  const browser = {
    get localStorage() {
      if (failure === 'getter') throw new Error('Storage access blocked');
      return {
        getItem: (key) => {
          if (failure === 'get') throw new Error('Storage read blocked');
          return saved.get(key) ?? null;
        },
        setItem: (key, value) => {
          if (failure === 'set') throw new Error('Quota exceeded');
          saved.set(key, value);
        },
        removeItem: (key) => {
          if (failure === 'remove') throw new Error('Storage delete blocked');
          saved.delete(key);
        }
      };
    },
    dispatchEvent: (event) => events.push(event.type)
  };
  const load = createSourceLoader({ globals: { window: browser } });
  return {
    cart: load('lib/cart/store.ts'), saved, events,
    products: load('lib/products/catalog.ts').OFFICIAL_PRODUCT_CATALOG,
    setFailure: (value) => { failure = value; }
  };
}

for (const failure of ['getter', 'get', 'set']) {
  test(`cart add, read and purchase cleanup survive storage ${failure} errors`, () => {
    const fixture = setup(failure);
    const { cart, products } = fixture;
    cart.addItemToCart('customer-a', products[0].name);
    cart.addItemToCart('customer-a', products[1].name);
    assert.equal(cart.getCartItems('customer-a').length, 2);
    assert.equal(cart.getCartItems('customer-b').length, 0);
    cart.addItemToCart('customer-b', products[2].name);
    cart.removePurchasedCartItems('customer-a', [products[0].slug]);
    assert.equal(cart.getCartItems('customer-a').length, 1);
    assert.equal(cart.getCartItems('customer-a')[0].slug, products[1].slug);
    assert.equal(cart.getCartItems('customer-b')[0].slug, products[2].slug);
    assert.equal(fixture.events.includes('farmverb:cart-updated'), true);
  });
}

test('failed writes and clears do not resurrect stale persisted purchases', () => {
  const fixture = setup();
  const { cart, products, saved } = fixture;
  cart.addItemToCart('customer-a', products[0].name);
  cart.addItemToCart('customer-a', products[1].name);
  fixture.setFailure('set');
  cart.removePurchasedCartItems('customer-a', [products[0].slug]);
  assert.equal(JSON.parse(saved.get('farmverb_cart_v1:customer-a')).length, 2);
  assert.equal(cart.getCartItems('customer-a').length, 1);
  fixture.setFailure('remove');
  cart.clearCartItems('customer-a');
  assert.equal(saved.has('farmverb_cart_v1:customer-a'), true);
  assert.equal(cart.getCartItems('customer-a').length, 0);
  fixture.setFailure(null);
  cart.addItemToCart('customer-a', products[2].name);
  assert.equal(JSON.parse(saved.get('farmverb_cart_v1:customer-a')).length, 1);
  assert.equal(cart.getCartItems('customer-a')[0].slug, products[2].slug);
});

test('read or getter failures retain the last successfully loaded account cart', () => {
  const fixture = setup();
  fixture.cart.addItemToCart('customer-a', fixture.products[0].name);
  fixture.setFailure('get');
  assert.equal(fixture.cart.getCartItems('customer-a').length, 1);
  fixture.setFailure('getter');
  assert.equal(fixture.cart.getCartItems('customer-a').length, 1);
  const returned = fixture.cart.getCartItems('customer-a');
  returned[0].name = 'Local mutation';
  assert.equal(fixture.cart.getCartItems('customer-a')[0].name, fixture.products[0].name);
});

test('normal persistence remains account-scoped and reflects storage changes from another tab', () => {
  const fixture = setup();
  fixture.cart.addItemToCart('customer-a', fixture.products[0].name);
  fixture.saved.delete('farmverb_cart_v1:customer-a');
  assert.equal(fixture.cart.getCartItems('customer-a').length, 0);
  assert.equal(fixture.cart.getCartItems('').length, 0);
  fixture.cart.addItemToCart('customer-b', fixture.products[1].name);
  fixture.cart.clearCartItems('customer-a');
  assert.equal(fixture.cart.getCartItems('customer-b').length, 1);
});

test('server-side cart reads cannot reuse another request through an in-memory fallback', () => {
  const load = createSourceLoader();
  const cart = load('lib/cart/store.ts');
  cart.addItemToCart('customer-a', 'Boseong Green Tea');
  assert.equal(cart.getCartItems('customer-a').length, 0);
});

test('verified My Account purchases and entitlements survive an unexpected cart cleanup exception', async () => {
  const effects = [];
  const states = [];
  let entitlementRequests = 0;
  const purchase = {
    id: 'purchase-42', product_slug: 'boseong-green-tea', lemon_order_id: 'order-42',
    status: 'paid', test_mode: false, total_cents: 2900, currency: 'USD'
  };
  const session = { user: { id: 'customer-a', email: 'fixture@example.invalid' }, access_token: 'fixture-token' };
  const load = createSourceLoader({
    globals: {
      window: {
        location: { search: '' },
        setInterval: () => 1,
        clearInterval() {},
        addEventListener() {},
        removeEventListener() {}
      },
      fetch: async (url) => {
        if (url === '/api/account/purchases') {
          return { ok: true, json: async () => ({ purchases: [purchase] }) };
        }
        entitlementRequests += 1;
        return { ok: true, json: async () => url.endsWith('/licenses') ? { licenses: [] } : { groups: [] } };
      }
    },
    mocks: {
      'react': {
        useEffect: (callback) => effects.push(callback),
        useMemo: (callback) => callback(),
        useRef: (value) => ({ current: value }),
        useState: (value) => {
          const state = { value };
          states.push(state);
          return [value, (next) => { state.value = typeof next === 'function' ? next(state.value) : next; }];
        }
      },
      'next/navigation': { useRouter: () => ({ replace() {} }) },
      'next/link': {},
      '@/components/auth/AuthPageHeader': {},
      '@/components/account/MyProductsAccordion': {},
      '@/lib/analytics/purchaseRecovery.client': { recoverPurchaseAnalytics: async () => [] },
      '@/lib/cart/store': {
        removePurchasedCartItems: () => { throw new Error('Synthetic unexpected cleanup error'); }
      },
      '@/lib/supabase/client': {
        createBrowserSupabaseClient: () => ({
          from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null }) }),
          auth: {
            getSession: async () => ({ data: { session } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
          }
        })
      }
    }
  });
  load('app/mypage/page.tsx').default();
  effects.forEach((callback) => callback());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(states.some((state) => Array.isArray(state.value) && state.value[0]?.id === purchase.id), true);
  assert.equal(states.some((state) => state.value === 'Failed to load Lemon Squeezy purchases.'), false);
  assert.equal(entitlementRequests, 2);
});
