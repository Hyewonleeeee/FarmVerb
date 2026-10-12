export type AnalyticsProduct = {
  productName: string;
  productSlug: string;
  productCategory: string;
  productSeries: string | null;
  price: number;
  currency: string;
};

export type PurchaseAnalyticsDetails = {
  transactionId: string;
  value: number;
  currency: string;
};

export type GoogleAdsPurchaseDetails = PurchaseAnalyticsDetails & {
  status: string;
  testMode: boolean;
};

type ProductEventName = 'buy_now_click' | 'add_to_cart' | 'begin_checkout';

type ProductEventParams = {
  product_name: string;
  product_slug: string;
  product_category: string;
  product_series?: string;
  price: number;
  currency: string;
  value: number;
  page_path: string;
  page_location: string;
  page_title: string;
  debug_mode?: true;
  items: Array<{
    item_id: string;
    item_name: string;
    item_brand: 'FarmVerb';
    item_category: string;
    item_category2?: string;
    price: number;
    quantity: 1;
  }>;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const PURCHASE_STORAGE_PREFIX = 'farmverb.ga4.purchase.v1';
const GOOGLE_ADS_PURCHASE_STORAGE_PREFIX = 'farmverb.google-ads.purchase.v1';
const PENDING_GA4_PRODUCT_EVENT_KEY = 'farmverb.ga4.pending-product-event.v1';
const PENDING_GA4_PRODUCT_EVENT_MAX_AGE_MS = 5 * 60 * 1000;
const GOOGLE_ADS_PRODUCTION_HOSTS = new Set(['farmverb.com', 'www.farmverb.com']);
// A queued command is not delivery. Only a Google tag callback permits a local
// processed marker; an independent server acknowledgement can retain that state
// when browser storage is unavailable. Neither callback proves network receipt.
const PURCHASE_RETRY_AFTER_MS = 15_000;
const purchaseAttempts = new WeakMap<Window, Map<string, { startedAt: number; processed: boolean }>>();

function isProductEventName(value: unknown): value is ProductEventName {
  return value === 'buy_now_click' || value === 'add_to_cart' || value === 'begin_checkout';
}

function getPageContext() {
  return {
    page_path: `${window.location.pathname}${window.location.search}`,
    page_location: window.location.href,
    page_title: document.title
  };
}

export function buildProductEventParams(
  product: AnalyticsProduct,
  value = product.price,
  currency = product.currency
): ProductEventParams {
  return {
    product_name: product.productName,
    product_slug: product.productSlug,
    product_category: product.productCategory,
    ...(product.productSeries ? { product_series: product.productSeries } : {}),
    price: value,
    currency: currency.toUpperCase(),
    value,
    ...getPageContext(),
    ...(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? { debug_mode: true as const }
      : {}),
    items: [
      {
        item_id: product.productSlug,
        item_name: product.productName,
        item_brand: 'FarmVerb',
        item_category: product.productCategory,
        ...(product.productSeries ? { item_category2: product.productSeries } : {}),
        price: value,
        quantity: 1
      }
    ]
  };
}

function sendGoogleTagEvent(eventName: string, parameters: Record<string, unknown>) {
  if (typeof window === 'undefined') {
    return false;
  }

  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, parameters);
  } else {
    window.dataLayer = window.dataLayer ?? [];
    const queueGtagCommand = function (..._args: unknown[]) {
      window.dataLayer?.push(arguments);
    };
    queueGtagCommand('event', eventName, parameters);
  }

  return true;
}

export function sendGa4Event(
  eventName: string,
  parameters: Record<string, unknown>,
  measurementId: string
) {
  if (!measurementId.trim()) {
    return false;
  }

  return sendGoogleTagEvent(eventName, {
    ...parameters,
    send_to: measurementId.trim()
  });
}

function trackProductEvent(
  eventName: ProductEventName,
  product: AnalyticsProduct,
  measurementId: string
) {
  return sendGa4Event(eventName, buildProductEventParams(product), measurementId);
}

export function trackBuyNowClick(product: AnalyticsProduct, measurementId: string) {
  return trackProductEvent('buy_now_click', product, measurementId);
}

export function trackAddToCart(product: AnalyticsProduct, measurementId: string) {
  return trackProductEvent('add_to_cart', product, measurementId);
}

function queueProductEventForNextPage(eventName: ProductEventName, product: AnalyticsProduct) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.sessionStorage.setItem(PENDING_GA4_PRODUCT_EVENT_KEY, JSON.stringify({
      eventName,
      parameters: buildProductEventParams(product),
      createdAt: Date.now()
    }));
    return true;
  } catch {
    return false;
  }
}

export function queueBuyNowClickForNextPage(product: AnalyticsProduct) {
  return queueProductEventForNextPage('buy_now_click', product);
}

export function queueAddToCartForNextPage(product: AnalyticsProduct) {
  return queueProductEventForNextPage('add_to_cart', product);
}

export function flushPendingGa4ProductEvent(measurementId: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  let rawEvent: string | null = null;
  try {
    rawEvent = window.sessionStorage.getItem(PENDING_GA4_PRODUCT_EVENT_KEY);
  } catch {
    return false;
  }

  if (!rawEvent) {
    return false;
  }

  try {
    const pendingEvent = JSON.parse(rawEvent) as {
      eventName?: unknown;
      parameters?: unknown;
      createdAt?: unknown;
    };
    const isSupportedEvent = pendingEvent.eventName === 'buy_now_click'
      || pendingEvent.eventName === 'add_to_cart';
    const isFresh = typeof pendingEvent.createdAt === 'number'
      && Number.isFinite(pendingEvent.createdAt)
      && Date.now() - pendingEvent.createdAt <= PENDING_GA4_PRODUCT_EVENT_MAX_AGE_MS;
    const hasParameters = Boolean(pendingEvent.parameters)
      && typeof pendingEvent.parameters === 'object'
      && !Array.isArray(pendingEvent.parameters);

    if (!isSupportedEvent || !isProductEventName(pendingEvent.eventName) || !isFresh || !hasParameters) {
      window.sessionStorage.removeItem(PENDING_GA4_PRODUCT_EVENT_KEY);
      return false;
    }

    const sent = sendGa4Event(
      pendingEvent.eventName,
      pendingEvent.parameters as Record<string, unknown>,
      measurementId
    );
    if (sent) {
      window.sessionStorage.removeItem(PENDING_GA4_PRODUCT_EVENT_KEY);
    }
    return sent;
  } catch {
    try {
      window.sessionStorage.removeItem(PENDING_GA4_PRODUCT_EVENT_KEY);
    } catch {
      // Invalid pending analytics state can be ignored if storage is unavailable.
    }
    return false;
  }
}

export function trackBeginCheckout(product: AnalyticsProduct, measurementId: string) {
  return trackProductEvent('begin_checkout', product, measurementId);
}

export function trackPurchase(
  product: AnalyticsProduct,
  purchase: PurchaseAnalyticsDetails,
  measurementId: string,
  onProcessed?: () => void
) {
  if (typeof window === 'undefined' || !purchase.transactionId.trim() || !measurementId.trim()
    || !Number.isFinite(purchase.value) || purchase.value < 0 || !/^[A-Za-z]{3}$/.test(purchase.currency.trim())) {
    return false;
  }

  const storageKey = `${PURCHASE_STORAGE_PREFIX}:${purchase.transactionId.trim()}`;
  return trackPurchaseCommand(storageKey, 'purchase', {
    ...buildProductEventParams(product, purchase.value, purchase.currency),
    transaction_id: purchase.transactionId.trim(),
    send_to: measurementId.trim()
  }, onProcessed);
}

function trackPurchaseCommand(
  storageKey: string,
  eventName: 'purchase' | 'conversion',
  parameters: Record<string, unknown>,
  onProcessed?: () => void
) {
  let attempts = purchaseAttempts.get(window);
  if (!attempts) {
    attempts = new Map();
    purchaseAttempts.set(window, attempts);
  }
  const previous = attempts.get(storageKey);
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(storageKey);
  } catch {
    // Server acknowledgements and per-document state still provide deduplication.
  }
  // Preserve legacy markers so old orders are not bulk re-emitted on upgrade.
  if (stored === 'sent' || stored === 'processed' || previous?.processed) {
    onProcessed?.();
    return false;
  }
  if (previous && Date.now() - previous.startedAt < PURCHASE_RETRY_AFTER_MS) {
    return false;
  }
  const attempt = { startedAt: Date.now(), processed: false };
  attempts.set(storageKey, attempt);
  try {
    return sendGoogleTagEvent(eventName, {
      ...parameters,
      event_callback: () => {
        attempt.processed = true;
        attempts.set(storageKey, attempt);
        try {
          window.localStorage.setItem(storageKey, 'processed');
        } catch {
          // onProcessed persists the acknowledgement through an authenticated API.
        }
        onProcessed?.();
      }
    });
  } catch {
    attempts.delete(storageKey);
    return false;
  }
}

export function isGoogleAdsPurchaseEligible(purchase: GoogleAdsPurchaseDetails) {
  return purchase.status === 'paid'
    && purchase.testMode === false
    && Boolean(purchase.transactionId.trim())
    && Number.isFinite(purchase.value)
    && purchase.value >= 0
    && /^[A-Za-z]{3}$/.test(purchase.currency.trim());
}

export function trackGoogleAdsPurchase(
  purchase: GoogleAdsPurchaseDetails,
  conversionDestination: string,
  onProcessed?: () => void
) {
  if (
    typeof window === 'undefined'
    || !GOOGLE_ADS_PRODUCTION_HOSTS.has(window.location.hostname.toLowerCase())
    || !isGoogleAdsPurchaseEligible(purchase)
    || !conversionDestination.trim()
  ) {
    return false;
  }

  const transactionId = purchase.transactionId.trim();
  const storageKey = `${GOOGLE_ADS_PURCHASE_STORAGE_PREFIX}:${transactionId}`;
  return trackPurchaseCommand(storageKey, 'conversion', {
    send_to: conversionDestination.trim(),
    value: purchase.value,
    currency: purchase.currency.trim().toUpperCase(),
    transaction_id: transactionId
  }, onProcessed);
}
