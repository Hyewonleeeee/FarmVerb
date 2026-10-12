import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../test/loadSourceModule.mjs';
import { getPendingPurchaseConversions } from './purchaseRecovery.ts';

const now = Date.now();
const claim = () => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_id: 'owner', lemon_variant_id: '2147828',
  consumed_order_id: 'verified-order', created_at: new Date(now - 10_000).toISOString(),
  analytics_recovery_enabled: true, ga4_processed_at: null, google_ads_processed_at: null,
  analytics_lease_token: null, analytics_lease_expires_at: null
});
const purchase = () => ({
  user_id: 'owner', lemon_order_id: 'verified-order', lemon_variant_id: '2147828',
  product_slug: 'nebula-crush', total_cents: 3900, currency: 'USD', status: 'paid', test_mode: false
});

test('recovery requires an exact new opted-in owned Live paid order and matching claim variant', () => {
  const baseClaim = claim();
  const basePurchase = purchase();
  assert.equal(getPendingPurchaseConversions('owner', [baseClaim], [basePurchase], now).length, 1);
  for (const patch of [
    { analytics_recovery_enabled: false }, { user_id: 'other' }, { consumed_order_id: 'other' },
    { consumed_order_id: null }, { lemon_variant_id: 'other' },
    { created_at: new Date(now - 73 * 60 * 60 * 1000).toISOString() },
    { ga4_processed_at: 'done', google_ads_processed_at: 'done' }
  ]) {
    assert.equal(getPendingPurchaseConversions('owner', [{ ...baseClaim, ...patch }], [basePurchase], now).length, 0);
  }
  for (const patch of [
    { user_id: 'other' }, { test_mode: true }, { status: 'pending' }, { status: 'refunded' },
    { status: 'partial_refund' }, { product_slug: null }, { total_cents: -1 }, { currency: 'invalid' }
  ]) {
    assert.equal(getPendingPurchaseConversions('owner', [baseClaim], [{ ...basePurchase, ...patch }], now).length, 0);
  }
  assert.equal(getPendingPurchaseConversions('owner', [baseClaim, baseClaim], [basePurchase], now).length, 1);
});

function fixture({ callbacks = true, storageBlocked = false } = {}) {
  const claims = [claim()];
  const purchases = [purchase()];
  const events = [];
  const storage = new Map();
  let rpcCount = 0;
  const makeStorage = () => ({
    getItem(key) { if (storageBlocked) throw new Error('blocked'); return storage.get(key) ?? null; },
    setItem(key, value) { if (storageBlocked) throw new Error('blocked'); storage.set(key, value); },
    removeItem(key) { if (storageBlocked) throw new Error('blocked'); storage.delete(key); }
  });
  const browser = {
    location: { hostname: 'farmverb.com', pathname: '/mypage', search: '', href: 'https://farmverb.com/mypage' },
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    gtag(...args) { events.push(args); if (callbacks) args[2]?.event_callback?.(); }
  };
  const supabase = {
    auth: { async getUser(token) { return { data: { user: token === 'valid' ? { id: 'owner' } : token === 'other' ? { id: 'other' } : null }, error: null }; } },
    from(table) {
      const filters = [];
      let update = null;
      let single = false;
      const query = {
        select() { return query; },
        eq(field, value) { filters.push(row => row[field] === value); return query; },
        not(field, _op, value) { filters.push(row => row[field] !== value); return query; },
        gte(field, value) { filters.push(row => row[field] >= value); return query; },
        or() { filters.push(row => !row.ga4_processed_at || !row.google_ads_processed_at); return query; },
        in(field, values) { filters.push(row => values.includes(row[field])); return query; },
        order() { return query; }, limit() { return query; },
        update(values) { update = values; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          const rows = (table === 'purchases' ? purchases : claims).filter(row => filters.every(filter => filter(row)));
          if (update) rows.forEach(row => Object.assign(row, update));
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
        }
      };
      return query;
    },
    async rpc(name, args) {
      assert.equal(name, 'lease_purchase_analytics');
      rpcCount++;
      const row = claims.find(candidate => candidate.id === args.p_claim_id && candidate.user_id === args.p_user_id);
      const acquired = row && (!row.analytics_lease_expires_at || row.analytics_lease_expires_at < Date.now());
      if (acquired) {
        row.analytics_lease_token = args.p_lease_token;
        row.analytics_lease_expires_at = Date.now() + 60_000;
      }
      return { data: Boolean(acquired), error: null };
    }
  };
  let route;
  const requests = [];
  const load = createSourceLoader({
    mocks: {
      'server-only': {},
      'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } },
      '@/lib/supabase/server': { createServerSupabaseClient: () => supabase }
    },
    globals: {
      window: browser, document: { title: 'Offline recovery test' },
      fetch: async (url, options = {}) => {
        assert.equal(url, '/api/checkout/conversions', 'no live or unexpected network requests');
        requests.push({ url, ...options });
        const request = new Request(`https://offline.invalid${url}`, options);
        return (options.method === 'POST' ? route.POST : route.GET)(request);
      }
    }
  });
  route = load('app/api/checkout/conversions/route.ts');
  const recover = load('lib/analytics/purchaseRecovery.client.ts').recoverPurchaseAnalytics;
  const request = (method, body, token = 'valid') => route[method](new Request('https://offline.invalid/api/checkout/conversions', {
    method, headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {})
  }));
  return { claims, purchases, events, browser, request, recover, load, requests, rpcCount: () => rpcCount };
}

test('conversion endpoint authenticates and never returns another customer or historical purchase', async () => {
  const f = fixture();
  assert.equal((await f.request('GET', null, '')).status, 401);
  assert.deepEqual((await (await f.request('GET', null, 'other')).json()).conversions, []);
  f.claims[0].analytics_recovery_enabled = false;
  assert.deepEqual((await (await f.request('GET')).json()).conversions, []);
  assert.equal((await f.request('POST', { action: 'lease', orderId: 'verified-order' })).status, 404);
  assert.equal(f.rpcCount(), 0);
});

test('server lease prevents two tabs from sending at once and ACK requires its exact owner/order/token', async () => {
  const f = fixture();
  const results = await Promise.all([
    f.request('POST', { action: 'lease', orderId: 'verified-order' }),
    f.request('POST', { action: 'lease', orderId: 'verified-order' })
  ]);
  const payloads = await Promise.all(results.map(response => response.json()));
  assert.equal(payloads.filter(payload => payload.leaseToken).length, 1);
  const lease = payloads.find(payload => payload.leaseToken);
  const ack = { action: 'ack', orderId: 'verified-order', channel: 'ga4', leaseToken: lease.leaseToken };
  assert.equal((await f.request('POST', ack, 'other')).status, 404);
  assert.equal((await f.request('POST', { ...ack, leaseToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })).status, 409);
  assert.equal((await f.request('POST', ack)).status, 200);
  assert.ok(f.claims[0].ga4_processed_at);
  assert.equal(f.claims[0].google_ads_processed_at, null);
  f.purchases[0].status = 'refunded';
  assert.equal((await f.request('POST', { ...ack, channel: 'google_ads' })).status, 404);
});

test('ordinary later account visit recovers a delayed verified checkout even with all browser storage blocked', async () => {
  const f = fixture({ storageBlocked: true });
  f.claims[0].consumed_order_id = null;
  assert.equal((await f.recover('valid')).length, 0);
  assert.equal(f.events.length, 0);
  f.claims[0].consumed_order_id = 'verified-order';
  await f.recover('valid');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(f.events.map(event => event[1]), ['purchase', 'conversion']);
  for (const event of f.events) {
    assert.equal(event[2].transaction_id, 'verified-order');
    assert.equal(event[2].value, 39);
  }
  assert.ok(f.claims[0].ga4_processed_at);
  assert.ok(f.claims[0].google_ads_processed_at);
  await f.recover('valid');
  assert.equal(f.events.length, 2);
});

test('undelivered queue does not ACK or clear checkout intent and a competing visit cannot emit during lease', async () => {
  const f = fixture({ callbacks: false });
  const markers = f.load('lib/checkout/lemonOverlay.ts');
  markers.saveCheckoutSuccessMarker({ productName: 'Nebula Crush', openedAt: Date.now(), orderId: 'verified-order', userId: 'owner' });
  await f.recover('valid');
  await f.recover('valid');
  assert.equal(f.events.length, 2);
  assert.equal(f.claims[0].ga4_processed_at, null);
  assert.equal(f.claims[0].google_ads_processed_at, null);
  assert.ok(markers.loadCheckoutSuccessMarker('owner'));
  f.events.forEach(event => event[2].event_callback());
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(markers.loadCheckoutSuccessMarker('owner'), null);
});

test('local and preview hosts never list, lease, send or acknowledge production purchases', async () => {
  const f = fixture();
  for (const hostname of ['localhost', '127.0.0.1', 'farmverb-preview.vercel.app']) {
    f.browser.location.hostname = hostname;
    assert.equal((await f.recover('valid')).length, 0);
  }
  assert.equal(f.requests.length, 0);
  assert.equal(f.events.length, 0);
  assert.equal(f.claims[0].ga4_processed_at, null);
});

test('overlay fallback persists its prepared claim before opening hosted checkout', () => {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const browser = { localStorage: storage, sessionStorage: storage };
  const react = {
    createContext: () => ({ Provider: 'provider' }), useContext: () => null,
    useCallback: callback => callback, useEffect: () => {}, useRef: value => ({ current: value })
  };
  const load = createSourceLoader({ mocks: { react, 'next/script': { default: 'script' } }, globals: { window: browser } });
  const markers = load('lib/checkout/lemonOverlay.ts');
  markers.saveCheckoutSuccessMarker({ productName: 'Nebula Crush', openedAt: Date.now(), orderId: null, claimId: 'prepared-claim', userId: 'owner' });
  const Provider = load('components/checkout/LemonCheckoutProvider.tsx').default;
  const component = Provider({ children: null });
  assert.equal(component.props.value.openCheckout('https://example.invalid/checkout', 'Nebula Crush'), false);
  const persisted = JSON.parse(saved.get('farmverb.checkout-success.v1'));
  assert.equal(persisted.claimId, 'prepared-claim');
  assert.equal(persisted.userId, 'owner');
  assert.equal(persisted.orderId, null);
});

function myPageFixture({ search = '?checkout=success', withMarker = true, storageBlocked = false, analyticsAvailable = true, purchasePatch = {} } = {}) {
  const effects = [];
  const states = [];
  const timers = [];
  const intervals = [];
  const persisted = new Map();
  const navigation = [];
  let webhookReady = false;
  const accountPurchase = { ...purchase(), id: 'purchase-id', product_name: 'Nebula Crush', purchased_at: new Date(now).toISOString(), ...purchasePatch };
  const storage = { getItem: key => persisted.get(key) ?? null, setItem: (key, value) => persisted.set(key, value), removeItem: key => persisted.delete(key) };
  const session = { user: { id: 'owner', email: 'test@example.invalid' }, access_token: 'fixture-token' };
  const browser = {
    get localStorage() { if (storageBlocked) throw new Error('storage blocked'); return storage; },
    get sessionStorage() { if (storageBlocked) throw new Error('storage blocked'); return storage; },
    location: { search, hostname: 'farmverb.com' },
    history: { state: null, replaceState(_state, _title, url) { navigation.push(url); browser.location.search = new URL(url, 'https://farmverb.com').search; } },
    setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {},
    setInterval(callback) { intervals.push(callback); return intervals.length; }, clearInterval() {},
    addEventListener() {}, removeEventListener() {}
  };
  const load = createSourceLoader({
    globals: {
      window: browser, document: { visibilityState: 'visible' },
      fetch: async url => {
        assert.ok(url.startsWith('/api/account/purchases'));
        return { ok: true, json: async () => url === '/api/account/purchases'
          ? { purchases: webhookReady ? [accountPurchase] : [] }
          : url.endsWith('/licenses') ? { licenses: [] } : { groups: [] } };
      }
    },
    mocks: {
      react: {
        useEffect: callback => effects.push(callback), useMemo: callback => callback(), useRef: value => ({ current: value }),
        useState: value => { const cell = { value }; states.push(cell); return [value, next => { cell.value = typeof next === 'function' ? next(cell.value) : next; }]; }
      },
      'next/navigation': { useRouter: () => ({ replace() {} }) }, 'next/link': {},
      '@/components/auth/AuthPageHeader': {}, '@/components/account/MyProductsAccordion': {},
      '@/lib/cart/store': { removePurchasedCartItems() {} },
      '@/lib/analytics/purchaseRecovery.client': { recoverPurchaseAnalytics: async () => webhookReady && analyticsAvailable ? [{
        claimId: claim().id, orderId: 'verified-order', productSlug: 'nebula-crush', value: 39, currency: 'USD', ga4Pending: true, googleAdsPending: true
      }] : [] },
      '@/lib/supabase/client': { createBrowserSupabaseClient: () => ({
        from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null }) }),
        auth: { getSession: async () => ({ data: { session } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }
      }) }
    }
  });
  const markers = load('lib/checkout/lemonOverlay.ts');
  if (withMarker) markers.saveCheckoutSuccessMarker({ productName: 'Nebula Crush', openedAt: Date.now(), orderId: null, userId: 'owner', claimId: claim().id });
  load('app/mypage/page.tsx').default();
  const cleanup = effects[0]();
  return { states, timers, intervals, markers, cleanup, navigation, setWebhookReady: () => { webhookReady = true; } };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('My Account resumes after the short webhook poll expires and does not turn confirmed checkout back into delayed', async () => {
  const { states, timers, intervals, markers, cleanup, setWebhookReady } = myPageFixture();
  await flush();
  for (let index = 0; index < 6; index++) {
    assert.equal(timers.length, 1);
    timers.shift()();
    await flush();
  }
  const confirmation = states.find(cell => cell.value === 'delayed');
  assert.ok(confirmation, 'bounded poll communicates a delay');
  setWebhookReady();
  intervals[0]();
  await flush();
  assert.equal(confirmation.value, 'idle');
  assert.equal(markers.loadCheckoutSuccessMarker('owner').orderId, 'verified-order');
  assert.ok(states.some(cell => Array.isArray(cell.value) && cell.value[0]?.id === 'purchase-id'));
  cleanup();
});

test('opening then cancelling a checkout never claims payment completion on an ordinary account visit', async () => {
  const { states, timers, intervals, cleanup } = myPageFixture({ search: '' });
  await flush();
  intervals[0]();
  await flush();
  assert.equal(timers.length, 0, 'unpaid intent uses background recovery, not the success poll');
  assert.equal(states.some(cell => cell.value === 'confirming' || cell.value === 'delayed'), false);
  cleanup();
});

test('a success query with no order or claim hint cannot correlate to an unrelated recoverable order', async () => {
  const f = myPageFixture({ withMarker: false });
  f.setWebhookReady();
  await flush();
  assert.equal(f.states.some(cell => cell.value === 'confirming'), true);
  assert.equal(f.markers.loadCheckoutSuccessMarker('owner'), null);
  assert.equal(f.timers.length, 1, 'unrelated conversion does not finish confirmation');
  f.cleanup();
});

test('hard-navigation success with all storage blocked confirms only the exact owned Live order from the account API', async () => {
  const f = myPageFixture({
    search: '?checkout=success&order_id=verified-order', withMarker: false, storageBlocked: true, analyticsAvailable: false
  });
  f.setWebhookReady();
  await flush();
  assert.equal(f.states.some(cell => cell.value === 'confirming' || cell.value === 'delayed'), false);
  assert.deepEqual(f.navigation, ['/mypage']);
  assert.equal(f.timers.length, 0);
  assert.ok(f.states.some(cell => Array.isArray(cell.value) && cell.value[0]?.id === 'purchase-id'));
  f.cleanup();
});

test('a forged order return hint and a Test Mode row cannot confirm checkout when storage is blocked', async () => {
  for (const options of [
    { search: '?checkout=success&order_id=someone-elses-order' },
    { search: '?checkout=success&order_id=verified-order', purchasePatch: { test_mode: true } },
    { search: '?checkout=success&order_id=verified-order', purchasePatch: { status: 'pending' } }
  ]) {
    const f = myPageFixture({ ...options, withMarker: false, storageBlocked: true, analyticsAvailable: false });
    f.setWebhookReady();
    await flush();
    assert.equal(f.states.some(cell => cell.value === 'confirming'), true);
    assert.equal(f.navigation.length, 0);
    assert.equal(f.timers.length, 1);
    f.cleanup();
  }
});
