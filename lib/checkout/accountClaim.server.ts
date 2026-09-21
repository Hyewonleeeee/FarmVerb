import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNT_CLAIM_TTL_MS,
  consumeAccountClaim,
  createAccountClaimToken,
  hashAccountClaimToken,
  type AccountClaimRecord
} from '@/lib/checkout/accountClaim';
import type { OfficialProduct } from '@/lib/products/catalog';

const CLAIM_SELECT =
  'token_hash, user_id, lemon_variant_id, expires_at, consumed_at, consumed_order_id';

export class AccountClaimStorageError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'AccountClaimStorageError';
    this.code = code;
  }
}

export async function createPurchaseAccountClaim(
  supabase: SupabaseClient,
  input: { userId: string; product: OfficialProduct; now?: Date }
) {
  const now = input.now ?? new Date();
  const token = createAccountClaimToken();
  const expiresAt = new Date(now.getTime() + ACCOUNT_CLAIM_TTL_MS).toISOString();
  const { error } = await supabase.from('purchase_account_claims').insert({
    token_hash: hashAccountClaimToken(token),
    user_id: input.userId,
    product_slug: input.product.slug,
    lemon_variant_id: input.product.lemonVariantId,
    expires_at: expiresAt
  });

  if (error) {
    throw new AccountClaimStorageError('Could not create a secure checkout claim.', error.code);
  }

  return { token, expiresAt };
}

export async function consumePurchaseAccountClaim(
  supabase: SupabaseClient,
  input: { token: string; orderId: string; variantId: string; now?: Date }
) {
  return consumeAccountClaim(input, {
    consumeAvailableClaim: async ({ tokenHash, orderId, variantId, consumedAt }) => {
      const { data, error } = await supabase
        .from('purchase_account_claims')
        .update({ consumed_at: consumedAt, consumed_order_id: orderId })
        .eq('token_hash', tokenHash)
        .eq('lemon_variant_id', variantId)
        .is('consumed_at', null)
        .gt('expires_at', consumedAt)
        .select(CLAIM_SELECT)
        .maybeSingle();

      if (error) {
        throw new AccountClaimStorageError('Could not consume the checkout claim.', error.code);
      }

      return data as AccountClaimRecord | null;
    },
    findClaimByHash: async (tokenHash) => {
      const { data, error } = await supabase
        .from('purchase_account_claims')
        .select(CLAIM_SELECT)
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (error) {
        throw new AccountClaimStorageError('Could not verify the checkout claim.', error.code);
      }

      return data as AccountClaimRecord | null;
    }
  });
}
