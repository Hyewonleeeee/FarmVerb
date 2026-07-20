import { NextResponse } from 'next/server';
import {
  EntitlementError,
  getPurchaseLicenses,
  requireOwnedPurchase
} from '@/lib/payments/lemonEntitlements.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ purchaseId: string }>;
};

function entitlementErrorResponse(error: unknown) {
  if (error instanceof EntitlementError) {
    const headers = error.retryAfter ? { 'Retry-After': error.retryAfter } : undefined;
    return NextResponse.json(
      { ok: false, error: error.message, errorCode: error.code },
      { status: error.status, headers }
    );
  }

  console.error('[Purchase Licenses] Unexpected error.', error instanceof Error ? error.message : error);
  return NextResponse.json(
    { ok: false, error: 'Could not load license keys.', errorCode: 'UNEXPECTED_ERROR' },
    { status: 500 }
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { purchaseId } = await context.params;
    const purchase = await requireOwnedPurchase(request, purchaseId);
    const licenses = await getPurchaseLicenses(purchase);

    return NextResponse.json(
      { ok: true, licenses },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return entitlementErrorResponse(error);
  }
}
