import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  PendingSignupConversion,
  SignupAnalyticsChannel
} from '@/lib/analytics/signupRecovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };
const PRODUCTION_HOSTS = new Set(['farmverb.com', 'www.farmverb.com']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReserveRow = {
  event_id?: unknown;
  signup_method?: unknown;
  ga4_pending?: unknown;
  google_ads_pending?: unknown;
};

const json = (body: unknown, status = 200) => (
  NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS })
);

function isCanonicalProductionRequest(request: Request) {
  if (process.env.VERCEL_ENV !== 'production') {
    return false;
  }

  try {
    return PRODUCTION_HOSTS.has(new URL(request.url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function toPendingConversion(value: ReserveRow | null | undefined): PendingSignupConversion | null {
  if (
    !value
    || typeof value.event_id !== 'string'
    || !UUID_PATTERN.test(value.event_id)
    || value.signup_method !== 'email_otp'
    || typeof value.ga4_pending !== 'boolean'
    || typeof value.google_ads_pending !== 'boolean'
  ) {
    return null;
  }

  return {
    eventId: value.event_id,
    method: value.signup_method,
    ga4Pending: value.ga4_pending,
    googleAdsPending: value.google_ads_pending
  };
}

async function authenticate(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const accessToken = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  if (!accessToken) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser(accessToken);
  if (error || !user || !user.email_confirmed_at || user.app_metadata?.analytics_test === true) {
    return null;
  }

  return { supabase, userId: user.id };
}

export async function POST(request: Request) {
  if (!isCanonicalProductionRequest(request)) {
    return json({ ok: false, error: 'Signup conversion tracking is unavailable.' }, 404);
  }

  try {
    const context = await authenticate(request);
    if (!context) {
      return json({ ok: false, error: 'Authentication required.' }, 401);
    }

    const body = await request.json().catch(() => null) as {
      action?: unknown;
      eventId?: unknown;
      channel?: unknown;
      leaseToken?: unknown;
    } | null;

    if (!body || (body.action !== 'reserve' && body.action !== 'ack')) {
      return json({ ok: false, error: 'Invalid signup analytics request.' }, 400);
    }

    if (body.action === 'reserve') {
      const leaseToken = randomUUID();
      const { data, error } = await context.supabase.rpc('reserve_signup_conversion', {
        p_user_id: context.userId,
        p_lease_token: leaseToken
      });
      if (error) {
        return json({ ok: false, error: 'Could not reserve signup analytics.' }, 503);
      }

      const row = Array.isArray(data) ? data[0] : data;
      const conversion = toPendingConversion(row as ReserveRow | null | undefined);
      return json({
        ok: true,
        ...(conversion ? { conversion, leaseToken } : {})
      });
    }

    if (
      typeof body.eventId !== 'string'
      || !UUID_PATTERN.test(body.eventId)
      || typeof body.leaseToken !== 'string'
      || !UUID_PATTERN.test(body.leaseToken)
      || (body.channel !== 'ga4' && body.channel !== 'google_ads')
    ) {
      return json({ ok: false, error: 'Invalid signup analytics acknowledgement.' }, 400);
    }

    const { data, error } = await context.supabase.rpc('ack_signup_conversion', {
      p_user_id: context.userId,
      p_event_id: body.eventId,
      p_lease_token: body.leaseToken,
      p_channel: body.channel satisfies SignupAnalyticsChannel
    });
    if (error) {
      return json({ ok: false, error: 'Could not acknowledge signup analytics.' }, 503);
    }

    return data === true
      ? json({ ok: true })
      : json({ ok: false, error: 'Signup analytics lease changed.' }, 409);
  } catch {
    // Signup analytics is optional and must never interfere with authentication.
    return json({ ok: false, error: 'Signup analytics is unavailable.' }, 503);
  }
}
