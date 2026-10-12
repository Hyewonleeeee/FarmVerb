import type { SupabaseClient } from '@supabase/supabase-js';
import type { consumeAccountClaimHash, AccountClaimRecord } from '../checkout/accountClaim';
import type { NormalizedLemonOrder } from './lemonWebhook';
import type { PaymentEventState, PersistedPaymentPurchase, SavePaymentPurchaseInput, StoredPaymentEvent } from './paymentProcessing';

const EVENT_SELECT = 'id, event_name, lemon_order_id, order_data, claim_hash, claim_present, source, state, reason, lease_token';
const CLAIM_SELECT = 'token_hash, user_id, lemon_variant_id, created_at, expires_at, consumed_at, consumed_order_id';

export type StorePaymentEventInput = {
  eventKey: string;
  eventName: StoredPaymentEvent['event_name'];
  order: NormalizedLemonOrder;
  claimHash: string | null;
  claimPresent: boolean;
  source: StoredPaymentEvent['source'];
};

function storageError(operation: string, code?: string) {
  // Database messages can include row values. Keep errors safe for logs/CLI.
  const error = new Error(`Payment storage ${operation} failed.`);
  return Object.assign(error, { code: code ?? 'PAYMENT_STORAGE_FAILED' });
}

export function createPaymentRepository(supabase: SupabaseClient, consumeClaimHash: typeof consumeAccountClaimHash) {
  const getEvent = async (id: string): Promise<StoredPaymentEvent> => {
    const { data, error } = await supabase.from('payment_webhook_events').select(EVENT_SELECT).eq('id', id).single();
    if (error || !data) throw storageError('read', error?.code);
    return data as StoredPaymentEvent;
  };
  return {
    getEvent,
    async storeEvent(input: StorePaymentEventInput): Promise<StoredPaymentEvent> {
      const { data, error } = await supabase.from('payment_webhook_events').upsert({
        event_key: input.eventKey,
        event_name: input.eventName,
        lemon_order_id: input.order.lemonOrderId,
        order_data: input.order,
        claim_hash: input.claimHash,
        claim_present: input.claimPresent,
        source: input.source
      }, { onConflict: 'event_key', ignoreDuplicates: true }).select(EVENT_SELECT).maybeSingle();
      if (error) throw storageError('capture', error.code);
      if (data) return data as StoredPaymentEvent;
      const duplicate = await supabase.from('payment_webhook_events').select(EVENT_SELECT).eq('event_key', input.eventKey).single();
      if (duplicate.error || !duplicate.data) throw storageError('duplicate read', duplicate.error?.code);
      return duplicate.data as StoredPaymentEvent;
    },
    async leaseEvent(id: string, options: { allowQuarantined: boolean }): Promise<StoredPaymentEvent | null> {
      const { data, error } = await supabase.rpc('claim_payment_webhook_event', {
        p_event_id: id,
        p_allow_quarantined: options.allowQuarantined
      });
      if (error) throw storageError('lease', error.code);
      return data as StoredPaymentEvent | null;
    },
    async finishEvent(event: StoredPaymentEvent, state: PaymentEventState, reason: string | null) {
      const { data, error } = await supabase.from('payment_webhook_events').update({
        state,
        reason,
        lease_token: null,
        lease_until: null,
        updated_at: new Date().toISOString(),
        processed_at: state === 'processed' ? new Date().toISOString() : null
      }).eq('id', event.id).eq('lease_token', event.lease_token).select('id').maybeSingle();
      if (error || !data) throw storageError('completion', error?.code ?? 'LEASE_LOST');
    },
    async savePurchase(input: SavePaymentPurchaseInput): Promise<PersistedPaymentPurchase> {
      const { data, error } = await supabase.rpc('persist_payment_purchase', {
        p_order: input.order,
        p_status: input.status,
        p_product_slug: input.productSlug,
        p_user_id: input.userId ?? null,
        p_link_status: input.linkStatus
      });
      if (error || !data) throw storageError('purchase persistence', error?.code);
      return data as PersistedPaymentPurchase;
    },
    async resolveClaim(event: StoredPaymentEvent) {
      return consumeClaimHash({
        tokenHash: event.claim_hash ?? '',
        orderId: event.lemon_order_id,
        variantId: event.order_data.lemonVariantId ?? '',
        occurredAt: event.order_data.purchasedAt
      }, {
        consumeAvailableClaim: async ({ tokenHash, orderId, variantId, consumedAt, occurredAt, createdBefore }) => {
          const { data, error } = await supabase.from('purchase_account_claims')
            .update({ consumed_at: consumedAt, consumed_order_id: orderId })
            .eq('token_hash', tokenHash).eq('lemon_variant_id', variantId)
            .is('consumed_at', null).lte('created_at', createdBefore).gt('expires_at', occurredAt)
            .select(CLAIM_SELECT).maybeSingle();
          if (error) throw storageError('claim consumption', error.code);
          return data as AccountClaimRecord | null;
        },
        findClaimByHash: async (tokenHash) => {
          const { data, error } = await supabase.from('purchase_account_claims').select(CLAIM_SELECT)
            .eq('token_hash', tokenHash).maybeSingle();
          if (error) throw storageError('claim lookup', error.code);
          return data as AccountClaimRecord | null;
        }
      });
    }
  };
}
