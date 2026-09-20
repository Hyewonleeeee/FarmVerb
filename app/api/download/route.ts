import { NextResponse } from 'next/server';

const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

// Legacy orders and licenses do not carry Lemon Live/Test identifiers, so this
// endpoint cannot safely establish ownership of a current FarmVerb product.
// Current downloads are served by /api/account/purchases/[purchaseId]/downloads.
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      errorCode: 'LEGACY_DOWNLOAD_RETIRED',
      error: 'This legacy download route is no longer available. Open My Account to access current purchases.'
    },
    { status: 410, headers: PRIVATE_NO_STORE_HEADERS }
  );
}
