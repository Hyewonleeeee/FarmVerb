import { ACCOUNT_CLAIM_CUSTOM_DATA_KEY } from './accountClaim';

export type CheckoutPriceErrorCode = 'PRICE_CHANGED' | 'PRICE_CHECK_UNAVAILABLE';
export type LemonPriceTaxMode = 'inclusive' | 'exclusive';

export class CheckoutPriceError extends Error {
  constructor(readonly code: CheckoutPriceErrorCode, readonly reason: string) {
    super(code === 'PRICE_CHANGED'
      ? 'Pricing has changed. Refresh the page and try again.'
      : 'We could not verify the checkout price. Please try again shortly.');
    this.name = 'CheckoutPriceError';
  }
}

export type CheckoutPriceExpectation = {
  storeId: string;
  productId: string;
  variantId: string;
  priceCents: number;
  currency: 'USD';
  checkoutHost: string;
  taxMode: LemonPriceTaxMode;
};

type JsonRecord = Record<string, unknown>;

function unavailable(reason: string): never {
  throw new CheckoutPriceError('PRICE_CHECK_UNAVAILABLE', reason);
}

function changed(reason: string): never {
  throw new CheckoutPriceError('PRICE_CHANGED', reason);
}

function record(value: unknown, reason: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) unavailable(reason);
  return value as JsonRecord;
}

function id(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function resource(value: unknown, type: string, expectedId: string): JsonRecord {
  const data = record(record(value, 'RESOURCE_MISSING').data, 'RESOURCE_MISSING');
  if (data.type !== type || id(data.id) !== expectedId) unavailable('RESOURCE_MISMATCH');
  return record(data.attributes, 'ATTRIBUTES_MISSING');
}

function cents(value: unknown, reason: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) unavailable(reason);
  return value;
}

function samePrice(actual: number, expected: number, reason: string) {
  if (actual !== expected) changed(reason);
}

export function getLemonPriceTaxMode(value: string | undefined): LemonPriceTaxMode {
  if (value !== 'inclusive' && value !== 'exclusive') unavailable('TAX_MODE_NOT_CONFIGURED');
  return value;
}

// An old browser may still show a different campaign phase or amount. These
// values can reject a stale screen, but can never set the server's price.
export function validateDisplayedCheckoutPrice(
  input: { expectedPriceCents?: unknown; expectedPhase?: unknown },
  expected: { priceCents: number; phase: string }
) {
  if (input.expectedPriceCents !== expected.priceCents || input.expectedPhase !== expected.phase) {
    changed('DISPLAYED_PRICE_STALE');
  }
}

export function validateLemonCatalogPrice(
  input: { store: unknown; product: unknown; variant: unknown; prices: unknown; productVariants?: unknown },
  expected: CheckoutPriceExpectation
) {
  if (!Number.isSafeInteger(expected.priceCents) || expected.priceCents <= 0) unavailable('EXPECTED_PRICE_INVALID');
  const store = resource(input.store, 'stores', expected.storeId);
  if (store.currency !== 'USD') unavailable('STORE_CURRENCY_MISMATCH');

  const product = resource(input.product, 'products', expected.productId);
  if (id(product.store_id) !== expected.storeId || product.test_mode !== false || product.status !== 'published') {
    unavailable('PRODUCT_NOT_LIVE_PUBLISHED');
  }

  const variant = resource(input.variant, 'variants', expected.variantId);
  if (id(variant.product_id) !== expected.productId || variant.test_mode !== false) unavailable('VARIANT_NOT_LIVE');
  if (variant.status === 'pending') {
    // Lemon's single/default variant is documented as pending. Prove that it
    // is the only variant; never guess a nonexistent default_variant_id field.
    const variants = record(input.productVariants, 'DEFAULT_VARIANT_UNVERIFIED');
    const page = record(record(variants.meta, 'DEFAULT_VARIANT_UNVERIFIED').page, 'DEFAULT_VARIANT_UNVERIFIED');
    if (page.total !== 1 || !Array.isArray(variants.data) || variants.data.length !== 1) {
      unavailable('DEFAULT_VARIANT_UNVERIFIED');
    }
    const onlyVariant = record(variants.data[0], 'DEFAULT_VARIANT_UNVERIFIED');
    if (onlyVariant.type !== 'variants' || id(onlyVariant.id) !== expected.variantId) unavailable('DEFAULT_VARIANT_UNVERIFIED');
    const attributes = record(onlyVariant.attributes, 'DEFAULT_VARIANT_UNVERIFIED');
    if (id(attributes.product_id) !== expected.productId || attributes.test_mode !== false) unavailable('DEFAULT_VARIANT_UNVERIFIED');
  } else if (variant.status !== 'published') {
    unavailable('VARIANT_NOT_PUBLISHED');
  }
  if (variant.is_subscription !== false || variant.pay_what_you_want !== false) unavailable('UNSUPPORTED_VARIANT_PRICING');

  // Lemon documents /prices as created_at descending; each price change creates
  // a new resource. Inspect the newest entry, never an older matching amount.
  const prices = record(input.prices, 'PRICE_MISSING').data;
  if (!Array.isArray(prices) || prices.length < 1) unavailable('PRICE_MISSING');
  const priceResource = record(prices[0], 'PRICE_MISSING');
  if (priceResource.type !== 'prices') unavailable('PRICE_MISSING');
  const price = record(priceResource.attributes, 'PRICE_MISSING');
  if (id(price.variant_id) !== expected.variantId || price.category !== 'one_time' || price.scheme !== 'standard'
    || price.package_size !== 1 || price.usage_aggregation !== null || price.unit_price_decimal !== null) {
    unavailable('UNSUPPORTED_PRICE_MODEL');
  }
  samePrice(cents(price.unit_price, 'PRICE_MISSING'), expected.priceCents, 'VARIANT_PRICE_CHANGED');
  // The deprecated scalar is useful as a consistency guard when supplied; the
  // documented Price resource and checkout preview remain mandatory.
  if (variant.price !== undefined && variant.price !== null) {
    samePrice(cents(variant.price, 'VARIANT_PRICE_INVALID'), expected.priceCents, 'VARIANT_PRICE_CHANGED');
  }
}

export const CHECKOUT_PRICE_TTL_MS = 10 * 60 * 1000;
const CHECKOUT_MIN_REMAINING_MS = 30_000;

export function getVerifiedCheckoutExpiry(nowMs: number, nextBoundaryAt: number | null) {
  if (!Number.isFinite(nowMs) || (nextBoundaryAt !== null && !Number.isFinite(nextBoundaryAt))) {
    unavailable('CHECKOUT_TIME_INVALID');
  }
  const expiresMs = Math.min(nowMs + CHECKOUT_PRICE_TTL_MS, nextBoundaryAt ?? Number.POSITIVE_INFINITY);
  if (expiresMs - nowMs < CHECKOUT_MIN_REMAINING_MS) changed('CAMPAIGN_BOUNDARY_NEAR');
  return new Date(expiresMs).toISOString();
}

export function buildVerifiedCheckoutPayload(
  expected: CheckoutPriceExpectation,
  input: { email: string; claimToken: string; expiresAt: string }
) {
  const variantId = Number(expected.variantId);
  if (!Number.isSafeInteger(variantId) || variantId <= 0) unavailable('VARIANT_ID_INVALID');
  return {
    data: {
      type: 'checkouts',
      attributes: {
        product_options: { enabled_variants: [variantId] },
        checkout_options: { discount: false },
        checkout_data: {
          email: input.email,
          custom: { [ACCOUNT_CLAIM_CUSTOM_DATA_KEY]: input.claimToken },
          variant_quantities: [{ variant_id: variantId, quantity: 1 }]
        },
        preview: true,
        test_mode: false,
        expires_at: input.expiresAt
      },
      relationships: {
        store: { data: { type: 'stores', id: expected.storeId } },
        variant: { data: { type: 'variants', id: expected.variantId } }
      }
    }
  };
}

export function validateLemonCheckoutPreview(
  response: unknown,
  expected: CheckoutPriceExpectation,
  input: { claimToken: string; expiresAt: string; nowMs: number }
) {
  const data = record(record(response, 'CHECKOUT_MISSING').data, 'CHECKOUT_MISSING');
  if (data.type !== 'checkouts' || !id(data.id)) unavailable('CHECKOUT_MISSING');
  const attributes = record(data.attributes, 'CHECKOUT_MISSING');
  if (id(attributes.store_id) !== expected.storeId || id(attributes.variant_id) !== expected.variantId
    || attributes.test_mode !== false || attributes.custom_price !== null) unavailable('CHECKOUT_PRODUCT_MISMATCH');
  const productOptions = record(attributes.product_options, 'CHECKOUT_OPTIONS_MISSING');
  if (!Array.isArray(productOptions.enabled_variants) || productOptions.enabled_variants.length !== 1
    || id(productOptions.enabled_variants[0]) !== expected.variantId) unavailable('CHECKOUT_VARIANTS_MISMATCH');
  const options = record(attributes.checkout_options, 'CHECKOUT_OPTIONS_MISSING');
  if (options.discount !== false) unavailable('CHECKOUT_DISCOUNT_ENABLED');
  const checkoutData = record(attributes.checkout_data, 'CHECKOUT_DATA_MISSING');
  if (checkoutData.discount_code !== '' && checkoutData.discount_code !== null && checkoutData.discount_code !== undefined) {
    unavailable('CHECKOUT_DISCOUNT_PRESENT');
  }
  const quantities = checkoutData.variant_quantities;
  if (!Array.isArray(quantities) || quantities.length !== 1) unavailable('CHECKOUT_QUANTITY_UNVERIFIED');
  const quantity = record(quantities[0], 'CHECKOUT_QUANTITY_UNVERIFIED');
  if (id(quantity.variant_id) !== expected.variantId || quantity.quantity !== 1) unavailable('CHECKOUT_QUANTITY_MISMATCH');
  const custom = record(checkoutData.custom, 'CHECKOUT_CLAIM_UNVERIFIED');
  if (custom[ACCOUNT_CLAIM_CUSTOM_DATA_KEY] !== input.claimToken) unavailable('CHECKOUT_CLAIM_MISMATCH');

  const preview = record(attributes.preview, 'CHECKOUT_PREVIEW_MISSING');
  if (preview.currency !== 'USD' || preview.currency_rate !== 1) unavailable('CHECKOUT_CURRENCY_MISMATCH');
  const subtotal = cents(preview.subtotal, 'CHECKOUT_AMOUNT_MISSING');
  const discount = cents(preview.discount_total, 'CHECKOUT_AMOUNT_MISSING');
  const tax = cents(preview.tax, 'CHECKOUT_AMOUNT_MISSING');
  const total = cents(preview.total, 'CHECKOUT_AMOUNT_MISSING');
  for (const [field, amount] of [['subtotal', subtotal], ['discount_total', discount], ['tax', tax], ['total', total]] as const) {
    if (cents(preview[`${field}_usd`], 'CHECKOUT_USD_AMOUNT_MISSING') !== amount) unavailable('CHECKOUT_USD_AMOUNT_MISMATCH');
  }
  if (discount !== 0) unavailable('CHECKOUT_UNEXPECTED_DISCOUNT');
  if (expected.taxMode === 'exclusive') {
    samePrice(subtotal, expected.priceCents, 'CHECKOUT_PRICE_CHANGED');
    if (total !== subtotal + tax) unavailable('CHECKOUT_TAX_MISMATCH');
  } else {
    samePrice(total, expected.priceCents, 'CHECKOUT_PRICE_CHANGED');
    // Official tax-inclusive examples use gross subtotal, while subtotal is
    // also described as pre-tax. Both representations must retain exact total.
    if (tax > total || (subtotal !== total && subtotal + tax !== total)) unavailable('CHECKOUT_TAX_MISMATCH');
  }

  const expiresAt = typeof attributes.expires_at === 'string' ? attributes.expires_at : '';
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs > Date.parse(input.expiresAt)
    || expiresMs - input.nowMs < CHECKOUT_MIN_REMAINING_MS) unavailable('CHECKOUT_EXPIRY_INVALID');
  let url: URL;
  try { url = new URL(String(attributes.url ?? '')); } catch { return unavailable('CHECKOUT_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.host !== expected.checkoutHost || url.username || url.password || url.hash
    || url.pathname !== `/checkout/custom/${encodeURIComponent(id(data.id))}`) unavailable('CHECKOUT_URL_INVALID');
  // Only Lemon's signed-expiry parameters may accompany the verified resource.
  // Checkout prefill/quantity/discount/custom-data overrides belong nowhere in
  // this returned URL, even if its host happens to be our merchant hostname.
  for (const key of url.searchParams.keys()) {
    if (!['expires', 'signature'].includes(key) || url.searchParams.getAll(key).length !== 1) {
      unavailable('CHECKOUT_URL_OVERRIDE');
    }
  }
  return { checkoutUrl: url.toString(), expiresAt, verifiedPriceCents: expected.priceCents, currency: 'USD' as const };
}
