import { NextResponse } from 'next/server';
import {
  AccountClaimStorageError,
  consumePurchaseAccountClaim
} from '@/lib/checkout/accountClaim.server';
import { getProductSlugByVariantId } from '@/lib/payments/lemonProducts.server';
import {
  getLemonAccountClaimToken,
  getLemonEventName,
  normalizeLemonOrder,
  verifyLemonWebhookSignature
} from '@/lib/payments/lemonWebhook.server';
import { LemonApiError, lemonApiPatch, lemonApiRequest } from '@/lib/payments/lemonApi.server';
import {
  LemonRefundVerificationError,
  processVerifiedRefund,
  type VerifiedRefundKind
} from '@/lib/payments/lemonRefund';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

class PurchasePersistenceError extends Error {
  constructor() {
    super('Failed to save purchase.');
    this.name = 'PurchasePersistenceError';
  }
}

async function persistPurchase(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  order: ReturnType<typeof normalizeLemonOrder>,
  status: string,
  productSlug: NonNullable<ReturnType<typeof getProductSlugByVariantId>>,
  userId?: string
) {
  const now = new Date().toISOString();
  const purchaseValues = {
    lemon_order_id: order.lemonOrderId,
    lemon_variant_id: order.lemonVariantId,
    product_name: order.productName,
    buyer_email: order.buyerEmail,
    status,
    currency: order.currency,
    total_cents: order.totalCents,
    test_mode: order.testMode,
    purchased_at: order.purchasedAt,
    updated_at: now,
    product_slug: productSlug,
    ...(userId ? { user_id: userId } : {})
  };

  const { data, error } = await supabase
    .from('purchases')
    .upsert(purchaseValues, { onConflict: 'lemon_order_id' })
    .select('id, lemon_order_id, product_slug, status, test_mode, purchased_at')
    .maybeSingle();

  if (error) {
    console.error('[Lemon Webhook] Failed to persist purchase.', {
      lemonOrderId: order.lemonOrderId,
      code: error.code
    });
    throw new PurchasePersistenceError();
  }

  return data;
}

function getRefundPurchaseStatus(kind: VerifiedRefundKind) {
  return kind === 'full' ? 'refunded' : 'partial_refund';
}

export async function POST(request: Request) {
  const webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  const configuredStoreId = process.env.LEMON_STORE_ID?.trim();
  if (!webhookSecret || !configuredStoreId) {
    console.error('[Lemon Webhook] Lemon webhook secret or store ID is not configured.');
    return jsonError(500, 'Webhook is not configured.');
  }

  const signature = request.headers.get('x-signature');
  if (!signature) {
    return jsonError(401, 'Missing webhook signature.');
  }

  const rawBody = await request.text();
  if (!verifyLemonWebhookSignature(rawBody, signature, webhookSecret)) {
    return jsonError(401, 'Invalid webhook signature.');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return jsonError(400, 'Invalid webhook JSON.');
  }

  const headerEventName = request.headers.get('x-event-name');
  const payloadEventName = getLemonEventName(payload);
  if (!headerEventName || headerEventName !== payloadEventName) {
    return jsonError(400, 'Webhook event name mismatch.');
  }

  if (headerEventName !== 'order_created' && headerEventName !== 'order_refunded') {
    return NextResponse.json({ ok: true, ignored: true });
  }

  let order: ReturnType<typeof normalizeLemonOrder>;
  try {
    order = normalizeLemonOrder(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid order payload.';
    console.error('[Lemon Webhook] Rejected malformed order payload:', message);
    return jsonError(400, message);
  }

  const productSlug = getProductSlugByVariantId(order.lemonVariantId);
  if (
    order.testMode
    || order.storeId !== configuredStoreId
    || !order.lemonVariantId
    || !productSlug
  ) {
    console.warn('[Lemon Webhook] Ignored non-Live or unmapped purchase.', {
      lemonOrderId: order.lemonOrderId,
      lemonVariantId: order.lemonVariantId,
      storeMatches: order.storeId === configuredStoreId,
      testMode: order.testMode
    });
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: order.testMode
        ? 'test_mode'
        : order.storeId !== configuredStoreId
          ? 'store_mismatch'
          : 'unmapped_variant'
    });
  }

  let supabase: ReturnType<typeof createServerSupabaseClient>;
  try {
    supabase = createServerSupabaseClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase server client is not configured.';
    console.error('[Lemon Webhook] Supabase configuration error:', message);
    return jsonError(500, 'Database is not configured.');
  }

  if (headerEventName === 'order_created') {
    const claimToken = getLemonAccountClaimToken(payload);
    let claimedUserId: string | undefined;

    if (claimToken) {
      try {
        const claim = await consumePurchaseAccountClaim(supabase, {
          token: claimToken,
          orderId: order.lemonOrderId,
          variantId: order.lemonVariantId
        });

        if (claim.status === 'linked') {
          claimedUserId = claim.userId;
        } else {
          console.warn('[Lemon Webhook] Account claim was not accepted.', {
            lemonOrderId: order.lemonOrderId,
            reason: claim.status
          });
        }
      } catch (error) {
        console.error('[Lemon Webhook] Account claim verification failed.', {
          lemonOrderId: order.lemonOrderId,
          code: error instanceof AccountClaimStorageError ? error.code : 'UNKNOWN'
        });
        return jsonError(500, 'Failed to verify purchase account claim.');
      }
    }

    try {
      const data = await persistPurchase(
        supabase,
        order,
        order.status,
        productSlug,
        claimedUserId
      );
      return NextResponse.json({ ok: true, purchase: data });
    } catch {
      return jsonError(500, 'Failed to save purchase.');
    }
  }

  let purchase: Awaited<ReturnType<typeof persistPurchase>> | null = null;

  try {
    const result = await processVerifiedRefund(
      {
        orderId: order.lemonOrderId,
        expectedTestMode: order.testMode,
        configuredStoreId
      },
      {
        getOrder: (orderId) => lemonApiRequest(`/orders/${encodeURIComponent(orderId)}`),
        recordVerifiedRefund: async (kind) => {
          purchase = await persistPurchase(
            supabase,
            order,
            getRefundPurchaseStatus(kind),
            productSlug
          );
        },
        listLicenseKeys: (orderId) => {
          const query = new URLSearchParams({
            'filter[order_id]': orderId,
            'page[size]': '100'
          });
          return lemonApiRequest(`/license-keys?${query.toString()}`);
        },
        disableLicenseKey: (licenseId) => lemonApiPatch(
          `/license-keys/${encodeURIComponent(licenseId)}`,
          {
            data: {
              type: 'license-keys',
              id: licenseId,
              attributes: { disabled: true }
            }
          }
        )
      }
    );

    return NextResponse.json({
      ok: true,
      purchase,
      refund: result
    });
  } catch (error) {
    const code = error instanceof LemonRefundVerificationError
      ? error.code
      : error instanceof LemonApiError
        ? `LEMON_API_${error.status}`
        : error instanceof PurchasePersistenceError
          ? 'PURCHASE_PERSISTENCE_FAILED'
          : 'REFUND_PROCESSING_FAILED';

    console.error('[Lemon Webhook] Refund processing failed.', {
      lemonOrderId: order.lemonOrderId,
      code
    });

    if (error instanceof LemonRefundVerificationError) {
      return jsonError(409, 'Refund could not be verified with Lemon Squeezy.');
    }

    if (error instanceof PurchasePersistenceError) {
      return jsonError(500, 'Failed to save refunded purchase.');
    }

    return jsonError(502, 'Refund license revocation could not be completed.');
  }
}
