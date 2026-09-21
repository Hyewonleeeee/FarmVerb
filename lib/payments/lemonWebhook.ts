import { createHmac, timingSafeEqual } from 'node:crypto';

// Lemon sends checkout custom data under this stable public field name. Keep
// this in sync with ACCOUNT_CLAIM_CUSTOM_DATA_KEY in checkout/accountClaim.ts.
const ACCOUNT_CLAIM_CUSTOM_DATA_KEY = 'farmverb_account_claim';

type LemonOrderItem = {
  product_name?: unknown;
  variant_id?: unknown;
  test_mode?: unknown;
};

type LemonOrderAttributes = {
  store_id?: unknown;
  user_email?: unknown;
  currency?: unknown;
  total?: unknown;
  status?: unknown;
  created_at?: unknown;
  test_mode?: unknown;
  first_order_item?: LemonOrderItem | null;
};

type LemonWebhookEnvelope = {
  meta?: {
    event_name?: unknown;
    custom_data?: Record<string, unknown> | null;
  };
  data?: {
    id?: unknown;
    type?: unknown;
    attributes?: LemonOrderAttributes;
  };
};

export type NormalizedLemonOrder = {
  lemonOrderId: string;
  storeId: string;
  lemonVariantId: string | null;
  productName: string;
  buyerEmail: string;
  status: string;
  currency: string;
  totalCents: number;
  testMode: boolean;
  purchasedAt: string;
};

export function verifyLemonWebhookSignature(rawBody: string, signature: string, secret: string) {
  const expectedSignature = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const receivedBuffer = Buffer.from(signature.trim(), 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function getLemonEventName(payload: unknown) {
  const envelope = payload as LemonWebhookEnvelope;
  return typeof envelope?.meta?.event_name === 'string' ? envelope.meta.event_name : null;
}

export function getLemonAccountClaimToken(payload: unknown) {
  const envelope = payload as LemonWebhookEnvelope;
  const value = envelope?.meta?.custom_data?.[ACCOUNT_CLAIM_CUSTOM_DATA_KEY];
  return typeof value === 'string' ? value.trim() : null;
}

export function normalizeLemonOrder(payload: unknown): NormalizedLemonOrder {
  const envelope = payload as LemonWebhookEnvelope;
  const data = envelope?.data;
  const attributes = data?.attributes;
  const firstOrderItem = attributes?.first_order_item;

  const lemonOrderId = data?.id === null || data?.id === undefined ? '' : String(data.id).trim();
  const storeId =
    attributes?.store_id === null || attributes?.store_id === undefined
      ? ''
      : String(attributes.store_id).trim();
  const buyerEmail = typeof attributes?.user_email === 'string' ? attributes.user_email.trim().toLowerCase() : '';
  const productName =
    typeof firstOrderItem?.product_name === 'string' ? firstOrderItem.product_name.trim() : '';
  const lemonVariantId =
    firstOrderItem?.variant_id === null || firstOrderItem?.variant_id === undefined
      ? null
      : String(firstOrderItem.variant_id).trim() || null;
  const currency = typeof attributes?.currency === 'string' ? attributes.currency.trim().toUpperCase() : '';
  const totalCents = typeof attributes?.total === 'number' ? attributes.total : Number(attributes?.total);
  const status = typeof attributes?.status === 'string' ? attributes.status.trim().toLowerCase() : '';
  const purchasedAt = typeof attributes?.created_at === 'string' ? attributes.created_at : '';
  const parsedPurchasedAt = Date.parse(purchasedAt);
  const testModeValue =
    typeof attributes?.test_mode === 'boolean'
      ? attributes.test_mode
      : typeof firstOrderItem?.test_mode === 'boolean'
        ? firstOrderItem.test_mode
        : null;

  if (data?.type !== 'orders') {
    throw new Error('Webhook data is not a Lemon Squeezy order.');
  }

  if (!lemonOrderId) {
    throw new Error('Missing Lemon Squeezy order ID.');
  }

  if (!storeId) {
    throw new Error('Missing Lemon Squeezy store ID.');
  }

  if (!buyerEmail || !buyerEmail.includes('@')) {
    throw new Error('Missing or invalid buyer email.');
  }

  if (!productName) {
    throw new Error('Missing Lemon Squeezy product name.');
  }

  if (!currency) {
    throw new Error('Missing Lemon Squeezy order currency.');
  }

  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error('Missing or invalid Lemon Squeezy order total.');
  }

  if (!status) {
    throw new Error('Missing Lemon Squeezy order status.');
  }

  if (!purchasedAt || Number.isNaN(parsedPurchasedAt)) {
    throw new Error('Missing or invalid Lemon Squeezy purchase date.');
  }

  if (testModeValue === null) {
    throw new Error('Missing Lemon Squeezy test mode.');
  }

  return {
    lemonOrderId,
    storeId,
    lemonVariantId,
    productName,
    buyerEmail,
    status,
    currency,
    totalCents,
    testMode: testModeValue,
    purchasedAt: new Date(parsedPurchasedAt).toISOString()
  };
}
