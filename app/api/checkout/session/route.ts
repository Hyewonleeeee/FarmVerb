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
import { getCampaignRuntime, type CampaignPhase } from '@/lib/campaigns/blackFridayClock';
import { getCampaignPriceBySlug } from '@/lib/campaigns/blackFridayPricing';
import { createVerifiedLemonCheckout, verifyLemonProductPrice } from '@/lib/checkout/lemonCheckout.server';
import { CheckoutPriceError, getVerifiedCheckoutExpiry, validateDisplayedCheckoutPrice } from '@/lib/checkout/priceValidation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json({ ok: false, error, ...(code ? { code } : {}) }, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

function requireSameCampaignPhase(phase: CampaignPhase) {
  const current = getCampaignRuntime(process.env);
  if (!current.campaignEnabled || current.previewMode || current.phase !== phase) {
    throw new CheckoutPriceError('PRICE_CHANGED', 'CAMPAIGN_PHASE_CHANGED');
  }
  return current;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
}

export async function POST(request: Request) {
  const campaign = getCampaignRuntime(process.env);
  if (campaign.previewMode) {
    return jsonError(403, 'Checkout is disabled in this design preview.');
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return jsonError(401, 'Authentication required.');
  }

  const body = (await request.json().catch(() => null)) as {
    productName?: unknown;
    expectedPriceCents?: unknown;
    expectedPhase?: unknown;
  } | null;
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
    if (campaign.campaignEnabled) {
      requireSameCampaignPhase(campaign.phase);
      const price = getCampaignPriceBySlug(product.slug, campaign.phase);
      if (!price) throw new CheckoutPriceError('PRICE_CHECK_UNAVAILABLE', 'CAMPAIGN_PRICE_MISSING');
      validateDisplayedCheckoutPrice(body ?? {}, { priceCents: price.priceCents, phase: campaign.phase });

      // Verify merchant configuration before creating any account claim. This
      // flow never falls back to the unverified, permanent catalogue URL.
      const verifiedProduct = await verifyLemonProductPrice(product, price.priceCents);
      const current = requireSameCampaignPhase(campaign.phase);
      const expiresAt = getVerifiedCheckoutExpiry(Date.now(), current.nextBoundaryAt);
      const claim = await createPurchaseAccountClaim(supabase, { userId: user.id, product });
      requireSameCampaignPhase(campaign.phase);
      const checkout = await createVerifiedLemonCheckout(verifiedProduct, {
        email: user.email.trim().toLowerCase(),
        claimToken: claim.token,
        expiresAt
      });
      requireSameCampaignPhase(campaign.phase);
      return NextResponse.json({
        ok: true,
        ...checkout,
        claimId: claim.claimId,
        phase: campaign.phase
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

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
        claimId: claim.claimId,
        expiresAt: claim.expiresAt
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof CheckoutPriceError) {
      console.warn('[Checkout Session] Price verification rejected checkout.', {
        productSlug: product.slug,
        phase: campaign.phase,
        code: error.code,
        reason: error.reason
      });
      return jsonError(error.code === 'PRICE_CHANGED' ? 409 : 503, error.message, error.code);
    }
    console.error('[Checkout Session] Failed to create account claim.', {
      productSlug: product.slug,
      code: error instanceof AccountClaimStorageError ? error.code : 'UNKNOWN'
    });
    return jsonError(500, 'Could not prepare secure checkout. Please try again.');
  }
}
