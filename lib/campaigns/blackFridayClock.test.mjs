import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../test/loadSourceModule.mjs';

const load = createSourceLoader();
const {
  BLACK_FRIDAY_START_MS: start, BLACK_FRIDAY_END_MS: end,
  getCampaignPhase, getCampaignRuntime, createCampaignSnapshot,
  parseCampaignSnapshot, getCampaignClockState
} = load('lib/campaigns/blackFridayClock.ts');
const liveEnv = { VERCEL_ENV: 'production', BLACK_FRIDAY_2026_ENABLED: 'true' };
const previewEnv = { NODE_ENV: 'development', NEXT_PUBLIC_BLACK_FRIDAY_PREVIEW: 'true' };

test('Korean campaign boundaries include December 1 23:59 and use an exclusive end', () => {
  assert.equal(new Date(start).toISOString(), '2026-11-19T15:00:00.000Z');
  assert.equal(new Date(end).toISOString(), '2026-12-01T15:00:00.000Z');
  assert.equal(getCampaignPhase(start - 1), 'before');
  assert.equal(getCampaignPhase(start), 'active');
  assert.equal(getCampaignPhase(end - 1), 'active');
  assert.equal(getCampaignPhase(end), 'after');
  assert.equal(getCampaignPhase(end + 1), 'after');
  assert.throws(() => getCampaignPhase(Number.NaN));
  for (const [time, expected] of [[start, '11/20/2026, 00:00'], [end, '12/02/2026, 00:00']]) {
    assert.equal(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(time), expected);
  }
});

test('Live defaults off and only the private explicit flag enables the schedule', () => {
  for (const env of [{}, { NEXT_PUBLIC_BLACK_FRIDAY_2026_ENABLED: 'true' }, { BLACK_FRIDAY_2026_ENABLED: 'false' }]) {
    const state = getCampaignRuntime({ VERCEL_ENV: 'production', ...env }, start);
    assert.equal(state.campaignEnabled, false);
    assert.equal(state.previewMode, false);
    assert.equal(state.phase, 'before');
    assert.equal(state.nextBoundaryAt, null);
  }
  for (const [now, phase, boundary] of [[start - 1, 'before', start], [start, 'active', end], [end, 'after', null]]) {
    const state = getCampaignRuntime(liveEnv, now);
    assert.equal(state.phase, phase); assert.equal(state.nextBoundaryAt, boundary);
    assert.equal(state.campaignEnabled, true); assert.equal(state.previewMode, false);
  }
});

test('Preview defaults to real injected time; phase forcing is strictly Preview-only', () => {
  const runtime = getCampaignRuntime(previewEnv, start - 1);
  assert.equal(runtime.previewMode, true); assert.equal(runtime.campaignEnabled, true);
  assert.equal(runtime.phase, 'before');
  assert.equal(createCampaignSnapshot(runtime, 'invalid').phase, 'before');
  for (const phase of ['before', 'active', 'after']) {
    const forced = createCampaignSnapshot(runtime, phase);
    assert.equal(forced.phase, phase); assert.equal(forced.forcedPhase, phase);
    assert.equal(forced.nextBoundaryAt, null);
  }
  const live = createCampaignSnapshot(getCampaignRuntime(liveEnv, start), 'after');
  assert.equal(live.phase, 'active'); assert.equal(live.forcedPhase, null);
});

test('API snapshot parser rejects mode, phase, boundary and version inconsistencies', () => {
  const valid = createCampaignSnapshot(getCampaignRuntime(liveEnv, start));
  assert.ok(parseCampaignSnapshot(valid, false));
  assert.equal(parseCampaignSnapshot(valid, true), null);
  for (const invalid of [null, {}, { ...valid, ok: false }, { ...valid, serverNowMs: 'now' },
    { ...valid, serverNowMs: Infinity }, { ...valid, phase: 'after' },
    { ...valid, forcedPhase: 'active' }, { ...valid, nextBoundaryAt: start },
    { ...valid, campaignEnabled: 'true' }, { ...valid, startsAt: 'other-deployment' },
    { ...valid, forcedPhase: undefined }]) assert.equal(parseCampaignSnapshot(invalid, false), null);
  const preview = createCampaignSnapshot(getCampaignRuntime(previewEnv, start), 'before');
  assert.ok(parseCampaignSnapshot(preview, true));
});

test('monotonic elapsed time updates presentation and expires trust at boundaries or 60 seconds', () => {
  const before = createCampaignSnapshot(getCampaignRuntime(liveEnv, start - 1_000));
  assert.equal(getCampaignClockState(before, 999).clockReady, true);
  const crossing = getCampaignClockState(before, 1_000);
  assert.equal(crossing.phase, 'active'); assert.equal(crossing.saleActive, true);
  assert.equal(crossing.clockReady, false);
  const active = createCampaignSnapshot(getCampaignRuntime(liveEnv, end - 1_000));
  assert.equal(getCampaignClockState(active, 1_000).phase, 'after');
  assert.equal(getCampaignClockState(active, 1_000).clockReady, false);
  const after = createCampaignSnapshot(getCampaignRuntime(liveEnv, end));
  assert.equal(getCampaignClockState(after, 59_999).clockReady, true);
  for (const elapsed of [60_000, -1, NaN]) assert.equal(getCampaignClockState(after, elapsed).clockReady, false);
});

function providerFixture({ preview = false, responses = [], search = '', monotonic = 100 } = {}) {
  let state; let didInitialize = false; let effect; let cleanup;
  let mono = monotonic; let wallClockCalls = 0; let nextTimer = 0;
  const timers = new Map(); const events = new Map(); const requests = [];
  const queue = [...responses];
  const windowFixture = {
    location: { search },
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: mono + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    addEventListener: (name, callback) => events.set(`window:${name}`, callback),
    removeEventListener: name => events.delete(`window:${name}`)
  };
  const documentFixture = {
    visibilityState: 'visible',
    addEventListener: (name, callback) => events.set(`document:${name}`, callback),
    removeEventListener: name => events.delete(`document:${name}`)
  };
  class BrowserDate extends Date {
    static now() { wallClockCalls += 1; throw new Error('Browser wall clock must not decide campaign state.'); }
  }
  const localLoad = createSourceLoader({
    globals: {
      window: windowFixture, document: documentFixture, performance: { now: () => mono },
      Date: BrowserDate, AbortController,
      fetch: async (url, options) => {
        requests.push({ url, options });
        const response = queue.shift();
        if (response instanceof Error || !response) throw response ?? new Error('Synthetic offline');
        if (typeof response === 'function') return response(options);
        return { ok: true, json: async () => response };
      }
    },
    mocks: {
      react: {
        createContext: () => ({ Provider: 'provider' }),
        useContext: () => state,
        useState: initial => {
          if (!didInitialize) { state = initial; didInitialize = true; }
          return [state, next => { state = typeof next === 'function' ? next(state) : next; }];
        },
        useEffect: callback => { effect = callback; }
      },
      'react/jsx-runtime': { jsx: (_tag, props) => props }
    }
  });
  const Provider = localLoad('components/campaigns/BlackFridayPreviewProvider.tsx').default;
  Provider({ enabled: preview, campaignEnabled: true, children: null });
  const flush = async () => { for (let i = 0; i < 16; i += 1) await Promise.resolve(); };
  return {
    get state() { return state; }, requests, queue, window: windowFixture, document: documentFixture,
    get wallClockCalls() { return wallClockCalls; }, get timers() { return timers; },
    start: async () => { cleanup = effect(); await flush(); },
    stop: () => cleanup?.(),
    event: async name => { events.get(name)?.(); await flush(); },
    advance: async ms => {
      mono += ms;
      const due = [...timers].filter(([, timer]) => timer.at <= mono);
      for (const [id, timer] of due) { if (timers.delete(id)) timer.callback(); }
      await flush();
    }
  };
}

test('real provider starts unready, uses server time despite a broken browser clock, and blocks stale boundaries', async () => {
  const fixture = providerFixture({ responses: [createCampaignSnapshot(getCampaignRuntime(liveEnv, end - 1_000)), new Error('offline')] });
  assert.equal(fixture.state.clockReady, false);
  await fixture.start();
  assert.equal(fixture.state.clockReady, true); assert.equal(fixture.state.saleActive, true);
  await fixture.advance(1_000);
  assert.equal(fixture.state.phase, 'after'); assert.equal(fixture.state.saleActive, false);
  assert.equal(fixture.state.clockReady, false); assert.equal(fixture.wallClockCalls, 0);
  assert.equal(fixture.requests[0].options.cache, 'no-store');
  fixture.stop(); assert.equal(fixture.timers.size, 0);
});

test('provider preserves a Preview design phase across product navigation and ignores Live URL forcing', async () => {
  const forced = createCampaignSnapshot(getCampaignRuntime(previewEnv, start - 100), 'active');
  const preview = providerFixture({ preview: true, search: '?bf=active', responses: [forced, forced] });
  await preview.start(); preview.window.location.search = '';
  await preview.event('window:focus');
  assert.deepEqual(preview.requests.map(request => request.url), ['/api/campaign/status?bf=active', '/api/campaign/status?bf=active']);
  assert.equal(preview.state.enabled, true); assert.equal(preview.state.previewMode, true);
  preview.stop();
  const live = providerFixture({ search: '?bf=active', responses: [createCampaignSnapshot(getCampaignRuntime(liveEnv, start - 100))] });
  await live.start(); assert.equal(live.requests[0].url, '/api/campaign/status');
  assert.equal(live.state.phase, 'before'); assert.equal(live.state.enabled, false);
  live.stop();
});

test('provider rejects malformed or wrong-mode data and recovers on visibility/focus after failure', async () => {
  const active = createCampaignSnapshot(getCampaignRuntime(liveEnv, start));
  const fixture = providerFixture({ responses: [{ ...active, nextBoundaryAt: null }, active, new Error('offline'), active] });
  await fixture.start(); assert.equal(fixture.state.clockReady, false);
  await fixture.event('window:focus'); assert.equal(fixture.state.clockReady, true);
  fixture.document.visibilityState = 'hidden';
  await fixture.event('document:visibilitychange'); assert.equal(fixture.state.clockReady, false);
  fixture.document.visibilityState = 'visible';
  await fixture.event('document:visibilitychange'); assert.equal(fixture.state.clockReady, false);
  await fixture.event('window:online'); assert.equal(fixture.state.clockReady, true);
  fixture.stop();
});

test('a periodic poll near the end invalidates readiness before an in-flight request can cross the boundary', async () => {
  let finish;
  const fixture = providerFixture({ responses: [
    createCampaignSnapshot(getCampaignRuntime(liveEnv, end - 31_000)),
    () => new Promise(resolve => { finish = resolve; })
  ] });
  await fixture.start(); assert.equal(fixture.state.clockReady, true);
  await fixture.advance(30_000); assert.equal(fixture.state.clockReady, false);
  await fixture.advance(1_000);
  assert.equal(fixture.state.phase, 'after', 'in-flight polling must not delay the end transition');
  assert.equal(fixture.state.saleActive, false);
  finish({ ok: true, json: async () => createCampaignSnapshot(getCampaignRuntime(liveEnv, end)) });
  await fixture.event('window:focus');
  assert.equal(fixture.state.phase, 'after');
  fixture.stop();
});

test('provider timeout revokes clock trust even if a transport does not settle after abort', async () => {
  const fixture = providerFixture({ responses: [
    createCampaignSnapshot(getCampaignRuntime(liveEnv, start)),
    () => new Promise(() => {})
  ] });
  await fixture.start(); await fixture.advance(30_000);
  assert.equal(fixture.state.clockReady, true);
  await fixture.advance(8_000);
  assert.equal(fixture.state.clockReady, false);
  fixture.stop();
});

test('a response sampled before the end cannot restore active presentation after crossing in transit', async () => {
  let finish;
  const fixture = providerFixture({ responses: [
    createCampaignSnapshot(getCampaignRuntime(liveEnv, end - 31_000)),
    () => new Promise(resolve => { finish = resolve; })
  ] });
  await fixture.start(); await fixture.advance(30_000); await fixture.advance(2_000);
  assert.equal(fixture.state.phase, 'after');
  finish({ ok: true, json: async () => createCampaignSnapshot(getCampaignRuntime(liveEnv, end - 1_000)) });
  await fixture.event('window:focus');
  assert.equal(fixture.state.phase, 'after'); assert.equal(fixture.state.clockReady, false);
  await fixture.advance(1_000);
  assert.equal(fixture.state.phase, 'after', 'retry timers must retain transit time instead of rewinding the stale snapshot');
  assert.equal(fixture.state.clockReady, false);
  fixture.stop();
});
