import type { ConsumeAccountClaimResult } from '../checkout/accountClaim';
import type { NormalizedLemonOrder } from './lemonWebhook';

export type PaymentEventState = 'pending' | 'processing' | 'processed' | 'quarantined' | 'failed';
export type PurchaseLinkStatus = 'email_allowed' | 'claim_review' | 'linked';

export type StoredPaymentEvent = {
  id: string;
  event_name: 'order_created' | 'order_refunded';
  lemon_order_id: string;
  order_data: NormalizedLemonOrder;
  claim_hash: string | null;
  claim_present: boolean;
  source: 'webhook' | 'reconciliation';
  state: PaymentEventState;
  reason: string | null;
  lease_token: string | null;
};

export type PersistedPaymentPurchase = {
  id: string;
  lemon_order_id: string;
  product_slug: string;
  status: string;
  user_id: string | null;
  account_link_status: PurchaseLinkStatus;
};

export type SavePaymentPurchaseInput = {
  order: NormalizedLemonOrder;
  status: string;
  productSlug: string;
  userId?: string;
  linkStatus: PurchaseLinkStatus;
};

export type PaymentProcessingDependencies = {
  configuredStoreId: string;
  leaseEvent: (id: string, options: { allowQuarantined: boolean }) => Promise<StoredPaymentEvent | null>;
  finishEvent: (event: StoredPaymentEvent, state: PaymentEventState, reason: string | null) => Promise<void>;
  getProductSlug: (variantId: string | null) => string | null;
  resolveClaim: (event: StoredPaymentEvent) => Promise<ConsumeAccountClaimResult>;
  savePurchase: (input: SavePaymentPurchaseInput) => Promise<PersistedPaymentPurchase>;
  processRefund: (order: NormalizedLemonOrder, recordStatus: (status: 'refunded' | 'partial_refund') => Promise<void>) => Promise<void>;
};

export type PaymentProcessingResult = {
  state: 'processed' | 'quarantined' | 'busy';
  reason?: string;
  duplicate?: boolean;
  purchase?: PersistedPaymentPurchase;
};

export class PaymentProcessingError extends Error {
  readonly code: string;
  constructor(code: string) {
    super('Payment event processing failed.');
    this.name = 'PaymentProcessingError';
    this.code = code;
  }
}

// The caller must first durably capture a signature-verified webhook or an order
// fetched directly with the merchant API. This core is shared by HTTP and CLI.
export async function processPaymentEvent(
  input: StoredPaymentEvent,
  dependencies: PaymentProcessingDependencies,
  options: { retryQuarantined?: boolean } = {}
): Promise<PaymentProcessingResult> {
  if (input.state === 'processed') return { state: 'processed', duplicate: true };
  if (input.state === 'quarantined' && !options.retryQuarantined) {
    return { state: 'quarantined', reason: input.reason ?? 'manual_review' };
  }

  const event = await dependencies.leaseEvent(input.id, { allowQuarantined: Boolean(options.retryQuarantined) });
  if (!event) return { state: 'busy' };

  try {
    const order = event.order_data;
    if (order.testMode || order.storeId !== dependencies.configuredStoreId || order.lemonOrderId !== event.lemon_order_id) {
      await dependencies.finishEvent(event, 'quarantined', 'order_guard_failed');
      return { state: 'quarantined', reason: 'order_guard_failed' };
    }
    const productSlug = dependencies.getProductSlug(order.lemonVariantId);
    if (!productSlug) {
      await dependencies.finishEvent(event, 'quarantined', 'unmapped_variant');
      return { state: 'quarantined', reason: 'unmapped_variant' };
    }
    if (!['pending', 'paid', 'failed', 'refunded', 'partial_refund', 'fraudulent'].includes(order.status)) {
      await dependencies.finishEvent(event, 'quarantined', 'unsupported_order_status');
      return { state: 'quarantined', reason: 'unsupported_order_status' };
    }

    let userId: string | undefined;
    let reviewReason: string | undefined;
    let linkStatus: PurchaseLinkStatus = 'email_allowed';
    if (event.claim_present) {
      const claim = event.claim_hash ? await dependencies.resolveClaim(event) : { status: 'invalid' as const };
      if (claim.status === 'linked') {
        userId = claim.userId;
        linkStatus = 'linked';
      } else {
        reviewReason = `claim_${claim.status}`;
        linkStatus = 'claim_review';
      }
    } else if (event.source === 'reconciliation') {
      // The Orders API cannot reconstruct checkout custom data. Recovery must
      // never silently replace a lost initiating-account claim with billing email.
      reviewReason = 'reconciliation_owner_review';
      linkStatus = 'claim_review';
    }

    let purchase: PersistedPaymentPurchase | undefined;
    const recordStatus = async (status: string) => {
      purchase = await dependencies.savePurchase({ order, status, productSlug, userId, linkStatus });
    };
    if (event.event_name === 'order_refunded') {
      await dependencies.processRefund(order, recordStatus);
    } else {
      await recordStatus(order.status);
    }
    if (!purchase) throw new PaymentProcessingError('PURCHASE_NOT_SAVED');
    if (userId && purchase.user_id !== userId) reviewReason = 'ownership_conflict';
    if (!reviewReason && purchase.account_link_status === 'claim_review') reviewReason = 'account_review_required';
    // A reconciliation of an already-linked order requires no new ownership decision.
    if (reviewReason === 'reconciliation_owner_review' && purchase.user_id) reviewReason = undefined;

    const state = reviewReason ? 'quarantined' : 'processed';
    await dependencies.finishEvent(event, state, reviewReason ?? null);
    return { state, ...(reviewReason ? { reason: reviewReason } : {}), purchase };
  } catch (error) {
    const storageCode = error instanceof Error && 'code' in error && typeof error.code === 'string'
      && /^[A-Z0-9_]{1,60}$/.test(error.code) ? error.code : null;
    const code = error instanceof PaymentProcessingError ? error.code : storageCode ?? 'PROCESSING_FAILED';
    // A failure to update the inbox still leaves a recoverable processing lease.
    try { await dependencies.finishEvent(event, 'failed', code); } catch { /* recovered after lease expiry */ }
    throw new PaymentProcessingError(code);
  }
}
