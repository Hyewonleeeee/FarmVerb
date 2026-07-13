import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
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

  const verifiedEmail = user.email.trim().toLowerCase();
  const now = new Date().toISOString();

  // Only a Supabase-verified email can claim an unlinked purchase with the exact same email.
  const { error: claimError } = await supabase
    .from('purchases')
    .update({ user_id: user.id, updated_at: now })
    .is('user_id', null)
    .eq('buyer_email', verifiedEmail);

  if (claimError) {
    console.error('[Account Purchases] Failed to link purchases.', {
      userId: user.id,
      code: claimError.code,
      message: claimError.message
    });
    return jsonError(500, 'Failed to link purchase history.');
  }

  const { data, error } = await supabase
    .from('purchases')
    .select(
      'id, user_id, buyer_email, product_slug, product_name, lemon_order_id, lemon_variant_id, total_cents, currency, test_mode, lemon_license_key, download_url, purchased_at, status, created_at, updated_at'
    )
    .eq('user_id', user.id)
    .order('purchased_at', { ascending: false });

  if (error) {
    console.error('[Account Purchases] Failed to load purchases.', {
      userId: user.id,
      code: error.code,
      message: error.message
    });
    return jsonError(500, 'Failed to load purchase history.');
  }

  return NextResponse.json({ ok: true, purchases: data ?? [] });
}
