import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { consumeAccountClaimHash } from '../lib/checkout/accountClaim.ts';
import { getOfficialProductByLiveVariantId } from '../lib/products/catalog.ts';
import { normalizeLemonOrder } from '../lib/payments/lemonWebhook.ts';
import { processVerifiedRefund } from '../lib/payments/lemonRefund.ts';
import { createPaymentRepository } from '../lib/payments/paymentRepository.ts';
import { processPaymentEvent } from '../lib/payments/paymentProcessing.ts';

export function parseRecoveryArgs(args) {
  const [command = 'status', ...flags] = args;
  if (!['status', 'replay', 'reconcile'].includes(command)) throw new Error('Use status, replay, or reconcile.');
  const options = { command, apply: false, check: false, eventId: null, orderId: null };
  const seen = new Set();
  for (let i = 0; i < flags.length; i += 1) {
    const flag = flags[i];
    if (seen.has(flag)) throw new Error('Duplicate option.');
    seen.add(flag);
    if (flag === '--apply') options.apply = true;
    else if (flag === '--check') options.check = true;
    else if (flag === '--event-id' || flag === '--order-id') {
      const value = flags[++i];
      if (!value) throw new Error('An identifier is required.');
      if (flag === '--event-id' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('Invalid event ID.');
      if (flag === '--order-id' && !/^\d{1,30}$/.test(value)) throw new Error('Invalid order ID.');
      options[flag === '--event-id' ? 'eventId' : 'orderId'] = value;
    } else throw new Error('Unknown option.');
  }
  if (options.eventId && options.orderId) throw new Error('Choose one event or order ID.');
  if (command === 'status' && options.apply) throw new Error('Status is read-only.');
  if (command !== 'status' && options.check) throw new Error('Only status supports --check.');
  if (command === 'replay' && !options.eventId) throw new Error('Replay requires --event-id.');
  if (command === 'reconcile' && !options.orderId) throw new Error('Reconcile requires --order-id.');
  return options;
}

const publicEvent = (event) => ({
  eventId: event.id,
  orderId: event.lemon_order_id,
  eventName: event.event_name,
  state: event.state,
  reason: event.reason,
  ...(event.attempts !== undefined ? { attempts: event.attempts } : {})
});
const publicResult = (result) => ({ state: result.state, reason: result.reason ?? null, duplicate: Boolean(result.duplicate) });

// All writes are behind an explicit apply check. Dependencies make dry-run
// safety testable without credentials or any live network request.
export async function runRecovery(options, dependencies) {
  if (options.command === 'status') {
    return { mode: 'read-only', events: (await dependencies.listEvents(options)).map(publicEvent), limit: 100 };
  }
  if (options.command === 'replay') {
    const event = await dependencies.getEvent(options.eventId);
    if (!options.apply) return { mode: 'dry-run', action: 'replay', event: publicEvent(event) };
    return { mode: 'apply', action: 'replay', eventId: event.id, ...publicResult(await dependencies.process(event)) };
  }
  const order = await dependencies.getOrder(options.orderId);
  if (order.lemonOrderId !== options.orderId || order.testMode || order.storeId !== dependencies.storeId) {
    throw new Error('Order identity, store, or Live Mode verification failed.');
  }
  const comparison = await dependencies.compareOrder(options.orderId);
  const summary = {
    orderId: order.lemonOrderId,
    providerStatus: order.status,
    purchasePresent: Boolean(comparison.purchase),
    purchaseStatus: comparison.purchase?.status ?? null,
    accountLinked: Boolean(comparison.purchase?.user_id),
    eventCount: comparison.events.length,
    productMapped: Boolean(getOfficialProductByLiveVariantId(order.lemonVariantId))
  };
  if (!options.apply) return { mode: 'dry-run', action: 'reconcile', ...summary };

  // Only reuse claim evidence from a previously signature-verified webhook for
  // this exact order. The provider Orders API itself carries no checkout claim.
  const evidence = comparison.events.filter((event) => event.source === 'webhook'
    && event.lemon_order_id === order.lemonOrderId
    && event.order_data?.lemonVariantId === order.lemonVariantId
    && event.claim_present);
  const claimHashes = new Set(evidence.map((entry) => entry.claim_hash));
  const claimHash = claimHashes.size === 1 ? evidence[0].claim_hash : null;
  // Conflicting signed evidence is also a review case, never an arbitrary owner.
  const claimPresent = evidence.length > 0;
  const event = await dependencies.storeEvent({
    eventKey: `reconcile:${createHash('sha256').update(JSON.stringify({ order, claimHash, claimPresent })).digest('hex')}`,
    eventName: ['refunded', 'partial_refund'].includes(order.status) ? 'order_refunded' : 'order_created',
    order,
    claimHash,
    claimPresent,
    source: 'reconciliation'
  });
  return { mode: 'apply', action: 'reconcile', ...summary, eventId: event.id, ...publicResult(await dependencies.process(event)) };
}

export function createRecoveryDependencies(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = env.LEMON_API_KEY;
  const storeId = env.LEMON_STORE_ID?.trim();
  if (!url || !secret) throw new Error('Supabase server credentials are required.');
  const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const repository = createPaymentRepository(supabase, consumeAccountClaimHash);
  const lemon = async (path, body) => {
    if (!apiKey || !storeId) throw new Error('LEMON_API_KEY and LEMON_STORE_ID are required for provider operations.');
    const response = await fetch(`https://api.lemonsqueezy.com/v1${path}`, {
      method: body ? 'PATCH' : 'GET',
      headers: { Accept: 'application/vnd.api+json', Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/vnd.api+json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) throw new Error('Lemon Squeezy request failed.');
    return response.json();
  };
  const processors = {
    ...repository,
    configuredStoreId: storeId,
    getProductSlug: (variant) => getOfficialProductByLiveVariantId(variant)?.slug ?? null,
    processRefund: async (order, recordStatus) => {
      await processVerifiedRefund({ orderId: order.lemonOrderId, expectedTestMode: false, configuredStoreId: storeId }, {
        getOrder: (id) => lemon(`/orders/${encodeURIComponent(id)}`),
        recordVerifiedRefund: (kind) => recordStatus(kind === 'full' ? 'refunded' : 'partial_refund'),
        listLicenseKeys: (id) => lemon(`/license-keys?${new URLSearchParams({ 'filter[order_id]': id, 'page[size]': '100' })}`),
        disableLicenseKey: (id) => lemon(`/license-keys/${encodeURIComponent(id)}`, { data: { type: 'license-keys', id, attributes: { disabled: true } } })
      });
    }
  };
  return {
    ...repository,
    storeId,
    process: (event) => {
      if (!storeId) throw new Error('LEMON_STORE_ID is required for processing.');
      return processPaymentEvent(event, processors, { retryQuarantined: true });
    },
    getOrder: async (id) => normalizeLemonOrder(await lemon(`/orders/${encodeURIComponent(id)}`)),
    listEvents: async (options) => {
      let query = supabase.from('payment_webhook_events').select('id, lemon_order_id, event_name, state, reason, attempts').order('received_at', { ascending: false }).limit(100);
      if (options.eventId) query = query.eq('id', options.eventId);
      else if (options.orderId) query = query.eq('lemon_order_id', options.orderId);
      else query = query.in('state', ['pending', 'processing', 'failed', 'quarantined']);
      const { data, error } = await query;
      if (error) throw new Error('Could not read payment event status.');
      return data ?? [];
    },
    compareOrder: async (id) => {
      const [purchase, events] = await Promise.all([
        supabase.from('purchases').select('status, user_id').eq('lemon_order_id', id).maybeSingle(),
        supabase.from('payment_webhook_events').select('id, lemon_order_id, order_data, claim_hash, claim_present, source').eq('lemon_order_id', id).order('received_at', { ascending: false }).limit(100)
      ]);
      if (purchase.error || events.error) throw new Error('Could not compare payment records.');
      return { purchase: purchase.data, events: events.data ?? [] };
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseRecoveryArgs(process.argv.slice(2));
    const result = await runRecovery(options, createRecoveryDependencies());
    console.log(JSON.stringify(result, null, 2));
    if (options.check && result.events.some((event) => event.state !== 'processed')) process.exitCode = 2;
  } catch {
    // Do not print arbitrary provider/database error bodies, tokens, or customer data.
    console.error('Payment recovery failed. Check arguments, credentials, migration state, and service availability. No automatic ownership reassignment is supported.');
    process.exitCode = 1;
  }
}
