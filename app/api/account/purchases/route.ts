import { NextResponse } from 'next/server';
import {
  ENTITLED_PURCHASE_STATUSES,
  type AccountPurchase
} from '@/lib/payments/purchases';
import {
  getOfficialProductForLivePurchase,
  OFFICIAL_LIVE_VARIANT_IDS
} from '@/lib/products/catalog';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
}

export async function GET(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return jsonError(401, 'Authentication required.');
  }

  let supabase: ReturnType<typeof createServerSupabaseClient>;
  try {
    supabase = createServerSupabaseClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase server client is not configured.';
    console.error('[Account Purchases] Supabase configuration error:', message);
    return jsonError(500, 'Purchase history is not configured.');
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user?.email) {
    return jsonError(401, 'Invalid or expired session.');
  }

  // Claim-bearing checkouts belong to their initiating account. An invalid or
  // expired claim must never silently fall back to the billing email.
  // Existing linked purchases remain readable even before email confirmation.
  if (user.email_confirmed_at) {
    const { error: claimError } = await supabase
      .from('purchases')
      .update({ user_id: user.id, account_link_status: 'linked', updated_at: new Date().toISOString() })
      .is('user_id', null)
      .eq('account_link_status', 'email_allowed')
      .eq('buyer_email', user.email.trim().toLowerCase())
      .in('status', [...ENTITLED_PURCHASE_STATUSES])
      .eq('test_mode', false)
      .in('lemon_variant_id', [...OFFICIAL_LIVE_VARIANT_IDS]);

    if (claimError) {
      console.error('[Account Purchases] Failed to link purchases.', {
        userId: user.id,
        code: claimError.code,
        message: claimError.message
      });
      return jsonError(500, 'Failed to link purchase history.');
    }
  }

  const { data, error } = await supabase
    .from('purchases')
    .select(
      'id, product_name, lemon_order_id, lemon_variant_id, total_cents, currency, purchased_at, status, test_mode'
    )
    .eq('user_id', user.id)
    .in('status', [...ENTITLED_PURCHASE_STATUSES])
    .eq('test_mode', false)
    .in('lemon_variant_id', [...OFFICIAL_LIVE_VARIANT_IDS])
    .order('purchased_at', { ascending: false });

  if (error) {
    console.error('[Account Purchases] Failed to load purchases.', {
      userId: user.id,
      code: error.code,
      message: error.message
    });
    return jsonError(500, 'Failed to load purchase history.');
  }

  const purchases: AccountPurchase[] = (data ?? []).flatMap((purchase) => {
    const product = getOfficialProductForLivePurchase(purchase);
    if (!product) {
      return [];
    }

    return [{
      id: purchase.id,
      product_slug: product.slug,
      product_name: product.name,
      lemon_order_id: purchase.lemon_order_id,
      total_cents: purchase.total_cents,
      currency: purchase.currency,
      test_mode: purchase.test_mode,
      purchased_at: purchase.purchased_at,
      status: purchase.status
    }];
  });

  return NextResponse.json(
    { ok: true, purchases },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
