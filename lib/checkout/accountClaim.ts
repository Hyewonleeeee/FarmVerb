import { createHash, randomBytes } from 'node:crypto';

export const ACCOUNT_CLAIM_CUSTOM_DATA_KEY = 'farmverb_account_claim';
export const ACCOUNT_CLAIM_TTL_MS = 30 * 60 * 1000;

const ACCOUNT_CLAIM_TOKEN_BYTES = 32;
const ACCOUNT_CLAIM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type AccountClaimRecord = {
  token_hash: string;
  user_id: string;
  lemon_variant_id: string;
  expires_at: string;
  consumed_at: string | null;
  consumed_order_id: string | null;
};

type ConsumeAvailableClaimInput = {
  tokenHash: string;
  orderId: string;
  variantId: string;
  consumedAt: string;
};

export type AccountClaimRepository = {
  consumeAvailableClaim: (
    input: ConsumeAvailableClaimInput
  ) => Promise<AccountClaimRecord | null>;
  findClaimByHash: (tokenHash: string) => Promise<AccountClaimRecord | null>;
};

export type ConsumeAccountClaimResult =
  | { status: 'linked'; userId: string; duplicate: boolean }
  | { status: 'invalid' | 'expired' | 'reused' | 'variant_mismatch' };

export function createAccountClaimToken() {
  return randomBytes(ACCOUNT_CLAIM_TOKEN_BYTES).toString('base64url');
}

export function isAccountClaimToken(value: string) {
  return ACCOUNT_CLAIM_TOKEN_PATTERN.test(value);
}

export function hashAccountClaimToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function buildAccountClaimCheckoutUrl(
  checkoutUrl: string,
  email: string,
  token: string
) {
  const url = new URL(checkoutUrl);
  url.searchParams.set('checkout[email]', email);
  url.searchParams.set(`checkout[custom][${ACCOUNT_CLAIM_CUSTOM_DATA_KEY}]`, token);
  return url.toString();
}

export async function consumeAccountClaim(
  input: {
    token: string;
    orderId: string;
    variantId: string;
    now?: Date;
  },
  repository: AccountClaimRepository
): Promise<ConsumeAccountClaimResult> {
  if (!isAccountClaimToken(input.token)) {
    return { status: 'invalid' };
  }

  const now = input.now ?? new Date();
  const consumedAt = now.toISOString();
  const tokenHash = hashAccountClaimToken(input.token);
  const consumed = await repository.consumeAvailableClaim({
    tokenHash,
    orderId: input.orderId,
    variantId: input.variantId,
    consumedAt
  });

  if (consumed) {
    return { status: 'linked', userId: consumed.user_id, duplicate: false };
  }

  // A second lookup distinguishes a legitimate duplicate webhook from a stolen,
  // expired, or product-mismatched token without ever storing the raw token.
  const existing = await repository.findClaimByHash(tokenHash);
  if (!existing) {
    return { status: 'invalid' };
  }

  if (existing.lemon_variant_id !== input.variantId) {
    return { status: 'variant_mismatch' };
  }

  if (existing.consumed_order_id === input.orderId) {
    return { status: 'linked', userId: existing.user_id, duplicate: true };
  }

  if (existing.consumed_at || existing.consumed_order_id) {
    return { status: 'reused' };
  }

  if (Date.parse(existing.expires_at) <= now.getTime()) {
    return { status: 'expired' };
  }

  return { status: 'invalid' };
}
