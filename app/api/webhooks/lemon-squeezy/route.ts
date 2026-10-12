import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { consumeAccountClaimHash, hashAccountClaimToken, isAccountClaimToken } from '@/lib/checkout/accountClaim';
import { getProductSlugByVariantId } from '@/lib/payments/lemonProducts.server';
import {
  getLemonAccountClaimToken,
  getLemonEventName,
  hasLemonAccountClaim,
  normalizeLemonOrder,
  verifyLemonWebhookSignature
} from '@/lib/payments/lemonWebhook.server';
import { LemonApiError, lemonApiPatch, lemonApiRequest } from '@/lib/payments/lemonApi.server';
import { LemonRefundVerificationError, processVerifiedRefund } from '@/lib/payments/lemonRefund';
import { createPaymentRepository } from '@/lib/payments/paymentRepository';
import { PaymentProcessingError, processPaymentEvent } from '@/lib/payments/paymentProcessing';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  const configuredStoreId = process.env.LEMON_STORE_ID?.trim();
  if (!webhookSecret || !configuredStoreId) return jsonError(500, 'Webhook is not configured.');

  const signature = request.headers.get('x-signature');
  if (!signature) return jsonError(401, 'Missing webhook signature.');
  const rawBody = await request.text();
  if (!verifyLemonWebhookSignature(rawBody, signature, webhookSecret)) {
    return jsonError(401, 'Invalid webhook signature.');
  }

  let payload: unknown;
  try { payload = JSON.parse(rawBody) as unknown; } catch { return jsonError(400, 'Invalid webhook JSON.'); }
  const eventName = request.headers.get('x-event-name');
  if (!eventName || eventName !== getLemonEventName(payload)) return jsonError(400, 'Webhook event name mismatch.');
  if (eventName !== 'order_created' && eventName !== 'order_refunded') {
    return NextResponse.json({ ok: true, ignored: true });
  }

  let order: ReturnType<typeof normalizeLemonOrder>;
  try { order = normalizeLemonOrder(payload); } catch { return jsonError(400, 'Invalid order payload.'); }
  if (order.testMode || order.storeId !== configuredStoreId) {
    return NextResponse.json({ ok: true, ignored: true, reason: order.testMode ? 'test_mode' : 'store_mismatch' });
  }

  let eventId: string | undefined;
  try {
    const repository = createPaymentRepository(createServerSupabaseClient(), consumeAccountClaimHash);
    const claimToken = getLemonAccountClaimToken(payload);
    // Acknowledge only after durable capture, including orders needing review.
    // Neither raw webhook payloads nor plaintext account claims are stored.
    const event = await repository.storeEvent({
      eventKey: createHash('sha256').update(rawBody).digest('hex'),
      eventName,
      order,
      claimPresent: hasLemonAccountClaim(payload),
      claimHash: claimToken && isAccountClaimToken(claimToken) ? hashAccountClaimToken(claimToken) : null,
      source: 'webhook'
    });
    eventId = event.id;
    const result = await processPaymentEvent(event, {
      ...repository,
      configuredStoreId,
      getProductSlug: getProductSlugByVariantId,
      processRefund: async (refundOrder, recordStatus) => {
        try {
          await processVerifiedRefund({
            orderId: refundOrder.lemonOrderId,
            expectedTestMode: false,
            configuredStoreId
          }, {
            getOrder: (id) => lemonApiRequest(`/orders/${encodeURIComponent(id)}`),
            recordVerifiedRefund: (kind) => recordStatus(kind === 'full' ? 'refunded' : 'partial_refund'),
            listLicenseKeys: (id) => lemonApiRequest(`/license-keys?${new URLSearchParams({ 'filter[order_id]': id, 'page[size]': '100' })}`),
            disableLicenseKey: (id) => lemonApiPatch(`/license-keys/${encodeURIComponent(id)}`, {
              data: { type: 'license-keys', id, attributes: { disabled: true } }
            })
          });
        } catch (error) {
          if (error instanceof LemonRefundVerificationError) throw new PaymentProcessingError(error.code);
          if (error instanceof LemonApiError) throw new PaymentProcessingError(`LEMON_API_${error.status}`);
          throw error;
        }
      }
    });
    if (result.state === 'busy') return jsonError(503, 'This event is being processed. Retry shortly.');
    if (result.state === 'quarantined') {
      console.warn('[Lemon Webhook] Payment needs review.', { eventId, lemonOrderId: order.lemonOrderId, reason: result.reason });
    }
    return NextResponse.json({ ok: true, eventId, state: result.state, ...(result.reason ? { reason: result.reason } : {}) });
  } catch (error) {
    console.error('[Lemon Webhook] Payment processing failed.', {
      eventId,
      lemonOrderId: order.lemonOrderId,
      code: error instanceof PaymentProcessingError ? error.code : 'PAYMENT_STORAGE_FAILED'
    });
    return jsonError(500, 'Payment processing could not be completed.');
  }
}
