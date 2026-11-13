import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../test/loadSourceModule.mjs';

const verifiedResponse = {
  ok: true,
  checkoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/custom/synthetic-checkout',
  claimId: 'synthetic-claim', verifiedPriceCents: 2500, currency: 'USD', phase: 'active'
};

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

// Exercise the component's real handlers with persistent minimal hook state.
// No DOM, browser automation, account service or external request is involved.
function fixture(options = {}) {
  const context = { enabled: false, campaignEnabled: true, phase: 'active', clockReady: true, ...options.context };
  const slots = [];
  let cursor = 0;
  let completeFetch;
  const calls = { auth: 0, requests: [], opens: [], redirects: [], begins: [], markers: [] };
  const hooks = {
    useId: () => 'synthetic-modal',
    useCallback: callback => callback,
    useRef: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useEffect: (effect, dependencies) => {
      const index = cursor++;
      if (!(index in slots)) {
        slots[index] = { dependencies, cleanup: effect() };
      }
    }
  };
  const load = createSourceLoader({
    globals: {
      window: { location: { pathname: '/plugins', search: '', hash: '', assign: url => calls.redirects.push(url) } },
      fetch: async (url, init) => {
        assert.equal(url, '/api/checkout/session');
        calls.requests.push({ method: init.method, body: JSON.parse(init.body), cache: init.cache });
        if (options.deferred) await new Promise(resolve => { completeFetch = resolve; });
        return Response.json(options.response ?? verifiedResponse, { status: options.status ?? 200 });
      }
    },
    mocks: {
      react: hooks,
      '@/components/campaigns/BlackFridayPreviewProvider': { useBlackFridayPreview: () => context },
      '@/components/checkout/CheckoutAccountConfirmationModal': { default: () => null },
      '@/components/checkout/LemonCheckoutProvider': { useLemonCheckout: () => ({ openCheckout: (...args) => {
        calls.opens.push(args);
        return true;
      } }) },
      '@/lib/supabase/client': { createBrowserSupabaseClient: () => ({ auth: { getSession: async () => {
        calls.auth += 1;
        return { data: { session: { access_token: 'synthetic-session', user: { id: 'synthetic-user', email: 'synthetic@example.invalid' } } } };
      } } }) },
      '@/lib/analytics/products': { getAnalyticsProductByName: () => ({
        productName: 'Nebula Drift', productSlug: 'nebula-drift', productCategory: 'Audio Plugin',
        productSeries: 'Nebula Series', price: 999, currency: 'USD'
      }) },
      '@/lib/analytics/ecommerce': {
        queueBuyNowClickForNextPage: () => true,
        trackBuyNowClick: () => {},
        trackBeginCheckout: product => calls.begins.push(product)
      },
      '@/lib/checkout/lemonOverlay': { saveCheckoutSuccessMarker: marker => calls.markers.push(marker) }
    }
  });
  const Component = load('components/checkout/LemonCheckoutLink.tsx').default;
  const render = () => {
    cursor = 0;
    const tree = Component({ productName: 'Nebula Drift' });
    return tree.type === 'button'
      ? { button: tree, modal: null }
      : { button: tree.props.children[0], modal: tree.props.children[1] };
  };
  return {
    context, calls, render,
    unmount: () => { for (const slot of slots) if (typeof slot?.cleanup === 'function') slot.cleanup(); },
    complete: async () => { assert.equal(typeof completeFetch, 'function'); completeFetch(); await settle(); },
    start: async () => {
      const initial = render();
      assert.equal(initial.button.props.disabled, false);
      initial.button.props.onClick();
      await settle();
      const confirmed = render();
      assert.equal(confirmed.modal.props.email, 'synthetic@example.invalid');
      confirmed.modal.props.onContinue();
      await settle();
    }
  };
}

test('Preview and an unready campaign clock disable checkout without auth or network', async () => {
  const preview = fixture({ context: { enabled: true } });
  assert.equal(preview.render().button.props.disabled, true);
  assert.equal(preview.render().button.props.onClick, undefined);
  const unready = fixture({ context: { clockReady: false } });
  const pending = unready.render();
  assert.equal(pending.button.props.disabled, true);
  pending.button.props.onClick();
  await settle();
  for (const { calls } of [preview, unready]) {
    assert.equal(calls.auth + calls.requests.length + calls.opens.length, 0);
  }
});

test('Live request carries mandatory displayed price and phase, then tracks the verified cents', async () => {
  const instance = fixture();
  await instance.start();
  assert.deepEqual(JSON.parse(JSON.stringify(instance.calls.requests[0])), {
    method: 'POST', body: { productName: 'Nebula Drift', expectedPriceCents: 2500, expectedPhase: 'active' }, cache: 'no-store'
  });
  assert.equal(instance.calls.opens.length, 1);
  assert.equal(instance.calls.opens[0][0], verifiedResponse.checkoutUrl);
  assert.equal(instance.calls.begins[0].price, 25);
  assert.equal(instance.calls.markers[0].claimId, 'synthetic-claim');
});

test('mismatched or missing verification fields never open checkout or emit begin_checkout', async () => {
  for (const response of [
    { ...verifiedResponse, verifiedPriceCents: 2600 },
    { ...verifiedResponse, verifiedPriceCents: undefined },
    { ...verifiedResponse, currency: 'EUR' },
    { ...verifiedResponse, phase: 'before' }
  ]) {
    const instance = fixture({ response });
    await instance.start();
    assert.equal(instance.calls.opens.length + instance.calls.redirects.length + instance.calls.begins.length + instance.calls.markers.length, 0);
    assert.match(instance.render().modal.props.error, /price has been updated/i);
  }
});

test('price error responses keep the account modal open and never use a fixed checkout fallback', async () => {
  for (const [code, status, message] of [
    ['PRICE_CHANGED', 409, /price has been updated/i],
    ['PRICE_CHECK_UNAVAILABLE', 503, /confirming the current price/i]
  ]) {
    const instance = fixture({ response: { ok: false, code }, status });
    await instance.start();
    assert.equal(instance.calls.opens.length + instance.calls.redirects.length + instance.calls.begins.length, 0);
    const modal = instance.render().modal;
    assert.equal(modal.props.email, 'synthetic@example.invalid');
    assert.match(modal.props.error, message);
  }
});

test('phase change or expired clock while the request is pending prevents opening the old checkout', async () => {
  for (const mutation of [{ phase: 'after' }, { clockReady: false }]) {
    const instance = fixture({ deferred: true });
    await instance.start();
    assert.equal(instance.calls.requests.length, 1);
    Object.assign(instance.context, mutation);
    instance.render();
    await instance.complete();
    assert.equal(instance.calls.opens.length + instance.calls.begins.length, 0);
    assert.match(instance.render().modal.props.error, /price has been updated/i);
  }
});

test('both campaign-mode transitions while a request is pending reject the prior response', async () => {
  for (const wasEnabled of [true, false]) {
    const instance = fixture({
      deferred: true,
      context: { campaignEnabled: wasEnabled, phase: 'before' },
      response: { ...verifiedResponse, verifiedPriceCents: 4900, phase: 'before' }
    });
    await instance.start();
    instance.context.campaignEnabled = !wasEnabled;
    instance.render();
    await instance.complete();
    assert.equal(instance.calls.opens.length + instance.calls.begins.length, 0);
    assert.match(instance.render().modal.props.error, /price has been updated/i);
  }
});

test('unmounting the price panel while checkout is pending cannot open an orphaned checkout', async () => {
  const instance = fixture({ deferred: true });
  await instance.start();
  assert.equal(instance.calls.requests.length, 1);
  instance.unmount();
  await instance.complete();
  assert.equal(instance.calls.opens.length + instance.calls.redirects.length + instance.calls.begins.length + instance.calls.markers.length, 0);
});

test('flag-off checkout preserves the legacy request and successful opening', async () => {
  const instance = fixture({
    context: { campaignEnabled: false },
    response: { ok: true, checkoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/synthetic', claimId: 'synthetic-claim' }
  });
  await instance.start();
  assert.deepEqual(JSON.parse(JSON.stringify(instance.calls.requests[0].body)), { productName: 'Nebula Drift' });
  assert.equal(instance.calls.opens.length, 1);
  assert.equal(instance.calls.begins[0].price, 999);
});
