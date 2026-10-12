import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOfficialProductForLivePurchase, OFFICIAL_LIVE_VARIANT_IDS } from '@/lib/products/catalog';
import {
  getPendingPurchaseConversions,
  PURCHASE_RECOVERY_MAX_AGE_MS,
  type CheckoutAnalyticsClaim,
  type RecoveryPurchase
} from '@/lib/analytics/purchaseRecovery';

export async function loadPendingPurchaseConversions(supabase: SupabaseClient, userId: string) {
  const now = Date.now();
  const { data: claims, error: claimError } = await supabase.from('purchase_account_claims')
    .select('id, user_id, lemon_variant_id, consumed_order_id, created_at, analytics_recovery_enabled, ga4_processed_at, google_ads_processed_at')
    .eq('user_id', userId)
    .eq('analytics_recovery_enabled', true)
    .not('consumed_order_id', 'is', null)
    .gte('created_at', new Date(now - PURCHASE_RECOVERY_MAX_AGE_MS).toISOString())
    .or('ga4_processed_at.is.null,google_ads_processed_at.is.null')
    .order('created_at', { ascending: false })
    .limit(100);
  if (claimError) throw new Error('Could not load pending checkout analytics.');
  if (!claims?.length) return [];

  const { data: purchases, error: purchaseError } = await supabase.from('purchases')
    .select('user_id, lemon_order_id, lemon_variant_id, total_cents, currency, test_mode, status')
    .eq('user_id', userId)
    .eq('test_mode', false)
    .eq('status', 'paid')
    .in('lemon_variant_id', [...OFFICIAL_LIVE_VARIANT_IDS])
    .in('lemon_order_id', claims.map((claim) => claim.consumed_order_id));
  if (purchaseError) throw new Error('Could not verify checkout analytics orders.');
  const officialPurchases: RecoveryPurchase[] = (purchases ?? []).flatMap((purchase) => {
    const product = getOfficialProductForLivePurchase(purchase);
    return product ? [{ ...purchase, product_slug: product.slug }] : [];
  });
  return getPendingPurchaseConversions(userId, claims as CheckoutAnalyticsClaim[], officialPurchases, now);
}
