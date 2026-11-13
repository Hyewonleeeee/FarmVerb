import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../test/loadSourceModule.mjs';

const load = createSourceLoader();
const {
  CheckoutPriceError, getLemonPriceTaxMode, validateDisplayedCheckoutPrice,
  validateLemonCatalogPrice, buildVerifiedCheckoutPayload, validateLemonCheckoutPreview,
  getVerifiedCheckoutExpiry, CHECKOUT_PRICE_TTL_MS
} = load('lib/checkout/priceValidation.ts');

const now = Date.parse('2026-11-21T05:00:00Z');
const expected = {
  storeId: '123', productId: '456', variantId: '789', priceCents: 2500,
  currency: 'USD', checkoutHost: 'farmverb.lemonsqueezy.com', taxMode: 'exclusive'
};
const request = { email: 'synthetic@example.invalid', claimToken: 'synthetic-claim', expiresAt: new Date(now + CHECKOUT_PRICE_TTL_MS).toISOString() };
const resource = (type, id, attributes) => ({ data: { type, id, attributes } });

function catalog() {
  return {
    store: resource('stores', '123', { currency: 'USD' }),
    product: resource('products', '456', { store_id: 123, test_mode: false, status: 'published' }),
    variant: resource('variants', '789', {
      product_id: 456, test_mode: false, status: 'published', price: 2500,
      is_subscription: false, pay_what_you_want: false
    }),
    prices: { data: [{ type: 'prices', id: '1000', attributes: {
      variant_id: 789, category: 'one_time', scheme: 'standard', unit_price: 2500,
      usage_aggregation: null, unit_price_decimal: null, package_size: 1
    } }] }
  };
}

function checkout() {
  const attributes = buildVerifiedCheckoutPayload(expected, request).data.attributes;
  return resource('checkouts', 'synthetic-checkout', {
    ...attributes,
    store_id: 123, variant_id: 789, custom_price: null,
    checkout_data: { ...attributes.checkout_data, discount_code: '' },
    url: 'https://farmverb.lemonsqueezy.com/checkout/custom/synthetic-checkout',
    preview: {
      currency: 'USD', currency_rate: 1,
      subtotal: 2500, subtotal_usd: 2500,
      discount_total: 0, discount_total_usd: 0,
      tax: 500, tax_usd: 500, total: 3000, total_usd: 3000
    }
  });
}

function rejects(operation, code = 'PRICE_CHECK_UNAVAILABLE', reason) {
  assert.throws(operation, (error) => error instanceof CheckoutPriceError && error.code === code
    && (!reason || error.reason === reason));
}

test('Live published standard one-time catalogue price is accepted', () => {
  validateLemonCatalogPrice(catalog(), expected);
});

test('pending default variant requires a verified single-variant published product', () => {
  const input = catalog();
  input.variant.data.attributes.status = 'pending';
  rejects(() => validateLemonCatalogPrice(input, expected));
  input.productVariants = { data: [input.variant.data], meta: { page: { total: 1 } } };
  validateLemonCatalogPrice(input, expected);
  input.productVariants.meta.page.total = 2;
  rejects(() => validateLemonCatalogPrice(input, expected));
  input.productVariants.meta.page.total = 1;
  input.productVariants.data = [{ ...input.variant.data, id: 'another-variant' }];
  rejects(() => validateLemonCatalogPrice(input, expected));
});

test('Test mode, wrong identities, unpublished products and unsupported prices are rejected', () => {
  for (const mutate of [
    input => { input.store.data.attributes.currency = 'EUR'; },
    input => { input.product.data.attributes.test_mode = true; },
    input => { input.product.data.attributes.status = 'draft'; },
    input => { input.product.data.attributes.store_id = 999; },
    input => { input.variant.data.attributes.product_id = 999; },
    input => { input.variant.data.attributes.test_mode = true; },
    input => { input.variant.data.attributes.status = 'draft'; },
    input => { input.variant.data.attributes.is_subscription = true; },
    input => { input.variant.data.attributes.pay_what_you_want = true; },
    input => { input.prices.data[0].attributes.category = 'subscription'; },
    input => { input.prices.data[0].attributes.scheme = 'graduated'; },
    input => { input.prices.data[0].attributes.package_size = 2; },
    input => { input.prices.data[0].attributes.variant_id = 999; },
    input => { delete input.prices.data[0].attributes.unit_price; }
  ]) {
    const input = catalog();
    mutate(input);
    rejects(() => validateLemonCatalogPrice(input, expected));
  }
});

test('latest price wins even when an older price would match the advertised price', () => {
  const input = catalog();
  input.prices.data.unshift({ type: 'prices', id: '1001', attributes: {
    ...input.prices.data[0].attributes, unit_price: 3900
  } });
  rejects(() => validateLemonCatalogPrice(input, expected), 'PRICE_CHANGED');
});

test('stale or manipulated browser price and missing phase never set the server price', () => {
  validateDisplayedCheckoutPrice({ expectedPriceCents: 2500, expectedPhase: 'active' }, { priceCents: 2500, phase: 'active' });
  for (const input of [{}, { expectedPriceCents: 1, expectedPhase: 'active' }, { expectedPriceCents: 2500, expectedPhase: 'before' }]) {
    rejects(() => validateDisplayedCheckoutPrice(input, { priceCents: 2500, phase: 'active' }), 'PRICE_CHANGED');
  }
});

test('checkout request carries the original account claim without custom prices or coupons', () => {
  const payload = buildVerifiedCheckoutPayload(expected, request);
  const attributes = payload.data.attributes;
  assert.equal(attributes.preview, true);
  assert.equal(attributes.test_mode, false);
  assert.equal(attributes.checkout_options.discount, false);
  assert.equal(attributes.checkout_data.custom.farmverb_account_claim, request.claimToken);
  assert.equal(attributes.checkout_data.email, request.email);
  assert.deepEqual(JSON.parse(JSON.stringify(attributes.checkout_data.variant_quantities)), [{ variant_id: 789, quantity: 1 }]);
  assert.deepEqual(Array.from(attributes.product_options.enabled_variants), [789]);
  assert.equal(payload.data.relationships.variant.data.id, '789');
  assert.equal(payload.data.relationships.store.data.id, '123');
  assert(!JSON.stringify(payload).includes('custom_price'));
  assert(!JSON.stringify(payload).includes('discount_code'));
});

test('exclusive preview verifies all USD amounts and never compares tax-inclusive total to base price', () => {
  const result = validateLemonCheckoutPreview(checkout(), expected, { ...request, nowMs: now });
  assert.equal(result.verifiedPriceCents, 2500);
  assert.equal(result.currency, 'USD');
  assert.equal(result.checkoutUrl, 'https://farmverb.lemonsqueezy.com/checkout/custom/synthetic-checkout');
});

test('inclusive mode fixes the total and accepts documented gross or net subtotal representations', () => {
  for (const subtotal of [2500, 2000]) {
    const input = checkout();
    Object.assign(input.data.attributes.preview, { subtotal, subtotal_usd: subtotal, total: 2500, total_usd: 2500 });
    validateLemonCheckoutPreview(input, { ...expected, taxMode: 'inclusive' }, { ...request, nowMs: now });
  }
  rejects(() => validateLemonCheckoutPreview(checkout(), { ...expected, taxMode: 'inclusive' }, { ...request, nowMs: now }), 'PRICE_CHANGED');
  assert.equal(getLemonPriceTaxMode('inclusive'), 'inclusive');
  assert.equal(getLemonPriceTaxMode('exclusive'), 'exclusive');
  rejects(() => getLemonPriceTaxMode(undefined));
});

test('missing previews, discounts, wrong quantity, mode, currency or claim fail closed', () => {
  for (const mutate of [
    attrs => { delete attrs.preview; },
    attrs => { attrs.preview.currency = 'EUR'; },
    attrs => { attrs.preview.currency_rate = 0.9; },
    attrs => { attrs.preview.discount_total = attrs.preview.discount_total_usd = 100; },
    attrs => { delete attrs.preview.tax; },
    attrs => { attrs.preview.total_usd = 2999; },
    attrs => { attrs.preview.total = attrs.preview.total_usd = 3001; },
    attrs => { attrs.test_mode = true; },
    attrs => { attrs.custom_price = 2500; },
    attrs => { attrs.variant_id = 999; },
    attrs => { attrs.checkout_options.discount = true; },
    attrs => { attrs.checkout_data.discount_code = 'unexpected'; },
    attrs => { attrs.checkout_data.variant_quantities[0].quantity = 2; },
    attrs => { attrs.checkout_data.variant_quantities = []; },
    attrs => { attrs.checkout_data.custom = []; },
    attrs => { attrs.checkout_data.custom.farmverb_account_claim = 'wrong-claim'; },
    attrs => { attrs.product_options.enabled_variants.push(999); },
    attrs => { attrs.url = 'https://farmverb.lemonsqueezy.com/checkout/buy/unverified'; },
    attrs => { attrs.url = 'https://unexpected.example/checkout/custom/id'; },
    attrs => { attrs.url = 'https://farmverb.lemonsqueezy.com/checkout/custom/different-checkout'; },
    attrs => { attrs.url += '?quantity=5'; },
    attrs => { attrs.url += '?checkout[discount_code]=unexpected'; },
    attrs => { attrs.url += '?checkout[custom][farmverb_account_claim]=different'; },
    attrs => { attrs.expires_at = new Date(now + CHECKOUT_PRICE_TTL_MS + 1000).toISOString(); }
  ]) {
    const input = checkout();
    mutate(input.data.attributes);
    rejects(() => validateLemonCheckoutPreview(input, expected, { ...request, nowMs: now }));
  }
});

test('verified checkout URL accepts only signed-expiry parameters for that same resource', () => {
  const input = checkout();
  input.data.attributes.url += '?expires=1795237800&signature=synthetic-signature';
  const verified = validateLemonCheckoutPreview(input, expected, { ...request, nowMs: now });
  assert.match(verified.checkoutUrl, /signature=synthetic-signature/);
  input.data.attributes.url += '&signature=another-signature';
  rejects(() => validateLemonCheckoutPreview(input, expected, { ...request, nowMs: now }));
});

test('checkout base-price mismatch fails before returning its URL', () => {
  const input = checkout();
  input.data.attributes.preview.subtotal = input.data.attributes.preview.subtotal_usd = 3900;
  rejects(() => validateLemonCheckoutPreview(input, expected, { ...request, nowMs: now }), 'PRICE_CHANGED');
});

test('checkout lifetime is capped by the next boundary and refuses an imminent boundary', () => {
  assert.equal(getVerifiedCheckoutExpiry(now, null), new Date(now + CHECKOUT_PRICE_TTL_MS).toISOString());
  assert.equal(getVerifiedCheckoutExpiry(now, now + 120_000), new Date(now + 120_000).toISOString());
  rejects(() => getVerifiedCheckoutExpiry(now, now + 29_000), 'PRICE_CHANGED');
  rejects(() => validateLemonCheckoutPreview(checkout(), expected, { ...request, nowMs: now + CHECKOUT_PRICE_TTL_MS - 20_000 }));
});

function adapterFixture(options = {}) {
  const calls = [];
  const input = catalog();
  if (options.pending) input.variant.data.attributes.status = 'pending';
  class Clock extends Date { static now() { return now; } }
  const loadAdapter = createSourceLoader({
    globals: {
      Date: Clock,
      AbortController,
      process: { env: { LEMON_API_KEY: 'synthetic-api-key', LEMON_STORE_ID: '123', LEMON_PRICE_TAX_MODE: 'exclusive', ...options.env } },
      fetch: async (url, init) => {
        const target = new URL(url);
        assert.equal(target.origin, 'https://api.lemonsqueezy.com');
        calls.push({ path: target.pathname, method: init.method, body: init.body ? JSON.parse(init.body) : null });
        if (options.abort) throw Object.assign(new Error('synthetic timeout'), { name: 'AbortError' });
        let payload;
        if (target.pathname === '/v1/stores/123') payload = input.store;
        else if (target.pathname === '/v1/products/456') payload = input.product;
        else if (target.pathname === '/v1/variants/789') payload = input.variant;
        else if (target.pathname === '/v1/prices') {
          assert.equal(target.searchParams.get('filter[variant_id]'), '789');
          assert.equal(target.searchParams.get('page[size]'), '1');
          payload = input.prices;
        } else if (target.pathname === '/v1/variants') {
          assert.equal(target.searchParams.get('filter[product_id]'), '456');
          payload = { data: [input.variant.data], meta: { page: { total: 1 } } };
        } else if (target.pathname === '/v1/checkouts') {
          assert.equal(init.method, 'POST');
          assert.equal(init.headers.Authorization, 'Bearer synthetic-api-key');
          payload = checkout();
          options.mutateCheckout?.(payload.data.attributes);
        } else {
          throw new Error('Unexpected mock API path');
        }
        return Response.json(payload);
      }
    },
    mocks: { 'server-only': {} }
  });
  return {
    calls,
    adapter: loadAdapter('lib/checkout/lemonCheckout.server.ts'),
    product: { lemonProductId: '456', lemonVariantId: '789', lemonCheckoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/synthetic' }
  };
}

test('server adapter performs exact merchant reads and authenticated checkout POST using mocked HTTP only', async () => {
  const { adapter, product, calls } = adapterFixture({ pending: true });
  const verified = await adapter.verifyLemonProductPrice(product, 2500);
  const result = await adapter.createVerifiedLemonCheckout(verified, request);
  assert.equal(result.verifiedPriceCents, 2500);
  assert.equal(calls.length, 6);
  const post = calls.find(call => call.method === 'POST');
  assert.equal(post.path, '/v1/checkouts');
  assert.equal(post.body.data.attributes.checkout_data.custom.farmverb_account_claim, request.claimToken);
  assert.equal(post.body.data.attributes.expires_at, request.expiresAt);
  assert(!JSON.stringify(post.body).includes('custom_price'));
  assert(!JSON.stringify(post.body).includes('discount_code'));
});

test('server adapter translates a mocked network timeout into a non-PII unavailable error', async () => {
  const { adapter, product, calls } = adapterFixture({ abort: true });
  await assert.rejects(adapter.verifyLemonProductPrice(product, 2500), error => (
    error.code === 'PRICE_CHECK_UNAVAILABLE' && error.reason === 'LEMON_API_504'
  ));
  assert.equal(calls.some(call => call.method === 'POST'), false);
});

test('server adapter requires explicit tax mode before touching the merchant API', async () => {
  const { adapter, product, calls } = adapterFixture({ env: { LEMON_PRICE_TAX_MODE: undefined } });
  await assert.rejects(adapter.verifyLemonProductPrice(product, 2500), error => (
    error.code === 'PRICE_CHECK_UNAVAILABLE' && error.reason === 'TAX_MODE_NOT_CONFIGURED'
  ));
  assert.equal(calls.length, 0);
});

test('server adapter withholds the created URL if Lemon returns an unexpected amount', async () => {
  const { adapter, product } = adapterFixture({ mutateCheckout: attrs => {
    attrs.preview.subtotal = attrs.preview.subtotal_usd = 3900;
  } });
  const verified = await adapter.verifyLemonProductPrice(product, 2500);
  await assert.rejects(adapter.createVerifiedLemonCheckout(verified, request), error => error.code === 'PRICE_CHANGED');
});
