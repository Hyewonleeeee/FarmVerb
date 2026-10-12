import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLoader } from '../../../../lib/test/loadSourceModule.mjs';

// Execute the actual route with synthetic authentication/database dependencies.
// Nothing here reads .env files, calls Supabase, or contacts Lemon Squeezy.
function fixture({ verified = true, authenticated = true } = {}) {
  const rows = [
    ['legacy', null, 'email_allowed', 'paid', false, '2147845'],
    ['review', null, 'claim_review', 'paid', false, '2147845'],
    ['other-owner', 'other-user', 'linked', 'paid', false, '2147845'],
    ['refunded', null, 'email_allowed', 'refunded', false, '2147845'],
    ['test-mode', null, 'email_allowed', 'paid', true, '2147845'],
    ['unknown', null, 'email_allowed', 'paid', false, 'unknown'],
    ['owned', 'user-a', 'linked', 'paid', false, '2147845']
  ].map(([id, user_id, account_link_status, status, test_mode, lemon_variant_id]) => ({
    id, user_id, account_link_status, status, test_mode, lemon_variant_id,
    buyer_email: 'billing@example.test', lemon_order_id: id, product_name: 'Boseong Green Tea',
    purchased_at: '2026-10-13T00:00:00Z', currency: 'USD', total_cents: 2900
  }));
  let writes = 0;
  let reads = 0;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: authenticated ? {
      id: 'user-a', email: 'Billing@Example.test', email_confirmed_at: verified ? '2026-10-12T00:00:00Z' : null
    } : null }, error: null }) },
    from: (table) => {
      assert.equal(table, 'purchases');
      let patch;
      const filters = [];
      const query = {
        update: (value) => { patch = value; return query; },
        select: () => query,
        is: (key, value) => { filters.push(row => row[key] === value); return query; },
        eq: (key, value) => { filters.push(row => row[key] === value); return query; },
        in: (key, values) => { filters.push(row => values.includes(row[key])); return query; },
        order: () => query,
        then: (resolve, reject) => Promise.resolve().then(() => {
          const selected = rows.filter(row => filters.every(filter => filter(row)));
          if (patch) { writes += 1; selected.forEach(row => Object.assign(row, patch)); }
          else { reads += 1; }
          return { data: selected, error: null };
        }).then(resolve, reject)
      };
      return query;
    }
  };
  const load = createSourceLoader({
    mocks: {
      'next/server': { NextResponse: { json: (body, init = {}) => Response.json(body, init) } },
      '@/lib/supabase/server': { createServerSupabaseClient: () => supabase }
    }
  });
  const exports = load('app/api/account/purchases/route.ts');
  return { rows, GET: exports.GET, counts: () => ({ reads, writes }) };
}

const request = () => new Request('https://example.test/api/account/purchases', {
  headers: { authorization: 'Bearer synthetic-session' }
});

test('verified billing email links only explicitly eligible live catalog orders', async () => {
  const f = fixture();
  const response = await f.GET(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.deepEqual((await response.json()).purchases.map(row => row.id), ['legacy', 'owned']);
  assert.equal(f.rows.find(row => row.id === 'legacy').account_link_status, 'linked');
  assert.equal(f.rows.find(row => row.id === 'review').user_id, null);
  assert.equal(f.rows.find(row => row.id === 'other-owner').user_id, 'other-user');
  assert.deepEqual(f.counts(), { reads: 1, writes: 1 });
});

test('unverified email cannot acquire purchases but existing ownership remains readable', async () => {
  const f = fixture({ verified: false });
  const response = await f.GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).purchases.map(row => row.id), ['owned']);
  assert.deepEqual(f.counts(), { reads: 1, writes: 0 });
});

test('invalid sessions never read or mutate purchase records', async () => {
  const f = fixture({ authenticated: false });
  assert.equal((await f.GET(request())).status, 401);
  assert.deepEqual(f.counts(), { reads: 0, writes: 0 });
});
