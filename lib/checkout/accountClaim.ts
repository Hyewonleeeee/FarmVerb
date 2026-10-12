import { createHash, randomBytes } from 'node:crypto';

export const ACCOUNT_CLAIM_CUSTOM_DATA_KEY = 'farmverb_account_claim';
// A checkout can stay open while a customer retrieves payment details. The
// signed order's creation time, not webhook delivery time, bounds this claim.
export const ACCOUNT_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
export const ACCOUNT_CLAIM_CLOCK_SKEW_MS = 5_000;

const ACCOUNT_CLAIM_TOKEN_BYTES = 32;
const ACCOUNT_CLAIM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type AccountClaimRecord = {
  token_hash: string;
  user_id: string;
  lemon_variant_id: string;
  expires_at: string;
  created_at?: string;
  consumed_at: string | null;
  consumed_order_id: string | null;
};

type ConsumeAvailableClaimInput = {
  tokenHash: string;
  orderId: string;
  variantId: string;
  consumedAt: string;
  occurredAt: string;
  createdBefore: string;
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
    occurredAt?: string;
  },
  repository: AccountClaimRepository
): Promise<ConsumeAccountClaimResult> {
  if (!isAccountClaimToken(input.token)) {
    return { status: 'invalid' };
  }

  return consumeAccountClaimHash({
    ...input,
    tokenHash: hashAccountClaimToken(input.token)
  }, repository);
}

// This entry point is used only by the server's verified-event inbox/recovery
// worker. Browser requests must never be allowed to supply a trusted hash.
export async function consumeAccountClaimHash(
  input: { tokenHash: string; orderId: string; variantId: string; now?: Date; occurredAt?: string },
  repository: AccountClaimRepository
): Promise<ConsumeAccountClaimResult> {
  if (!/^[a-f0-9]{64}$/.test(input.tokenHash)) return { status: 'invalid' };
  const now = input.now ?? new Date();
  const consumedAt = now.toISOString();
  const occurredAt = input.occurredAt ?? consumedAt;
  if (!Number.isFinite(Date.parse(occurredAt)) || Date.parse(occurredAt) > now.getTime() + 60_000) {
    return { status: 'invalid' };
  }
  const tokenHash = input.tokenHash;
  const consumed = await repository.consumeAvailableClaim({
    tokenHash,
    orderId: input.orderId,
    variantId: input.variantId,
    consumedAt,
    occurredAt,
    createdBefore: new Date(Date.parse(occurredAt) + ACCOUNT_CLAIM_CLOCK_SKEW_MS).toISOString()
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

  if (existing.created_at && Date.parse(occurredAt) + ACCOUNT_CLAIM_CLOCK_SKEW_MS < Date.parse(existing.created_at)) {
    return { status: 'invalid' };
  }

  if (Date.parse(existing.expires_at) <= Date.parse(occurredAt)) {
    return { status: 'expired' };
  }

  return { status: 'invalid' };
}
