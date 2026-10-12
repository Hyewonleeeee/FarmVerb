import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../test/loadSourceModule.mjs';

class FixtureApiError extends Error {
  constructor(status) {
    super('Synthetic upstream error');
    this.status = status;
    this.retryAfter = null;
  }
}

function setup({ failure = null, userId = 'owner', orderStatus = 'paid', orderMode = false } = {}) {
  const calls = [];
  let fail = failure;
  let purchase;
  const license = (id) => ({
    id,
    attributes: { order_id: 'order-42', order_item_id: 'item-1', key: `TEST-ONLY-${id}`, instances_count: 1 }
  });
  const apiRequest = async (requestPath) => {
    const url = new URL(requestPath, 'https://fixture.invalid');
    calls.push(url.pathname);
    if (url.pathname === fail || (fail === 'first-device' && url.searchParams.get('filter[license_key_id]') === 'key-1')) {
      throw new FixtureApiError(503);
    }
    if (url.pathname === '/orders/order-42') {
      return { data: { id: 'order-42', attributes: { status: orderStatus, test_mode: orderMode, store_id: 7 } } };
    }
    if (url.pathname === '/license-keys') {
      return { data: [license('key-1'), license('key-2'), {
        id: 'foreign-key', attributes: { order_id: 'another-order', key: 'DO-NOT-RETURN' }
      }] };
    }
    if (url.pathname === '/order-items') {
      return { data: [{ id: 'item-1', attributes: { order_id: 'order-42', product_name: 'Fixture Product' } }] };
    }
    if (url.pathname === '/license-key-instances') {
      const licenseId = url.searchParams.get('filter[license_key_id]');
      return { data: [{ id: `instance-${licenseId}`, attributes: {
        license_key_id: licenseId, identifier: `device-${licenseId}`, name: 'Fixture device'
      } }] };
    }
    throw new Error(`Unexpected fixture path ${url.pathname}`);
  };
  const load = createSourceLoader({
    globals: { process: { env: { LEMON_STORE_ID: '7' } } },
    mocks: {
      'server-only': {},
      'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
      '@/lib/payments/lemonApi.server': {
        LemonApiError: FixtureApiError,
        lemonApiRequest: apiRequest,
        lemonLicenseApiRequest: () => { throw new Error('Unexpected device mutation'); }
      },
      '@/lib/supabase/server': {
        createServerSupabaseClient: () => ({
          auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
          from: () => {
            const filters = [];
            return {
              select() { return this; },
              eq(key, value) { filters.push([key, value]); return this; },
              maybeSingle: async () => ({
                data: filters.every(([key, value]) => purchase[key] === value) ? purchase : null,
                error: null
              })
            };
          }
        })
      }
    }
  });
  const product = load('lib/products/catalog.ts').OFFICIAL_PRODUCT_CATALOG[0];
  purchase = {
    id: 'purchase-42', user_id: 'owner', product_slug: product.slug,
    product_name: product.name, total_cents: 2900, currency: 'USD', purchased_at: '2026-10-13T00:00:00.000Z',
    lemon_order_id: 'order-42', lemon_variant_id: product.lemonVariantId, status: 'paid', test_mode: false
  };
  const request = () => new Request('https://fixture.invalid/account', { headers: { Authorization: 'Bearer fixture-token' } });
  const context = { params: Promise.resolve({ purchaseId: purchase.id, licenseId: 'key-1' }) };
  return { load, calls, purchase, request, context, setFailure: (value) => { fail = value; } };
}

test('verified keys remain available when one device list fails, and that device list can be retried', async () => {
  const fixture = setup({ failure: 'first-device' });
  const route = fixture.load('app/api/account/purchases/[purchaseId]/licenses/route.ts');
  const response = await route.GET(fixture.request(), fixture.context);
  assert.equal(response.status, 200);
  assert.equal(response.body.licenses.length, 2);
  const [first, second] = response.body.licenses;
  assert.equal(first.key, 'TEST-ONLY-key-1');
  assert.match(first.instancesError, /temporarily unavailable/);
  assert.equal(first.instances.length, 0);
  assert.equal(first.instancesCount, 1);
  assert.equal(second.instancesError, null);
  assert.equal(second.instances[0].identifier, 'device-key-2');

  fixture.setFailure(null);
  const retryRoute = fixture.load('app/api/account/purchases/[purchaseId]/licenses/[licenseId]/instances/route.ts');
  const retry = await retryRoute.GET(fixture.request(), fixture.context);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.instances[0].identifier, 'device-key-1');
});

test('optional order item metadata failure does not hide keys or working device lists', async () => {
  const fixture = setup({ failure: '/order-items' });
  const response = await fixture.load('app/api/account/purchases/[purchaseId]/licenses/route.ts').GET(fixture.request(), fixture.context);
  assert.equal(response.status, 200);
  assert.equal(response.body.licenses[0].key, 'TEST-ONLY-key-1');
  assert.equal(response.body.licenses[0].productName, null);
  assert.equal(response.body.licenses[0].instancesError, null);
});

test('required license key verification failures still fail closed', async () => {
  const fixture = setup({ failure: '/license-keys' });
  const response = await fixture.load('app/api/account/purchases/[purchaseId]/licenses/route.ts').GET(fixture.request(), fixture.context);
  assert.equal(response.status, 502);
  assert.equal(response.body.licenses, undefined);
});

test('missing authentication and foreign purchase ownership do not expose keys', async () => {
  const fixture = setup({ userId: 'another-user' });
  const route = fixture.load('app/api/account/purchases/[purchaseId]/licenses/route.ts');
  assert.equal((await route.GET(new Request('https://fixture.invalid'), fixture.context)).status, 401);
  assert.equal((await route.GET(fixture.request(), fixture.context)).status, 404);
  assert.equal(fixture.calls.length, 0);
});

for (const options of [{ orderStatus: 'refunded' }, { orderMode: true }]) {
  test(`Lemon order eligibility remains enforced: ${JSON.stringify(options)}`, async () => {
    const fixture = setup(options);
    const response = await fixture.load('app/api/account/purchases/[purchaseId]/licenses/route.ts').GET(fixture.request(), fixture.context);
    assert.equal(response.status, 409);
    assert.equal(response.body.licenses, undefined);
    assert.equal(fixture.calls.includes('/license-keys'), false);
  });
}

test('retry and device mutation preserve license and device ownership checks', async () => {
  const fixture = setup();
  const route = fixture.load('app/api/account/purchases/[purchaseId]/licenses/[licenseId]/instances/route.ts');
  const foreignContext = { params: Promise.resolve({ purchaseId: fixture.purchase.id, licenseId: 'foreign-key' }) };
  assert.equal((await route.GET(fixture.request(), foreignContext)).status, 404);
  const request = new Request('https://fixture.invalid', {
    method: 'DELETE', headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ instanceIdentifier: 'foreign-device' })
  });
  const result = await route.DELETE(request, fixture.context);
  assert.equal(result.status, 404);
  assert.equal(result.body.errorCode, 'INSTANCE_NOT_FOUND');
});

test('My Account keeps the key visible, reports the device failure truthfully, and retries the protected endpoint', async () => {
  const fixture = setup({ failure: 'first-device' });
  const effects = [];
  const states = [];
  let stateIndex = 0;
  let retryRequests = 0;
  const session = { user: { id: 'owner', email: 'fixture@example.invalid' }, access_token: 'fixture-token' };
  const ui = createSourceLoader({
    globals: {
      window: {
        location: { search: '' },
        setInterval: () => 1,
        clearInterval() {},
        addEventListener() {},
        removeEventListener() {}
      },
      fetch: async (url, options = {}) => {
        if (url === '/api/account/purchases') {
          return { ok: true, json: async () => ({ purchases: [fixture.purchase] }) };
        }
        if (url.endsWith('/downloads')) {
          return { ok: true, json: async () => ({ groups: [] }) };
        }
        const retry = url.endsWith('/instances');
        if (retry) retryRequests += 1;
        const routePath = retry
          ? 'app/api/account/purchases/[purchaseId]/licenses/[licenseId]/instances/route.ts'
          : 'app/api/account/purchases/[purchaseId]/licenses/route.ts';
        const response = await fixture.load(routePath).GET(new Request(`https://fixture.invalid${url}`, options), fixture.context);
        return { ok: response.status === 200, json: async () => response.body };
      }
    },
    mocks: {
      'react': {
        useEffect: (callback) => effects.push(callback),
        useMemo: (callback) => callback(),
        useRef: (value) => ({ current: value }),
        useState: (initial) => {
          const index = stateIndex++;
          states[index] ??= { value: initial };
          return [states[index].value, (next) => {
            states[index].value = typeof next === 'function' ? next(states[index].value) : next;
          }];
        }
      },
      'next/navigation': { useRouter: () => ({ replace() {} }) },
      'next/link': { default: 'link' },
      '@/components/auth/AuthPageHeader': { default: 'header' },
      '@/components/account/MyProductsAccordion': { default: 'accordion' },
      '@/lib/analytics/purchaseRecovery.client': { recoverPurchaseAnalytics: async () => [] },
      '@/lib/supabase/client': {
        createBrowserSupabaseClient: () => ({
          from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null }) }),
          auth: {
            getSession: async () => ({ data: { session } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
          }
        })
      }
    }
  });
  const MyPage = ui('app/mypage/page.tsx').default;
  const render = () => { stateIndex = 0; return MyPage(); };
  const nodes = (value) => {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (value && typeof value === 'object') return [value, ...nodes(value.props?.children)];
    return value === null || value === undefined ? [] : [value];
  };
  render();
  effects.forEach((callback) => callback());
  await new Promise((resolve) => setImmediate(resolve));
  const firstNodes = nodes(render());
  const firstText = firstNodes.filter((node) => typeof node === 'string').join(' ');
  assert.match(firstText, /TEST-ONLY-key-1/);
  assert.match(firstText, /temporarily unavailable/);
  assert.doesNotMatch(firstText, /No devices are currently associated/);
  const retry = firstNodes.find((node) => node?.type === 'button' && node.props.children === 'Retry devices');
  assert.ok(retry);
  fixture.setFailure(null);
  retry.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  const retriedText = nodes(render()).filter((node) => typeof node === 'string').join(' ');
  assert.equal(retryRequests, 1);
  assert.match(retriedText, /TEST-ONLY-key-1/);
  assert.match(retriedText, /device-key-1/);
  assert.doesNotMatch(retriedText, /temporarily unavailable|Retry devices/);
});
