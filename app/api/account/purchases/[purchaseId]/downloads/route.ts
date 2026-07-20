import { NextResponse } from 'next/server';
import {
  EntitlementError,
  getFreshPurchaseDownload,
  getPurchaseDownloadGroups,
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

  console.error('[Purchase Downloads] Unexpected error.', error instanceof Error ? error.message : error);
  return NextResponse.json(
    { ok: false, error: 'Could not load downloads.', errorCode: 'UNEXPECTED_ERROR' },
    { status: 500 }
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { purchaseId } = await context.params;
    const purchase = await requireOwnedPurchase(request, purchaseId);
    const groups = await getPurchaseDownloadGroups(purchase);

    return NextResponse.json(
      { ok: true, groups },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return entitlementErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { purchaseId } = await context.params;
    const body = (await request.json().catch(() => null)) as { fileId?: unknown } | null;
    const fileId = typeof body?.fileId === 'string' ? body.fileId.trim() : '';

    if (!fileId) {
      return NextResponse.json(
        { ok: false, error: 'A file must be selected.', errorCode: 'FILE_REQUIRED' },
        { status: 400 }
      );
    }

    const purchase = await requireOwnedPurchase(request, purchaseId);
    const result = await getFreshPurchaseDownload(purchase, fileId);

    return NextResponse.json(
      { ok: true, downloadUrl: result.downloadUrl, file: result.file },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return entitlementErrorResponse(error);
  }
}
