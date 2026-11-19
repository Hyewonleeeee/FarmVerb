import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../test/loadSourceModule.mjs';

const OWNER_ID = '30000000-0000-4000-8000-000000000001';
const OTHER_ID = '30000000-0000-4000-8000-000000000002';
const EVENT_ID = '30000000-0000-4000-8000-000000000003';

function fixture({ callbacks = true, storageBlocked = false, ackFails = false } = {}) {
  const storage = new Map();
  const events = [];
  const requests = [];
  let failAcknowledgements = ackFails;
  let candidateExists = true;
  const signupEvent = {
    userId: OWNER_ID,
    eventId: EVENT_ID,
    method: 'email_otp',
    ga4Processed: false,
    googleAdsProcessed: false,
    leaseToken: null,
    leaseExpiresAt: 0
  };

  const browserStorage = {
    getItem(key) {
      if (storageBlocked) throw new Error('storage blocked');
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      if (storageBlocked) throw new Error('storage blocked');
      storage.set(key, value);
    },
    removeItem(key) {
      if (storageBlocked) throw new Error('storage blocked');
      storage.delete(key);
    }
  };
  const browser = {
    location: {
      hostname: 'farmverb.com',
      href: 'https://farmverb.com/mypage',
      pathname: '/mypage',
      search: ''
    },
    localStorage: browserStorage,
    gtag(...args) {
      events.push(args);
      if (callbacks) args[2]?.event_callback?.();
    }
  };

  const users = {
    valid: {
      id: OWNER_ID,
      email: 'owner@example.invalid',
      email_confirmed_at: '2026-11-02T00:00:00Z',
      app_metadata: {}
    },
    other: {
      id: OTHER_ID,
      email: 'other@example.invalid',
      email_confirmed_at: '2026-11-02T00:00:00Z',
      app_metadata: {}
    },
    existing: {
      id: '30000000-0000-4000-8000-000000000004',
      email: 'existing@example.invalid',
      email_confirmed_at: '2025-01-01T00:00:00Z',
      app_metadata: {}
    },
    unconfirmed: {
      id: '30000000-0000-4000-8000-000000000005',
      email: 'unconfirmed@example.invalid',
      email_confirmed_at: null,
      app_metadata: {}
    },
    test: {
      id: '30000000-0000-4000-8000-000000000006',
      email: 'automation@example.invalid',
      email_confirmed_at: '2026-11-02T00:00:00Z',
      app_metadata: { analytics_test: true }
    }
  };

  const supabase = {
    auth: {
      async getUser(token) {
        return {
          data: { user: users[token] ?? null },
          error: users[token] ? null : { message: 'invalid token' }
        };
      }
    },
    async rpc(name, args) {
      if (name === 'reserve_signup_conversion') {
        const eligible = candidateExists
          && args.p_user_id === signupEvent.userId
          && (!signupEvent.ga4Processed || !signupEvent.googleAdsProcessed)
          && (!signupEvent.leaseToken || signupEvent.leaseExpiresAt <= Date.now());
        if (!eligible) return { data: [], error: null };
        signupEvent.leaseToken = args.p_lease_token;
        signupEvent.leaseExpiresAt = Date.now() + 60_000;
        return {
          data: [{
            event_id: signupEvent.eventId,
            signup_method: signupEvent.method,
            ga4_pending: !signupEvent.ga4Processed,
            google_ads_pending: !signupEvent.googleAdsProcessed
          }],
          error: null
        };
      }
      assert.equal(name, 'ack_signup_conversion');
      if (failAcknowledgements) {
        return { data: null, error: { message: 'synthetic ACK failure' } };
      }
      const matches = args.p_user_id === signupEvent.userId
        && args.p_event_id === signupEvent.eventId
        && args.p_lease_token === signupEvent.leaseToken;
      if (!matches || (args.p_channel !== 'ga4' && args.p_channel !== 'google_ads')) {
        return { data: false, error: null };
      }
      if (args.p_channel === 'ga4') signupEvent.ga4Processed = true;
      if (args.p_channel === 'google_ads') signupEvent.googleAdsProcessed = true;
      if (signupEvent.ga4Processed && signupEvent.googleAdsProcessed) {
        signupEvent.leaseToken = null;
        signupEvent.leaseExpiresAt = 0;
      }
      return { data: true, error: null };
    }
  };

  let route;
  const load = createSourceLoader({
    mocks: {
      'next/server': {
        NextResponse: {
          json: (body, options = {}) => Response.json(body, options)
        }
      },
      '@/lib/supabase/server': { createServerSupabaseClient: () => supabase }
    },
    globals: {
      process: { env: { VERCEL_ENV: 'production' } },
      window: browser,
      document: { title: 'Signup analytics test' },
      fetch: async (url, options = {}) => {
        assert.equal(url, '/api/auth/signup-conversions', 'no unexpected or live network requests');
        requests.push({ url, ...options });
        return route.POST(new Request(`https://farmverb.com${url}`, options));
      }
    }
  });
  route = load('app/api/auth/signup-conversions/route.ts');
  const recover = load('lib/analytics/signupRecovery.client.ts').recoverSignupAnalytics;
  const request = (body, token = 'valid', url = 'https://farmverb.com/api/auth/signup-conversions') => (
    route.POST(new Request(url, {
      method: 'POST',
      headers: token ? {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      } : { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }))
  );

  return {
    browser,
    events,
    requests,
    signupEvent,
    storage,
    load,
    recover,
    request,
    expireLease() {
      signupEvent.leaseExpiresAt = Date.now() - 1;
    },
    setAckFailure(value) {
      failAcknowledgements = value;
    },
    setCandidateExists(value) {
      candidateExists = value;
    }
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('signup conversion config is distinct from the verified purchase destination', () => {
  const config = fixture().load('lib/analytics/config.ts');
  assert.equal(config.GOOGLE_ADS_SIGNUP_SEND_TO, 'AW-18467889732/E9CNb2VrAdEMTE1uZE');
  assert.equal(config.GOOGLE_ADS_PURCHASE_SEND_TO, 'AW-18467889732/Emc7CLvCxYgdEMTEluZE');
  assert.notEqual(config.GOOGLE_ADS_SIGNUP_SEND_TO, config.GOOGLE_ADS_PURCHASE_SEND_TO);
});

test('endpoint requires canonical Production and a confirmed non-test authenticated user', async () => {
  const f = fixture();
  assert.equal((await f.request({ action: 'reserve' }, '')).status, 401);
  assert.equal((await f.request({ action: 'reserve' }, 'unconfirmed')).status, 401);
  assert.equal((await f.request({ action: 'reserve' }, 'test')).status, 401);
  assert.equal((await f.request(
    { action: 'reserve' },
    'valid',
    'https://farmverb-preview.vercel.app/api/auth/signup-conversions'
  )).status, 404);

  assert.equal((await f.recover('existing')).state, 'none');
  assert.equal(f.events.length, 0);
});

test('a verified new user emits one GA4 sign_up and one Ads conversion without PII or invented value', async () => {
  const f = fixture();
  assert.equal((await f.recover('valid')).state, 'reserved');
  await flush();

  assert.deepEqual(f.events.map((event) => event[1]), ['sign_up', 'conversion']);
  const [ga4, ads] = f.events.map((event) => event[2]);
  assert.equal(ga4.method, 'email_otp');
  assert.equal(ga4.send_to, 'G-LN0R5YFY78');
  assert.equal(ads.send_to, 'AW-18467889732/E9CNb2VrAdEMTE1uZE');
  assert.equal(ads.transaction_id, EVENT_ID);
  assert.equal('value' in ads, false);
  assert.equal('currency' in ads, false);

  const serialized = JSON.stringify(f.events);
  for (const forbidden of [OWNER_ID, 'owner@example.invalid', 'valid', '12345678', 'Bearer']) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} must not enter analytics payloads`);
  }

  assert.equal(f.signupEvent.ga4Processed, true);
  assert.equal(f.signupEvent.googleAdsProcessed, true);
  assert.equal((await f.recover('valid')).state, 'none');
  assert.equal(f.events.length, 2);
});

test('an active DB lease prevents a second tab or refresh from emitting the same signup', async () => {
  const f = fixture({ callbacks: false });
  assert.equal((await f.recover('valid')).state, 'reserved');
  assert.equal((await f.recover('valid')).state, 'none');
  assert.equal(f.events.length, 2);
  assert.equal(f.signupEvent.ga4Processed, false);
  assert.equal(f.signupEvent.googleAdsProcessed, false);
});

test('processed local markers retry a failed ACK without resending either Google event', async () => {
  const f = fixture({ ackFails: true });
  await f.recover('valid');
  await flush();
  assert.equal(f.events.length, 2);
  assert.equal(f.signupEvent.ga4Processed, false);
  assert.equal(f.signupEvent.googleAdsProcessed, false);

  f.setAckFailure(false);
  f.expireLease();
  await f.recover('valid');
  await flush();
  assert.equal(f.events.length, 2, 'locally processed channels are ACKed, not resent');
  assert.equal(f.signupEvent.ga4Processed, true);
  assert.equal(f.signupEvent.googleAdsProcessed, true);
});

test('blocked browser storage still relies on the server lease and ACK for exactly-once recovery', async () => {
  const f = fixture({ storageBlocked: true });
  await f.recover('valid');
  await flush();
  assert.equal(f.events.length, 2);
  assert.equal(f.signupEvent.ga4Processed, true);
  assert.equal(f.signupEvent.googleAdsProcessed, true);
  assert.equal((await f.recover('valid')).state, 'none');
  assert.equal(f.events.length, 2);
});

test('local, preview, page-load-only and OTP-send-only paths never call the API or Google tag', async () => {
  const f = fixture();
  assert.equal(f.events.length, 0);
  assert.equal(f.requests.length, 0);
  for (const hostname of ['localhost', '127.0.0.1', 'farmverb-preview.vercel.app']) {
    f.browser.location.hostname = hostname;
    assert.equal((await f.recover('valid')).state, 'none');
  }
  assert.equal(f.events.length, 0);
  assert.equal(f.requests.length, 0);
});

test('ACK rejects a forged owner, event, lease, and channel', async () => {
  const f = fixture({ callbacks: false });
  const lease = await (await f.request({ action: 'reserve' })).json();
  const ack = {
    action: 'ack',
    eventId: EVENT_ID,
    channel: 'ga4',
    leaseToken: lease.leaseToken
  };
  assert.equal((await f.request(ack, 'other')).status, 409);
  assert.equal((await f.request({ ...ack, eventId: 'not-a-uuid' })).status, 400);
  assert.equal((await f.request({ ...ack, leaseToken: 'not-a-uuid' })).status, 400);
  assert.equal((await f.request({ ...ack, channel: 'invalid' })).status, 400);
});
