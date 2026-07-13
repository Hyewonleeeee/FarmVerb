import { NextResponse } from 'next/server';
import { getProductSlugByVariantId } from '@/lib/payments/lemonProducts.server';
import {
  getLemonEventName,
  normalizeLemonOrder,
  verifyLemonWebhookSignature
} from '@/lib/payments/lemonWebhook.server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Lemon Webhook] LEMON_SQUEEZY_WEBHOOK_SECRET is not configured.');
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
  if (headerEventName !== 'order_created' || payloadEventName !== 'order_created') {
    return NextResponse.json({ ok: true, ignored: true });
  }

  let order: ReturnType<typeof normalizeLemonOrder>;
  try {
    order = normalizeLemonOrder(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid order payload.';
    console.error('[Lemon Webhook] Rejected malformed order_created payload:', message);
    return jsonError(400, message);
  }

  const productSlug = getProductSlugByVariantId(order.lemonVariantId);
  if (!productSlug) {
    console.warn('[Lemon Webhook] Unmapped Lemon variant ID.', {
      lemonOrderId: order.lemonOrderId,
      lemonVariantId: order.lemonVariantId,
      testMode: order.testMode
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

  const now = new Date().toISOString();
  const purchaseValues = {
    lemon_order_id: order.lemonOrderId,
    lemon_variant_id: order.lemonVariantId,
    product_name: order.productName,
    buyer_email: order.buyerEmail,
    status: order.status,
    currency: order.currency,
    total_cents: order.totalCents,
    test_mode: order.testMode,
    purchased_at: order.purchasedAt,
    updated_at: now,
    ...(productSlug ? { product_slug: productSlug } : {})
  };

  const { data, error } = await supabase
    .from('purchases')
    .upsert(purchaseValues, { onConflict: 'lemon_order_id' })
    .select('id, lemon_order_id, product_slug, status, test_mode, purchased_at')
    .maybeSingle();

  if (error) {
    console.error('[Lemon Webhook] Failed to persist purchase.', {
      lemonOrderId: order.lemonOrderId,
      code: error.code,
      message: error.message
    });
    return jsonError(500, 'Failed to save purchase.');
  }

  return NextResponse.json({
    ok: true,
    purchase: data
  });
}
