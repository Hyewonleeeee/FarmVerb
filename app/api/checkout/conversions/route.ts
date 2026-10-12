import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadPendingPurchaseConversions } from '@/lib/analytics/purchaseRecovery.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const HEADERS = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

async function authenticate(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return null;
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return !error && user ? { supabase, userId: user.id } : null;
}

export async function GET(request: Request) {
  try {
    const context = await authenticate(request);
    if (!context) return json({ ok: false, error: 'Authentication required.' }, 401);
    const conversions = await loadPendingPurchaseConversions(context.supabase, context.userId);
    return json({ ok: true, conversions });
  } catch {
    // Optional analytics recovery must never block access to purchased products.
    return json({ ok: false, error: 'Checkout analytics recovery is unavailable.' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const context = await authenticate(request);
    if (!context) return json({ ok: false, error: 'Authentication required.' }, 401);
    const body = await request.json().catch(() => null) as {
      action?: unknown; orderId?: unknown; channel?: unknown; leaseToken?: unknown
    } | null;
    if (!body || typeof body.orderId !== 'string' || !body.orderId.trim()
      || (body.action !== 'lease' && body.action !== 'ack')) {
      return json({ ok: false, error: 'Invalid analytics request.' }, 400);
    }
    const conversion = (await loadPendingPurchaseConversions(context.supabase, context.userId))
      .find((candidate) => candidate.orderId === body.orderId);
    if (!conversion) return json({ ok: false, error: 'Pending purchase not found.' }, 404);

    if (body.action === 'lease') {
      const leaseToken = randomUUID();
      const { data: acquired, error } = await context.supabase.rpc('lease_purchase_analytics', {
        p_claim_id: conversion.claimId,
        p_user_id: context.userId,
        p_lease_token: leaseToken
      });
      if (error) return json({ ok: false, error: 'Could not reserve purchase analytics.' }, 503);
      return json({ ok: true, ...(acquired ? { conversion, leaseToken } : {}) });
    }

    if ((body.channel !== 'ga4' && body.channel !== 'google_ads')
      || typeof body.leaseToken !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(body.leaseToken)) {
      return json({ ok: false, error: 'Invalid analytics acknowledgement.' }, 400);
    }
    const column = body.channel === 'ga4' ? 'ga4_processed_at' : 'google_ads_processed_at';
    const { data, error } = await context.supabase.from('purchase_account_claims')
      .update({ [column]: new Date().toISOString() })
      .eq('id', conversion.claimId)
      .eq('user_id', context.userId)
      .eq('consumed_order_id', conversion.orderId)
      .eq('analytics_lease_token', body.leaseToken)
      .select('id').maybeSingle();
    if (error) return json({ ok: false, error: 'Could not acknowledge purchase analytics.' }, 503);
    return data ? json({ ok: true }) : json({ ok: false, error: 'Analytics lease changed.' }, 409);
  } catch {
    return json({ ok: false, error: 'Checkout analytics recovery is unavailable.' }, 503);
  }
}
