import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../test/loadSourceModule.mjs';

function loadServer(env) {
  const calls = [];
  const client = {};
  const load = createSourceLoader({
    mocks: {
      'server-only': {},
      '@supabase/supabase-js': {
        createClient: (...args) => { calls.push(args); return client; }
      }
    },
    globals: { process: { env } }
  });
  return { calls, client, create: load('lib/supabase/server.ts').createServerSupabaseClient };
}

test('server Supabase uses the legacy key when the primary key is missing, empty or whitespace', () => {
  for (const primary of [undefined, '', ' \t\n']) {
    const fixture = loadServer({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid',
      SUPABASE_SECRET_KEY: primary,
      SUPABASE_SERVICE_ROLE_KEY: '  synthetic-legacy-key  '
    });
    assert.equal(fixture.create(), fixture.client);
    assert.equal(fixture.calls[0][1], 'synthetic-legacy-key');
    assert.equal(fixture.calls[0][2].auth.persistSession, false);
    assert.equal(fixture.calls[0][2].auth.autoRefreshToken, false);
  }
});

test('server Supabase prefers a nonblank primary key and caches the client', () => {
  const fixture = loadServer({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid',
    SUPABASE_SECRET_KEY: '  synthetic-primary-key  ',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-legacy-key'
  });
  assert.equal(fixture.create(), fixture.client);
  assert.equal(fixture.create(), fixture.client);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0][1], 'synthetic-primary-key');
});

test('server Supabase fails before client creation when both keys are missing or blank', () => {
  for (const keys of [{}, { SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: ' \n' }]) {
    const fixture = loadServer({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', ...keys });
    assert.throws(fixture.create, /Missing server Supabase environment variables/);
    assert.equal(fixture.calls.length, 0);
  }
});
