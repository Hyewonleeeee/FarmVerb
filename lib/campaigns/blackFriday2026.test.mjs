import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../test/loadSourceModule.mjs';

const load = createSourceLoader();
const {
  BLACK_FRIDAY_2026,
  BLACK_FRIDAY_2026_PRICES,
  getBlackFriday2026DiscountPercent,
  getBlackFriday2026FeaturedOffers,
  getBlackFriday2026PriceByProductName,
  getBlackFriday2026PriceBySlug,
  isBlackFriday2026PreviewEnvironment
} = load('lib/campaigns/blackFriday2026.ts');
const { OFFICIAL_PRODUCT_CATALOG } = load('lib/products/catalog.ts');
const { getProductPricing, getMainProductPrice } = load('lib/pricing/products.ts');

test('campaign pricing matches all eleven approved products and preserves the five featured offers', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(BLACK_FRIDAY_2026_PRICES)), {
    'nebula-crush': 19,
    'nebula-drift': 25,
    'nebula-drums': 25,
    'nebula-rift': 29,
    'nebula-space': 29,
    'nebula-series': 89,
    'jeju-citrus-air': 15,
    'boseong-green-tea': 15,
    'uiseong-garlic': 15,
    'organic-series': 35,
    'glitch-drum-pack-vol-1': 25
  });
  assert.deepEqual(Array.from(getBlackFriday2026FeaturedOffers(), ({ product }) => product.slug), [
    'nebula-series', 'organic-series', 'nebula-space', 'uiseong-garlic', 'glitch-drum-pack-vol-1'
  ]);
  assert.equal(getBlackFriday2026PriceBySlug('unknown-product'), null);
  assert.equal(getBlackFriday2026PriceByProductName('unknown-product'), null);
});

test('official product names and aliases resolve to the same preview price', () => {
  for (const product of OFFICIAL_PRODUCT_CATALOG) {
    for (const name of [product.name, ...product.aliases]) {
      assert.equal(getBlackFriday2026PriceByProductName(name), BLACK_FRIDAY_2026_PRICES[product.slug]);
    }
  }
  assert.equal(getBlackFriday2026PriceByProductName('  glitch drum pack vol.1  '), 25);
});

test('preview lookups preserve live current and regular prices', () => {
  const expectedPrices = {
    'nebula-crush': [39, 59],
    'nebula-drift': [49, 69],
    'nebula-drums': [49, 59],
    'nebula-rift': [59, 79],
    'nebula-space': [59, 79],
    'nebula-series': [189, 255],
    'jeju-citrus-air': [29, 39],
    'boseong-green-tea': [29, 39],
    'uiseong-garlic': [29, 39],
    'organic-series': [69, 89],
    'glitch-drum-pack-vol-1': [49, 99]
  };

  for (const product of OFFICIAL_PRODUCT_CATALOG) {
    getBlackFriday2026PriceBySlug(product.slug);
    getBlackFriday2026PriceByProductName(product.name);
    const pricing = getProductPricing(product.pricingName);
    assert.deepEqual([getMainProductPrice(pricing), pricing.regularPrice], expectedPrices[product.slug]);
  }
});

test('discounts use current live prices and round down without overstating the maximum', () => {
  const discounts = {};
  for (const product of OFFICIAL_PRODUCT_CATALOG) {
    const currentPrice = getMainProductPrice(getProductPricing(product.pricingName));
    discounts[product.slug] = getBlackFriday2026DiscountPercent(
      currentPrice, getBlackFriday2026PriceBySlug(product.slug)
    );
  }
  assert.deepEqual(discounts, {
    'boseong-green-tea': 48,
    'glitch-drum-pack-vol-1': 48,
    'jeju-citrus-air': 48,
    'nebula-crush': 51,
    'nebula-drift': 48,
    'nebula-drums': 48,
    'nebula-rift': 50,
    'nebula-series': 52,
    'nebula-space': 50,
    'organic-series': 49,
    'uiseong-garlic': 48
  });
  assert.equal(Math.max(...Object.values(discounts)), 52);
  assert.equal(getBlackFriday2026DiscountPercent(29, 29), 0);
  assert.equal(getBlackFriday2026DiscountPercent(29, 35), 0);
  assert.equal(getBlackFriday2026DiscountPercent(0, 15), 0);
  assert.equal(getBlackFriday2026DiscountPercent(29, -1), 0);
  assert.equal(getBlackFriday2026DiscountPercent(Number.NaN, 15), 0);
});

test('campaign dates remain explicit review data', () => {
  assert.equal(BLACK_FRIDAY_2026.startsOn, '2026-11-20');
  assert.equal(BLACK_FRIDAY_2026.endsOn, '2026-12-01');
});

test('preview can never activate in the Production Vercel environment', () => {
  assert.equal(isBlackFriday2026PreviewEnvironment({
    VERCEL_ENV: 'production',
    NEXT_PUBLIC_BLACK_FRIDAY_PREVIEW: 'true'
  }), false);
  assert.equal(isBlackFriday2026PreviewEnvironment({
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: BLACK_FRIDAY_2026.branch
  }), true);
  assert.equal(isBlackFriday2026PreviewEnvironment({
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'another-branch'
  }), false);
  assert.equal(isBlackFriday2026PreviewEnvironment({
    NEXT_PUBLIC_BLACK_FRIDAY_PREVIEW: 'true'
  }), true);
  assert.equal(isBlackFriday2026PreviewEnvironment({
    NODE_ENV: 'production',
    NEXT_PUBLIC_BLACK_FRIDAY_PREVIEW: 'true'
  }), false);
});
