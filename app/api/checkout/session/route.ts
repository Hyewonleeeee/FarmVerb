import { NextResponse } from 'next/server';
import {
  buildAccountClaimCheckoutUrl
} from '@/lib/checkout/accountClaim';
import {
  AccountClaimStorageError,
  createPurchaseAccountClaim
} from '@/lib/checkout/accountClaim.server';
import { getOfficialProductByName } from '@/lib/products/catalog';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
}

export async function POST(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return jsonError(401, 'Authentication required.');
  }

  const body = (await request.json().catch(() => null)) as { productName?: unknown } | null;
  const productName = typeof body?.productName === 'string' ? body.productName.trim() : '';
  const product = getOfficialProductByName(productName);
  if (!product) {
    return jsonError(400, 'This product is not available for checkout.');
  }

  let supabase: ReturnType<typeof createServerSupabaseClient>;
  try {
    supabase = createServerSupabaseClient();
  } catch {
    return jsonError(500, 'Secure checkout is not configured.');
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user?.email) {
    return jsonError(401, 'Invalid or expired session.');
  }

  try {
    const claim = await createPurchaseAccountClaim(supabase, {
      userId: user.id,
      product
    });
    const checkoutUrl = buildAccountClaimCheckoutUrl(
      product.lemonCheckoutUrl,
      user.email.trim().toLowerCase(),
      claim.token
    );

    return NextResponse.json(
      {
        ok: true,
        checkoutUrl,
        expiresAt: claim.expiresAt
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('[Checkout Session] Failed to create account claim.', {
      userId: user.id,
      productSlug: product.slug,
      code: error instanceof AccountClaimStorageError ? error.code : 'UNKNOWN'
    });
    return jsonError(500, 'Could not prepare secure checkout. Please try again.');
  }
}
