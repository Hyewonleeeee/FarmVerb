import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCOUNT_CLAIM_CUSTOM_DATA_KEY,
  ACCOUNT_CLAIM_TTL_MS,
  buildAccountClaimCheckoutUrl,
  consumeAccountClaim,
  createAccountClaimToken,
  hashAccountClaimToken,
  isAccountClaimToken
} from './accountClaim.ts';

const now = new Date('2026-09-21T00:00:00.000Z');
const variantId = '2147845';
const userId = 'user-a';

function makeRepository(token, overrides = {}) {
  const record = {
    token_hash: hashAccountClaimToken(token),
    user_id: userId,
    lemon_variant_id: variantId,
    expires_at: '2026-09-21T00:30:00.000Z',
    created_at: '2026-09-21T00:00:00.000Z',
    consumed_at: null,
    consumed_order_id: null,
    ...overrides
  };

  return {
    record,
    repository: {
      consumeAvailableClaim: async ({ tokenHash, orderId, variantId: requestedVariant, consumedAt, occurredAt, createdBefore }) => {
        if (
          tokenHash !== record.token_hash
          || requestedVariant !== record.lemon_variant_id
          || record.consumed_at
          || Date.parse(record.expires_at) <= Date.parse(occurredAt)
          || Date.parse(record.created_at) > Date.parse(createdBefore)
        ) {
          return null;
        }

        record.consumed_at = consumedAt;
        record.consumed_order_id = orderId;
        return { ...record };
      },
      findClaimByHash: async (tokenHash) => (
        tokenHash === record.token_hash ? { ...record } : null
      )
    }
  };
}

test('claim tokens are high-entropy opaque values and only their hash is stored', () => {
  const token = createAccountClaimToken();
  const tokenHash = hashAccountClaimToken(token);

  assert.equal(isAccountClaimToken(token), true);
  assert.equal(token.length, 43);
  assert.match(tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(tokenHash, token);
});

test('a new checkout completed after 31 minutes still binds the initiating account', async () => {
  const token = createAccountClaimToken();
  const { repository } = makeRepository(token, { expires_at: new Date(now.getTime() + ACCOUNT_CLAIM_TTL_MS).toISOString() });
  const occurredAt = new Date(now.getTime() + 31 * 60_000).toISOString();
  assert.equal((await consumeAccountClaim({ token, orderId: 'late-checkout', variantId, occurredAt, now: new Date(occurredAt) }, repository)).status, 'linked');
});

test('late webhook delivery uses the signed purchase time, including legacy 30-minute claims', async () => {
  const token = createAccountClaimToken();
  const { repository } = makeRepository(token);
  assert.equal((await consumeAccountClaim({ token, orderId: 'late-delivery', variantId, occurredAt: '2026-09-21T00:10:00Z', now: new Date('2026-09-24T00:00:00Z') }, repository)).status, 'linked');
});

test('second-precision order time tolerates small clock skew but not a preexisting order', async () => {
  for (const [occurredAt, expected] of [['2026-09-20T23:59:59Z', 'linked'], ['2026-09-20T23:59:00Z', 'invalid']]) {
    const token = createAccountClaimToken();
    const { repository } = makeRepository(token, { created_at: '2026-09-21T00:00:00.950Z' });
    assert.equal((await consumeAccountClaim({ token, orderId: 'precision-order', variantId, occurredAt, now: new Date('2026-09-21T00:00:01Z') }, repository)).status, expected);
  }
});

test('an order actually placed after claim expiry cannot auto-link', async () => {
  const token = createAccountClaimToken();
  const { repository } = makeRepository(token);
  assert.equal((await consumeAccountClaim({ token, orderId: 'expired-order', variantId, occurredAt: '2026-09-21T00:31:00Z', now: new Date('2026-09-22T00:00:00Z') }, repository)).status, 'expired');
});

test('checkout URL prefills email and carries no raw Supabase user ID', () => {
  const token = createAccountClaimToken();
  const checkoutUrl = buildAccountClaimCheckoutUrl(
    'https://farmverb.lemonsqueezy.com/checkout/buy/example',
    'login@farmverb.com',
    token
  );
  const parsed = new URL(checkoutUrl);

  assert.equal(parsed.searchParams.get('checkout[email]'), 'login@farmverb.com');
  assert.equal(
    parsed.searchParams.get(`checkout[custom][${ACCOUNT_CLAIM_CUSTOM_DATA_KEY}]`),
    token
  );
  assert.equal(checkoutUrl.includes(userId), false);
});

test('a valid claim links the initiating account independently of checkout email', async () => {
  const token = createAccountClaimToken();
  const { repository } = makeRepository(token);

  const result = await consumeAccountClaim({
    token,
    orderId: 'order-1',
    variantId,
    now
  }, repository);

  assert.deepEqual(result, { status: 'linked', userId, duplicate: false });
});

test('a tampered or attacker-generated token cannot link an account', async () => {
  const token = createAccountClaimToken();
  const { repository } = makeRepository(token);

  assert.deepEqual(
    await consumeAccountClaim({
      token: `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`,
      orderId: 'order-1',
      variantId,
      now
    }, repository),
    { status: 'invalid' }
  );
  assert.deepEqual(
    await consumeAccountClaim({
      token: 'not-a-server-issued-token',
      orderId: 'order-1',
      variantId,
      now
    }, repository),
    { status: 'invalid' }
  );
});

test('the same claim cannot be reused for another order', async () => {
  const token = createAccountClaimToken();
  const { repository } = makeRepository(token);

  assert.equal((await consumeAccountClaim({
    token,
    orderId: 'order-1',
    variantId,
    now
  }, repository)).status, 'linked');
  assert.deepEqual(
    await consumeAccountClaim({
      token,
      orderId: 'order-2',
      variantId,
      now
    }, repository),
    { status: 'reused' }
  );
});

test('a duplicate webhook for the same order is idempotent', async () => {
  const token = createAccountClaimToken();
  const { repository } = makeRepository(token);

  await consumeAccountClaim({ token, orderId: 'order-1', variantId, now }, repository);
  assert.deepEqual(
    await consumeAccountClaim({ token, orderId: 'order-1', variantId, now }, repository),
    { status: 'linked', userId, duplicate: true }
  );

  assert.deepEqual(
    await consumeAccountClaim({
      token,
      orderId: 'order-1',
      variantId,
      now: new Date('2026-09-22T00:00:00.000Z')
    }, repository),
    { status: 'linked', userId, duplicate: true }
  );
});

test('expired and product-mismatched claims fail closed', async () => {
  const expiredToken = createAccountClaimToken();
  const expired = makeRepository(expiredToken, {
    expires_at: '2026-09-20T23:59:59.000Z'
  });
  assert.deepEqual(
    await consumeAccountClaim({
      token: expiredToken,
      orderId: 'order-1',
      variantId,
      now
    }, expired.repository),
    { status: 'expired' }
  );

  const mismatchedToken = createAccountClaimToken();
  const mismatched = makeRepository(mismatchedToken);
  assert.deepEqual(
    await consumeAccountClaim({
      token: mismatchedToken,
      orderId: 'order-1',
      variantId: '2147826',
      now
    }, mismatched.repository),
    { status: 'variant_mismatch' }
  );
});
