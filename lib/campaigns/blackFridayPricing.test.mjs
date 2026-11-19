import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../test/loadSourceModule.mjs';

const load = createSourceLoader();
const { BLACK_FRIDAY_PRICE_TABLE, getCampaignPriceBySlug, getCampaignPriceByProductName, repriceCampaignCart } = load('lib/campaigns/blackFridayPricing.ts');
const { OFFICIAL_PRODUCT_CATALOG } = load('lib/products/catalog.ts');
const { getMainProductPrice, getProductPricing } = load('lib/pricing/products.ts');
const { getAnalyticsProductByName } = load('lib/analytics/products.ts');
const approved = {
  'nebula-crush': [39, 19, 29, 51], 'nebula-drift': [49, 25, 39, 48],
  'nebula-drums': [49, 25, 39, 48], 'nebula-rift': [59, 29, 49, 50],
  'nebula-space': [59, 29, 49, 50], 'nebula-series': [189, 89, 129, 52],
  'jeju-citrus-air': [29, 15, 25, 48], 'boseong-green-tea': [29, 15, 25, 48],
  'uiseong-garlic': [29, 15, 25, 48], 'organic-series': [69, 35, 59, 49],
  'glitch-drum-pack-vol-1': [49, 25, 39, 48]
};

test('approved eleven-product table covers every catalog item in all three phases', () => {
  assert.equal(Object.keys(BLACK_FRIDAY_PRICE_TABLE).length, 11);
  assert.equal(OFFICIAL_PRODUCT_CATALOG.length, 11);
  for (const product of OFFICIAL_PRODUCT_CATALOG) {
    const [before, active, after, percent] = approved[product.slug];
    assert.equal(getMainProductPrice(getProductPricing(product.pricingName)), before);
    for (const [phase, price] of Object.entries({ before, active, after })) {
      const offer = getCampaignPriceBySlug(product.slug, phase);
      assert.equal(offer.price, price);
      assert.equal(offer.priceCents, price * 100);
      assert.equal(offer.currency, 'USD');
      assert.equal(offer.compareAt, phase === 'active' ? before : null);
      assert.equal(offer.discountPercent, phase === 'active' ? percent : 0);
      for (const name of [product.name, ...product.aliases]) {
        assert.equal(getCampaignPriceByProductName(name, phase).price, price);
      }
    }
  }
});

test('cart prices, detail prices, and click analytics agree after every transition', () => {
  // Persisted prices are intentionally stale/corrupt. Never trust them as a
  // checkout amount or carry the sale price beyond the exclusive end.
  const stored = Object.freeze(OFFICIAL_PRODUCT_CATALOG.map(product => Object.freeze({
    slug: product.slug, name: product.name, price: 0.01, currency: 'EUR', quantity: 1
  })));
  for (const phase of ['before', 'active', 'after']) {
    const repriced = repriceCampaignCart(stored, phase);
    for (const item of repriced) {
      const detail = getCampaignPriceBySlug(item.slug, phase);
      const analytics = getAnalyticsProductByName(item.name, phase);
      assert.equal(item.price, detail.price);
      assert.equal(analytics.price, detail.price);
      assert.equal(item.currency, 'USD');
      assert.equal(item.quantity, 1);
    }
  }
  assert.ok(stored.every(item => item.price === 0.01 && item.currency === 'EUR'));
});

test('invalid products or phases never invent a fallback price', () => {
  assert.equal(getCampaignPriceBySlug('unmapped-product', 'after'), null);
  assert.equal(getCampaignPriceByProductName('unmapped-product', 'after'), null);
  assert.equal(getCampaignPriceBySlug('nebula-series', 'unknown'), null);
});

test('campaign-independent analytics retains the original catalog prices', () => {
  for (const product of OFFICIAL_PRODUCT_CATALOG) {
    assert.equal(getAnalyticsProductByName(product.name).price, approved[product.slug][0]);
  }
});

test('actual cart hides initial and stale prices until the campaign clock is ready', async () => {
  const campaign = { campaignEnabled: true, phase: 'before', clockReady: false };
  const stored = [
    { slug: 'nebula-series', name: 'Nebula Bundle', price: 189, currency: 'USD', quantity: 1 },
    { slug: 'boseong-green-tea', name: 'Boseong Green Tea', price: 29, currency: 'USD', quantity: 1 }
  ];
  const slots = [];
  const effects = [];
  let cursor = 0;
  const loader = createSourceLoader({
    globals: { window: { addEventListener() {}, removeEventListener() {}, location: { replace() { assert.fail('Unexpected login redirect'); } } } },
    mocks: {
      react: {
        useState: initial => {
          const index = cursor++;
          if (!(index in slots)) slots[index] = initial;
          return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
        },
        useMemo: calculate => calculate(),
        useEffect: (effect, dependencies) => {
          const index = cursor++;
          if (!(index in slots) || dependencies.some((value, key) => value !== slots[index][key])) {
            slots[index] = dependencies;
            effects.push(effect);
          }
        }
      },
      'next/link': { default: () => null },
      '@/components/auth/AuthPageHeader': { default: () => null },
      '@/components/checkout/LemonCheckoutLink': { default: () => null },
      '@/components/farmverb/PurchasePolicyNotice': { default: () => null },
      '@/components/campaigns/BlackFridayPreviewProvider': { useBlackFridayPreview: () => campaign },
      '@/lib/supabase/client': { createBrowserSupabaseClient: () => ({ auth: {
        getSession: async () => ({ data: { session: { user: { id: 'synthetic-cart-user' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
      } }) },
      '@/lib/cart/store': {
        getCartItems: () => stored,
        subscribeToCart: () => () => {},
        getCatalogProductByName: () => null,
        getCatalogProductBySlug: () => null,
        getCartItemCount: items => items.reduce((total, item) => total + item.quantity, 0),
        getCartSubtotal: items => items.reduce((total, item) => total + item.price * item.quantity, 0)
      }
    }
  });
  const CartPage = loader('app/cart/page.tsx').default;
  function render() {
    cursor = 0;
    const tree = CartPage();
    for (const effect of effects.splice(0)) effect();
    return tree;
  }
  function findByClass(node, className) {
    if (Array.isArray(node)) return node.flatMap(child => findByClass(child, className));
    if (!node?.props) return [];
    return [...(node.props.className?.split(' ').includes(className) ? [node] : []), ...findByClass(node.props.children, className)];
  }
  function assertPrices(expectedItems, expectedTotal) {
    const tree = render();
    assert.deepEqual(findByClass(tree, 'cart-page-item-price').map(node => node.props.children), expectedItems);
    const total = findByClass(tree, 'cart-page-total-row')[0];
    assert.ok(total, 'Order summary must be rendered');
    assert.equal(total.props.children.find(node => node.type === 'strong').props.children, expectedTotal);
  }

  render();
  await new Promise(resolve => setImmediate(resolve));
  render();
  assertPrices(['Checking price…', 'Checking price…'], 'Checking price…');
  Object.assign(campaign, { phase: 'active', clockReady: true });
  assertPrices(['$89', '$15'], '$104');
  campaign.clockReady = false;
  assertPrices(['Checking price…', 'Checking price…'], 'Checking price…');
  Object.assign(campaign, { phase: 'after', clockReady: true });
  assertPrices(['$129', '$25'], '$154');
  Object.assign(campaign, { campaignEnabled: false, clockReady: false });
  assertPrices(['$189', '$29'], '$218');
});
