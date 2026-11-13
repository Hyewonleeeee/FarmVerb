import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../../../../lib/test/loadSourceModule.mjs';

const activeTime = Date.parse('2026-11-21T05:00:00Z');
const endTime = Date.parse('2026-12-02T05:00:00Z');

function fixture(options = {}) {
  let now = options.now ?? activeTime;
  let priceError;
  const calls = { auth: 0, verify: [], claims: [], checkouts: [], logs: [] };
  class Clock extends Date { static now() { return now; } }
  const load = createSourceLoader({
    globals: {
      Date: Clock,
      process: { env: { VERCEL_ENV: 'production', BLACK_FRIDAY_2026_ENABLED: 'true', ...options.env } },
      console: { warn: (...args) => calls.logs.push(args), error: (...args) => calls.logs.push(args) }
    },
    mocks: {
      'next/server': { NextResponse: { json: (body, init = {}) => Response.json(body, init) } },
      '@/lib/supabase/server': { createServerSupabaseClient: () => ({ auth: { getUser: async () => {
        calls.auth += 1;
        return options.unauthorized ? { data: { user: null }, error: {} }
          : { data: { user: { id: 'synthetic-user', email: 'synthetic@example.invalid' } }, error: null };
      } } }) },
      '@/lib/checkout/accountClaim.server': {
        AccountClaimStorageError: class AccountClaimStorageError extends Error {},
        createPurchaseAccountClaim: async (_client, input) => {
          calls.claims.push(input);
          if (options.afterClaimTime) now = options.afterClaimTime;
          return { claimId: 'synthetic-claim-id', token: 'synthetic-claim-token', expiresAt: new Date(now + 86_400_000).toISOString() };
        }
      },
      '@/lib/checkout/lemonCheckout.server': {
        verifyLemonProductPrice: async (product, priceCents) => {
          calls.verify.push({ product, priceCents });
          if (options.verifyError) throw new priceError(...options.verifyError);
          if (options.afterVerifyTime) now = options.afterVerifyTime;
          return { priceCents, currency: 'USD', variantId: product.lemonVariantId };
        },
        createVerifiedLemonCheckout: async (expected, input) => {
          calls.checkouts.push({ expected, input });
          if (options.checkoutError) throw new priceError(...options.checkoutError);
          if (options.afterCheckoutTime) now = options.afterCheckoutTime;
          return {
            checkoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/custom/synthetic',
            expiresAt: input.expiresAt, verifiedPriceCents: expected.priceCents, currency: 'USD'
          };
        }
      }
    }
  });
  priceError = load('lib/checkout/priceValidation.ts').CheckoutPriceError;
  const { POST } = load('app/api/checkout/session/route.ts');
  return {
    calls,
    async post(body = { productName: 'Nebula Drift', expectedPriceCents: 2500, expectedPhase: 'active' }) {
      const response = await POST(new Request('https://local.example/api/checkout/session', {
        method: 'POST', headers: { authorization: 'Bearer synthetic-session', 'content-type': 'application/json' },
        body: JSON.stringify(body)
      }));
      return { response, payload: await response.json() };
    }
  };
}

test('enabled Live checkout verifies price before claim, preserves claim and returns verified amount', async () => {
  const { calls, post } = fixture();
  const { response, payload } = await post();
  assert.equal(response.status, 200);
  assert.equal(payload.verifiedPriceCents, 2500);
  assert.equal(payload.currency, 'USD');
  assert.equal(payload.phase, 'active');
  assert.equal(payload.claimId, 'synthetic-claim-id');
  assert.equal(calls.verify[0].product.lemonVariantId, '2147829');
  assert.equal(calls.checkouts[0].input.claimToken, 'synthetic-claim-token');
  assert.equal(calls.checkouts[0].input.email, 'synthetic@example.invalid');
  assert.equal(Date.parse(payload.expiresAt), activeTime + 600_000);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('flag off preserves the legacy permanent URL and does not contact Lemon', async () => {
  const { calls, post } = fixture({ env: { BLACK_FRIDAY_2026_ENABLED: 'false' } });
  const { response, payload } = await post({ productName: 'Nebula Drift' });
  assert.equal(response.status, 200);
  assert.match(payload.checkoutUrl, /\/checkout\/buy\/5a68911c-c0ba-4bf6-807d-dd78a31520b1/);
  const url = new URL(payload.checkoutUrl);
  assert.equal(url.searchParams.get('checkout[custom][farmverb_account_claim]'), 'synthetic-claim-token');
  assert.equal(url.searchParams.get('checkout[email]'), 'synthetic@example.invalid');
  assert.equal(calls.verify.length, 0);
  assert.equal(calls.checkouts.length, 0);
  assert.equal(calls.claims.length, 1);
  assert.equal(payload.verifiedPriceCents, undefined);
});

test('preview blocks before auth, claim or Lemon even with the Live flag enabled', async () => {
  const { calls, post } = fixture({ env: { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/black-friday-2026' } });
  const { response } = await post();
  assert.equal(response.status, 403);
  assert.equal(calls.auth, 0);
  assert.equal(calls.verify.length + calls.claims.length + calls.checkouts.length, 0);
});

test('unknown product and unauthenticated account cannot reach pricing or claims', async () => {
  const unknown = fixture();
  assert.equal((await unknown.post({ productName: 'unknown' })).response.status, 400);
  assert.equal(unknown.calls.auth, 0);
  const unauthenticated = fixture({ unauthorized: true });
  assert.equal((await unauthenticated.post()).response.status, 401);
  assert.equal(unauthenticated.calls.verify.length + unauthenticated.calls.claims.length, 0);
});

test('missing, stale or manipulated display price fails before merchant or claim access', async () => {
  for (const body of [
    { productName: 'Nebula Drift' },
    { productName: 'Nebula Drift', expectedPriceCents: 1, expectedPhase: 'active' },
    { productName: 'Nebula Drift', expectedPriceCents: 4900, expectedPhase: 'before' }
  ]) {
    const { calls, post } = fixture();
    const { response, payload } = await post(body);
    assert.equal(response.status, 409);
    assert.equal(payload.code, 'PRICE_CHANGED');
    assert.equal(calls.verify.length + calls.claims.length + calls.checkouts.length, 0);
  }
});

test('Lemon price mismatch and timeout fail closed without creating a claim or returning a fallback URL', async () => {
  for (const [code, reason] of [['PRICE_CHANGED', 'VARIANT_PRICE_CHANGED'], ['PRICE_CHECK_UNAVAILABLE', 'LEMON_API_504']]) {
    const { calls, post } = fixture({ verifyError: [code, reason] });
    const { response, payload } = await post();
    assert.equal(response.status, code === 'PRICE_CHANGED' ? 409 : 503);
    assert.equal(payload.code, code);
    assert.equal(payload.checkoutUrl, undefined);
    assert.equal(calls.claims.length + calls.checkouts.length, 0);
    assert(!JSON.stringify(calls.logs).includes('synthetic@example.invalid'));
  }
});

test('created-checkout verification failure never falls back to the permanent URL', async () => {
  const { calls, post } = fixture({ checkoutError: ['PRICE_CHECK_UNAVAILABLE', 'CHECKOUT_QUANTITY_MISMATCH'] });
  const { response, payload } = await post();
  assert.equal(response.status, 503);
  assert.equal(payload.code, 'PRICE_CHECK_UNAVAILABLE');
  assert.equal(payload.checkoutUrl, undefined);
  assert.equal(calls.claims.length, 1);
  assert.equal(calls.checkouts.length, 1);
});

test('campaign transitions during verification, claim creation and checkout creation reject the result', async () => {
  for (const [stage, claims, checkouts] of [
    ['afterVerifyTime', 0, 0], ['afterClaimTime', 1, 0], ['afterCheckoutTime', 1, 1]
  ]) {
    const { calls, post } = fixture({ [stage]: endTime });
    const { response, payload } = await post();
    assert.equal(response.status, 409);
    assert.equal(payload.code, 'PRICE_CHANGED');
    assert.equal(payload.checkoutUrl, undefined);
    assert.equal(calls.claims.length, claims);
    assert.equal(calls.checkouts.length, checkouts);
  }
});

test('after the campaign the approved new regular price is verified, never the old launch price', async () => {
  const { calls, post } = fixture({ now: endTime });
  const { response, payload } = await post({ productName: 'Nebula Drift', expectedPriceCents: 3900, expectedPhase: 'after' });
  assert.equal(response.status, 200);
  assert.equal(calls.verify[0].priceCents, 3900);
  assert.equal(payload.phase, 'after');
  assert.equal(payload.verifiedPriceCents, 3900);
});

test('before the start uses the approved pre-sale price and rejects crossing into the sale during verification', async () => {
  const startTime = Date.parse('2026-11-20T05:00:00Z');
  const body = { productName: 'Nebula Drift', expectedPriceCents: 4900, expectedPhase: 'before' };
  const accepted = fixture({ now: startTime - 120_000 });
  const result = await accepted.post(body);
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.verifiedPriceCents, 4900);
  assert.equal(Date.parse(result.payload.expiresAt), startTime);
  const crossed = fixture({ now: startTime - 120_000, afterVerifyTime: startTime });
  const rejected = await crossed.post(body);
  assert.equal(rejected.response.status, 409);
  assert.equal(rejected.payload.code, 'PRICE_CHANGED');
  assert.equal(crossed.calls.claims.length, 0);
});

test('last active checkout expires at the phase boundary and imminent boundary creates no claim', async () => {
  const accepted = fixture({ now: endTime - 120_000 });
  const response = await accepted.post();
  assert.equal(response.response.status, 200);
  assert.equal(Date.parse(response.payload.expiresAt), endTime);
  const rejected = fixture({ now: endTime - 20_000 });
  assert.equal((await rejected.post()).response.status, 409);
  assert.equal(rejected.calls.claims.length, 0);
});
