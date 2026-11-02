import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db = new PGlite({ extensions: { pgcrypto } });
const historicalUser = '20000000-0000-4000-8000-000000000001';
const newUser = '20000000-0000-4000-8000-000000000002';
const unconfirmedUser = '20000000-0000-4000-8000-000000000003';
const testUser = '20000000-0000-4000-8000-000000000004';
const recoveryUser = '20000000-0000-4000-8000-000000000005';

const migration = readFileSync(
  new URL('./202611020001_create_signup_conversion_tracking.sql', import.meta.url),
  'utf8'
);

async function reserve(userId, leaseToken = randomUUID()) {
  await db.exec('set role service_role');
  try {
    const result = await db.query(
      'select * from public.reserve_signup_conversion($1, $2)',
      [userId, leaseToken]
    );
    return { rows: result.rows, leaseToken };
  } finally {
    await db.exec('reset role');
  }
}

async function acknowledge(userId, eventId, leaseToken, channel) {
  await db.exec('set role service_role');
  try {
    return (await db.query(
      'select public.ack_signup_conversion($1, $2, $3, $4) as acknowledged',
      [userId, eventId, leaseToken, channel]
    )).rows[0].acknowledged;
  } finally {
    await db.exec('reset role');
  }
}

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      created_at timestamptz not null default now(),
      email_confirmed_at timestamptz,
      raw_app_meta_data jsonb not null default '{}'::jsonb
    );
    create table public.synthetic_profiles (id uuid primary key);
    create function public.synthetic_profile_trigger()
    returns trigger language plpgsql as $$
    begin
      insert into public.synthetic_profiles (id) values (new.id);
      return new;
    end;
    $$;
    create trigger existing_auth_profile_trigger
      after insert on auth.users
      for each row execute function public.synthetic_profile_trigger();
    insert into auth.users (id, created_at, email_confirmed_at)
      values ('${historicalUser}', '2020-01-01T00:00:00Z', now());
  `);

  await db.exec(migration);
  await db.exec(`
    insert into auth.users (id, email_confirmed_at)
      values ('${newUser}', now());
    insert into auth.users (id)
      values ('${unconfirmedUser}');
    insert into auth.users (id, email_confirmed_at, raw_app_meta_data)
      values ('${testUser}', now(), '{"analytics_test": true}'::jsonb);
    insert into auth.users (id, email_confirmed_at)
      values ('${recoveryUser}', now());
  `);
});

after(async () => {
  await db.close();
});

test('migration adds no Auth trigger and preserves the existing profile trigger', async () => {
  const triggers = (await db.query(`
    select tgname from pg_trigger
    where tgrelid = 'auth.users'::regclass and not tgisinternal
    order by tgname
  `)).rows.map((row) => row.tgname);
  assert.deepEqual(triggers, ['existing_auth_profile_trigger']);
  const profiles = (await db.query('select id from public.synthetic_profiles order by id')).rows;
  assert.deepEqual(profiles.map((row) => row.id), [
    historicalUser,
    newUser,
    unconfirmedUser,
    testUser,
    recoveryUser
  ]);
});

test('historical, unconfirmed, and server-marked test users never become conversions', async () => {
  for (const userId of [historicalUser, unconfirmedUser, testUser]) {
    assert.deepEqual((await reserve(userId)).rows, []);
  }
  assert.equal((await db.query(`
    select count(*)::int as count from public.signup_conversion_events
    where user_id in ($1, $2, $3)
  `, [historicalUser, unconfirmedUser, testUser])).rows[0].count, 0);
});

test('a future email-confirmed Auth user gets one stable event and one active lease', async () => {
  const first = await reserve(newUser);
  assert.equal(first.rows.length, 1);
  assert.equal(first.rows[0].signup_method, 'email_otp');
  assert.equal(first.rows[0].ga4_pending, true);
  assert.equal(first.rows[0].google_ads_pending, true);

  assert.deepEqual((await reserve(newUser)).rows, []);
  const stored = (await db.query(`
    select event_id, count(*) over ()::int as count
    from public.signup_conversion_events where user_id = $1
  `, [newUser])).rows[0];
  assert.equal(stored.event_id, first.rows[0].event_id);
  assert.equal(stored.count, 1);
});

test('channel ACKs require the exact owner, event and lease and stop future delivery', async () => {
  const row = (await db.query(`
    select event_id, analytics_lease_token from public.signup_conversion_events
    where user_id = $1
  `, [newUser])).rows[0];
  assert.equal(await acknowledge(newUser, row.event_id, randomUUID(), 'ga4'), false);
  assert.equal(await acknowledge(historicalUser, row.event_id, row.analytics_lease_token, 'ga4'), false);
  assert.equal(await acknowledge(newUser, row.event_id, row.analytics_lease_token, 'invalid'), false);
  assert.equal(await acknowledge(newUser, row.event_id, row.analytics_lease_token, 'ga4'), true);
  assert.equal(await acknowledge(newUser, row.event_id, row.analytics_lease_token, 'google_ads'), true);

  const stored = (await db.query(`
    select ga4_processed_at, google_ads_processed_at, analytics_lease_token
    from public.signup_conversion_events where user_id = $1
  `, [newUser])).rows[0];
  assert.ok(stored.ga4_processed_at);
  assert.ok(stored.google_ads_processed_at);
  assert.equal(stored.analytics_lease_token, null);
  assert.deepEqual((await reserve(newUser)).rows, []);
});

test('an expired lease is recoverable without creating a second event', async () => {
  const first = await reserve(recoveryUser);
  assert.equal(first.rows.length, 1);
  await db.query(`
    update public.signup_conversion_events
    set analytics_lease_expires_at = now() - interval '1 second'
    where user_id = $1
  `, [recoveryUser]);
  const second = await reserve(recoveryUser);
  assert.equal(second.rows.length, 1);
  assert.equal(second.rows[0].event_id, first.rows[0].event_id);
  assert.notEqual(second.leaseToken, first.leaseToken);
});

test('browser roles cannot inspect signup state or execute conversion RPCs', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(
        db.query('select * from public.signup_conversion_events'),
        /permission denied/
      );
      await assert.rejects(
        db.query('select * from public.reserve_signup_conversion($1, $2)', [newUser, randomUUID()]),
        /permission denied/
      );
      await assert.rejects(
        db.query('select public.ack_signup_conversion($1, $2, $3, $4)', [
          newUser,
          randomUUID(),
          randomUUID(),
          'ga4'
        ]),
        /permission denied/
      );
    } finally {
      await db.exec('reset role');
    }
  }
});

test('deleting an Auth user cascades only that user signup delivery state', async () => {
  const eventCountBefore = (await db.query(
    'select count(*)::int as count from public.signup_conversion_events where user_id = $1',
    [recoveryUser]
  )).rows[0].count;
  assert.equal(eventCountBefore, 1);
  await db.query('delete from auth.users where id = $1', [recoveryUser]);
  assert.equal((await db.query(
    'select count(*)::int as count from public.signup_conversion_events where user_id = $1',
    [recoveryUser]
  )).rows[0].count, 0);
});
