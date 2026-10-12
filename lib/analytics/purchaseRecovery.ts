export const PURCHASE_RECOVERY_MAX_AGE_MS = 72 * 60 * 60 * 1000;
export type PurchaseAnalyticsChannel = 'ga4' | 'google_ads';

export type CheckoutAnalyticsClaim = {
  id: string;
  user_id: string;
  lemon_variant_id: string;
  consumed_order_id: string | null;
  created_at: string;
  analytics_recovery_enabled: boolean;
  ga4_processed_at: string | null;
  google_ads_processed_at: string | null;
};

export type RecoveryPurchase = {
  user_id: string | null;
  lemon_order_id: string;
  lemon_variant_id: string | null;
  product_slug: string | null;
  total_cents: number;
  currency: string;
  test_mode: boolean;
  status: string;
};

export type PendingPurchaseConversion = {
  claimId: string;
  orderId: string;
  productSlug: string;
  value: number;
  currency: string;
  ga4Pending: boolean;
  googleAdsPending: boolean;
};

// Inputs come from server queries; the repeated owner/mode/variant checks keep
// recovery bounded even if those queries are later broadened accidentally.
export function getPendingPurchaseConversions(
  userId: string,
  claims: readonly CheckoutAnalyticsClaim[],
  purchases: readonly RecoveryPurchase[],
  now = Date.now()
): PendingPurchaseConversion[] {
  const result: PendingPurchaseConversion[] = [];
  const seenOrders = new Set<string>();
  for (const claim of claims) {
    const createdAt = Date.parse(claim.created_at);
    if (!claim.analytics_recovery_enabled || claim.user_id !== userId || !claim.consumed_order_id
      || !Number.isFinite(createdAt) || createdAt > now || now - createdAt > PURCHASE_RECOVERY_MAX_AGE_MS
      || (claim.ga4_processed_at && claim.google_ads_processed_at) || seenOrders.has(claim.consumed_order_id)) continue;
    const purchase = purchases.find((row) => row.lemon_order_id === claim.consumed_order_id
      && row.user_id === userId && row.lemon_variant_id === claim.lemon_variant_id);
    if (!purchase || purchase.status !== 'paid' || purchase.test_mode !== false || !purchase.product_slug
      || !Number.isInteger(purchase.total_cents) || purchase.total_cents < 0
      || !/^[A-Za-z]{3}$/.test(purchase.currency)) continue;
    seenOrders.add(purchase.lemon_order_id);
    result.push({
      claimId: claim.id,
      orderId: purchase.lemon_order_id,
      productSlug: purchase.product_slug,
      value: purchase.total_cents / 100,
      currency: purchase.currency.toUpperCase(),
      ga4Pending: !claim.ga4_processed_at,
      googleAdsPending: !claim.google_ads_processed_at
    });
  }
  return result;
}
