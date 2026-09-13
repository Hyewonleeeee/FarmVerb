import { NextResponse } from 'next/server';
import {
  deactivatePurchaseLicenseInstance,
  EntitlementError,
  getPurchaseLicenseInstances,
  requireOwnedPurchase
} from '@/lib/payments/lemonEntitlements.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

type RouteContext = {
  params: Promise<{ purchaseId: string; licenseId: string }>;
};

function entitlementErrorResponse(error: unknown) {
  if (error instanceof EntitlementError) {
    const headers = {
      ...PRIVATE_NO_STORE_HEADERS,
      ...(error.retryAfter ? { 'Retry-After': error.retryAfter } : {})
    };
    return NextResponse.json(
      { ok: false, error: error.message, errorCode: error.code },
      { status: error.status, headers }
    );
  }

  console.error('[Purchase License Devices] Unexpected error.', error instanceof Error ? error.message : 'Unknown error');
  return NextResponse.json(
    { ok: false, error: 'Could not manage license devices.', errorCode: 'UNEXPECTED_ERROR' },
    { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { purchaseId, licenseId } = await context.params;
    const purchase = await requireOwnedPurchase(request, purchaseId);
    const instances = await getPurchaseLicenseInstances(purchase, licenseId);

    return NextResponse.json(
      { ok: true, licenseId, instances },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    return entitlementErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { purchaseId, licenseId } = await context.params;
    const body = (await request.json().catch(() => null)) as { instanceIdentifier?: unknown } | null;
    const instanceIdentifier =
      typeof body?.instanceIdentifier === 'string' ? body.instanceIdentifier.trim() : '';

    if (!instanceIdentifier || instanceIdentifier.length > 200) {
      return NextResponse.json(
        { ok: false, error: 'A valid device must be selected.', errorCode: 'INSTANCE_REQUIRED' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const purchase = await requireOwnedPurchase(request, purchaseId);
    const instances = await deactivatePurchaseLicenseInstance(
      purchase,
      licenseId,
      instanceIdentifier
    );

    return NextResponse.json(
      {
        ok: true,
        licenseId,
        deactivatedInstanceIdentifier: instanceIdentifier,
        instances
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    return entitlementErrorResponse(error);
  }
}
