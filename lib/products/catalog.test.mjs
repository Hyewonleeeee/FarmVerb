import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getOfficialProductByLiveVariantId,
  getOfficialProductByName,
  getOfficialProductBySlug,
  getOfficialProductForLivePurchase,
  OFFICIAL_LIVE_VARIANT_IDS,
  OFFICIAL_PRODUCT_CATALOG
} from './catalog.ts';

const expectedProducts = [
  ['Boseong Green Tea', '1374767', '2147845'],
  ['Glitch Drum Pack Vol. I', '1374752', '2147826'],
  ['Jeju Citrus Air', '1374753', '2147827'],
  ['Nebula Crush', '1374754', '2147828'],
  ['Nebula Drift', '1374755', '2147829'],
  ['Nebula Drums', '1374756', '2147830'],
  ['Nebula Rift', '1374757', '2147831'],
  ['Nebula Series Bundle', '1374758', '2147832'],
  ['Nebula Space', '1374760', '2147834'],
  ['Organic Series Bundle', '1374761', '2147835'],
  ['Uiseong Garlic', '1374762', '2147836']
];

test('the official Live catalog contains exactly the eleven approved products', () => {
  assert.equal(OFFICIAL_PRODUCT_CATALOG.length, 11);
  assert.deepEqual(
    OFFICIAL_PRODUCT_CATALOG.map((product) => [
      product.name,
      product.lemonProductId,
      product.lemonVariantId
    ]),
    expectedProducts
  );
  assert.equal(new Set(OFFICIAL_LIVE_VARIANT_IDS).size, 11);
  assert.equal(new Set(OFFICIAL_PRODUCT_CATALOG.map((product) => product.lemonCheckoutUrl)).size, 11);
  for (const product of OFFICIAL_PRODUCT_CATALOG) {
    assert.match(
      product.lemonCheckoutUrl,
      /^https:\/\/farmverb\.lemonsqueezy\.com\/checkout\/buy\/[a-f0-9-]+$/
    );
  }
});

test('Live purchases resolve only by an official Live variant ID', () => {
  for (const product of OFFICIAL_PRODUCT_CATALOG) {
    assert.equal(getOfficialProductByLiveVariantId(product.lemonVariantId)?.slug, product.slug);
    assert.equal(
      getOfficialProductForLivePurchase({
        lemon_variant_id: product.lemonVariantId,
        test_mode: false
      })?.slug,
      product.slug
    );
  }

  assert.equal(
    getOfficialProductForLivePurchase({ lemon_variant_id: '2147845', test_mode: true }),
    null
  );
  assert.equal(getOfficialProductByLiveVariantId('2090544'), null);
  assert.equal(getOfficialProductByLiveVariantId('2090266'), null);
  assert.equal(getOfficialProductByLiveVariantId('2090274'), null);
  assert.equal(getOfficialProductByLiveVariantId('2090280'), null);
});

test('discarded or unknown products are not part of the official catalog', () => {
  assert.equal(getOfficialProductByName('Germinate'), null);
  assert.equal(getOfficialProductBySlug('germinate'), null);
  assert.equal(getOfficialProductByLiveVariantId('999999999'), null);
});
