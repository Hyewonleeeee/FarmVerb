import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../test/loadSourceModule.mjs';

const load = createSourceLoader();
const {
  BLACK_FRIDAY_2026,
  BLACK_FRIDAY_2026_PRICES,
  getBlackFriday2026FeaturedOffers,
  getBlackFriday2026PriceByProductName,
  getBlackFriday2026PriceBySlug,
  isBlackFriday2026PreviewEnvironment,
  parseBlackFridayPreviewVariant
} = load('lib/campaigns/blackFriday2026.ts');

test('campaign pricing is centralized on exactly the five reviewed product slugs', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(BLACK_FRIDAY_2026_PRICES)), {
    'nebula-space': 29,
    'uiseong-garlic': 15,
    'glitch-drum-pack-vol-1': 23,
    'nebula-series': 99,
    'organic-series': 35
  });
  assert.equal(getBlackFriday2026FeaturedOffers().length, 5);
  assert.equal(getBlackFriday2026PriceByProductName('Glitch Drum Pack Vol. I'), 23);
  assert.equal(getBlackFriday2026PriceByProductName('Nebula Crush'), null);
  assert.equal(getBlackFriday2026PriceBySlug('unknown-product'), null);
});

test('campaign dates and A/B variants remain explicit review data', () => {
  assert.equal(BLACK_FRIDAY_2026.startsOn, '2026-11-20');
  assert.equal(BLACK_FRIDAY_2026.endsOn, '2026-12-01');
  assert.equal(parseBlackFridayPreviewVariant('editorial'), 'editorial');
  assert.equal(parseBlackFridayPreviewVariant('product'), 'product');
  assert.equal(parseBlackFridayPreviewVariant('other'), null);
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
