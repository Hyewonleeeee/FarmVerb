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
