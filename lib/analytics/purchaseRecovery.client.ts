import { GA4_MEASUREMENT_ID, GOOGLE_ADS_PURCHASE_SEND_TO } from '@/lib/analytics/config';
import { trackGoogleAdsPurchase, trackPurchase } from '@/lib/analytics/ecommerce';
import { getAnalyticsProductBySlug } from '@/lib/analytics/products';
import { clearCheckoutSuccessMarker } from '@/lib/checkout/lemonOverlay';
import type { PendingPurchaseConversion, PurchaseAnalyticsChannel } from '@/lib/analytics/purchaseRecovery';

export async function recoverPurchaseAnalytics(accessToken: string): Promise<PendingPurchaseConversion[]> {
  if (typeof window === 'undefined'
    || !['farmverb.com', 'www.farmverb.com'].includes(window.location.hostname.toLowerCase())) return [];
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  try {
    const response = await fetch('/api/checkout/conversions', { headers, cache: 'no-store' });
    if (!response.ok) return [];
    const payload = await response.json() as { conversions?: PendingPurchaseConversion[] };
    const conversions = Array.isArray(payload.conversions) ? payload.conversions : [];
    for (const candidate of conversions) {
      const leaseResponse = await fetch('/api/checkout/conversions', {
        method: 'POST', headers, cache: 'no-store',
        body: JSON.stringify({ action: 'lease', orderId: candidate.orderId })
      });
      if (!leaseResponse.ok) continue;
      const lease = await leaseResponse.json() as { conversion?: PendingPurchaseConversion; leaseToken?: string };
      const conversion = lease.conversion;
      if (!conversion || !lease.leaseToken) continue;
      const product = getAnalyticsProductBySlug(conversion.productSlug);
      if (!product) continue;
      const processed = { ga4: !conversion.ga4Pending, google_ads: !conversion.googleAdsPending };
      const acknowledge = (channel: PurchaseAnalyticsChannel) => {
        void fetch('/api/checkout/conversions', {
          method: 'POST', headers, cache: 'no-store', keepalive: true,
          body: JSON.stringify({ action: 'ack', orderId: conversion.orderId, channel, leaseToken: lease.leaseToken })
        }).then((result) => {
          if (!result.ok) return;
          processed[channel] = true;
          if (processed.ga4 && processed.google_ads) clearCheckoutSuccessMarker(conversion.orderId);
        }).catch(() => {
          // Keep the server channel pending. A later visit re-acknowledges the
          // local processed marker without sending the same event again.
        });
      };
      const details = { transactionId: conversion.orderId, value: conversion.value, currency: conversion.currency };
      if (conversion.ga4Pending) trackPurchase(product, details, GA4_MEASUREMENT_ID, () => acknowledge('ga4'));
      if (conversion.googleAdsPending) {
        trackGoogleAdsPurchase({ ...details, status: 'paid', testMode: false }, GOOGLE_ADS_PURCHASE_SEND_TO,
          () => acknowledge('google_ads'));
      }
    }
    return conversions;
  } catch {
    // Analytics recovery never masks an account's purchases or downloads.
    return [];
  }
}
