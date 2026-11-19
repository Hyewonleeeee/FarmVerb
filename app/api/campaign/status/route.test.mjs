import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../../../../lib/test/loadSourceModule.mjs';

const start = Date.parse('2026-11-19T15:00:00Z');
const end = Date.parse('2026-12-01T15:00:00Z');
function fixture(env, wallTime = start) {
  let mono = 100;
  class ServerDate extends Date { static now() { return wallTime; } }
  const load = createSourceLoader({
    globals: { process: { env }, Date: ServerDate, performance: { now: () => mono } },
    mocks: { 'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } } }
  });
  const route = load('app/api/campaign/status/route.ts');
  return { route, advance: ms => { mono += ms; }, get: query => route.GET(new Request(`https://synthetic.invalid/api/campaign/status${query ?? ''}`)) };
}

test('status is dynamic and private/no-store; Live defaults inactive even with a forced URL phase', async () => {
  const f = fixture({ VERCEL_ENV: 'production', NODE_ENV: 'production' });
  assert.equal(f.route.dynamic, 'force-dynamic'); assert.equal(f.route.revalidate, 0);
  const response = await f.get('?bf=active');
  assert.match(response.headers.get('Cache-Control'), /private, no-store/);
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  const data = await response.json();
  assert.equal(data.serverNowMs, start); assert.equal(data.campaignEnabled, false);
  assert.equal(data.phase, 'before'); assert.equal(data.forcedPhase, null);
});

test('Live flag enables the server schedule while keeping Preview overrides disabled', async () => {
  for (const [now, phase] of [[start - 1, 'before'], [start, 'active'], [end - 1, 'active'], [end, 'after']]) {
    const f = fixture({ VERCEL_ENV: 'production', BLACK_FRIDAY_2026_ENABLED: 'true' }, now);
    const data = await (await f.get('?bf=before')).json();
    assert.equal(data.phase, phase); assert.equal(data.previewMode, false);
    assert.equal(data.campaignEnabled, true); assert.equal(data.forcedPhase, null);
  }
});

test('Preview uses actual server time by default and accepts only the three design phases', async () => {
  const f = fixture({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/black-friday-2026', NODE_ENV: 'production' }, end);
  assert.equal((await (await f.get()).json()).phase, 'after');
  for (const phase of ['before', 'active', 'after']) {
    const data = await (await f.get(`?bf=${phase}`)).json();
    assert.equal(data.phase, phase); assert.equal(data.forcedPhase, phase);
    assert.equal(data.nextBoundaryAt, null);
  }
  assert.equal((await (await f.get('?bf=bad')).json()).forcedPhase, null);
});

test('local server clock fixture advances monotonically only in development Preview', async () => {
  const env = { NODE_ENV: 'development', NEXT_PUBLIC_BLACK_FRIDAY_PREVIEW: 'true', BLACK_FRIDAY_PREVIEW_CLOCK_START: '2026-11-19T14:59:59Z' };
  const f = fixture(env, end);
  const first = await (await f.get()).json();
  assert.equal(first.serverNowMs, start - 1_000); assert.equal(first.phase, 'before');
  f.advance(1_000);
  const second = await (await f.get()).json();
  assert.equal(second.serverNowMs, start); assert.equal(second.phase, 'active');
  for (const overrides of [
    { NODE_ENV: 'production', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/black-friday-2026' },
    { VERCEL_ENV: 'production' }, { NEXT_PUBLIC_BLACK_FRIDAY_PREVIEW: 'false' },
    { BLACK_FRIDAY_PREVIEW_CLOCK_START: '2026-11-20' }
  ]) {
    const ignored = fixture({ ...env, ...overrides }, end);
    assert.equal((await (await ignored.get()).json()).serverNowMs, end);
  }
});
