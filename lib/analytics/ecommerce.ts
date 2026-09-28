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
const GOOGLE_ADS_PRODUCTION_HOSTS = new Set(['farmverb.com', 'www.farmverb.com']);

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

export function sendGa4EventAndWait(
  eventName: string,
  parameters: Record<string, unknown>,
  measurementId: string,
  timeoutMs = 800
) {
  if (typeof window === 'undefined' || !measurementId.trim()) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let completed = false;
    const finish = (sent: boolean) => {
      if (completed) {
        return;
      }
      completed = true;
      window.clearTimeout(timeoutId);
      resolve(sent);
    };
    const timeoutId = window.setTimeout(() => finish(true), timeoutMs);
    const sent = sendGoogleTagEvent(eventName, {
      ...parameters,
      send_to: measurementId.trim(),
      event_callback: () => finish(true),
      event_timeout: timeoutMs
    });

    if (!sent) {
      finish(false);
    }
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

export function trackBuyNowClickAndWait(product: AnalyticsProduct, measurementId: string) {
  return sendGa4EventAndWait(
    'buy_now_click',
    buildProductEventParams(product),
    measurementId
  );
}

export function trackAddToCart(product: AnalyticsProduct, measurementId: string) {
  return trackProductEvent('add_to_cart', product, measurementId);
}

export function trackAddToCartAndWait(product: AnalyticsProduct, measurementId: string) {
  return sendGa4EventAndWait(
    'add_to_cart',
    buildProductEventParams(product),
    measurementId
  );
}

export function trackBeginCheckout(product: AnalyticsProduct, measurementId: string) {
  return trackProductEvent('begin_checkout', product, measurementId);
}

export function trackPurchase(
  product: AnalyticsProduct,
  purchase: PurchaseAnalyticsDetails,
  measurementId: string
) {
  if (typeof window === 'undefined' || !purchase.transactionId.trim()) {
    return false;
  }

  const storageKey = `${PURCHASE_STORAGE_PREFIX}:${purchase.transactionId.trim()}`;
  try {
    if (window.localStorage.getItem(storageKey) === 'sent') {
      return false;
    }
  } catch {
    // Tracking can continue if storage is unavailable.
  }

  const sent = sendGa4Event('purchase', {
    ...buildProductEventParams(product, purchase.value, purchase.currency),
    transaction_id: purchase.transactionId
  }, measurementId);

  if (sent) {
    try {
      window.localStorage.setItem(storageKey, 'sent');
    } catch {
      // The GA event was queued even if the de-duplication marker could not be stored.
    }
  }

  return sent;
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
  conversionDestination: string
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
  try {
    if (window.localStorage.getItem(storageKey) === 'sent') {
      return false;
    }
  } catch {
    // Google Ads also de-duplicates this conversion action by transaction_id.
  }

  const sent = sendGoogleTagEvent('conversion', {
    send_to: conversionDestination.trim(),
    value: purchase.value,
    currency: purchase.currency.trim().toUpperCase(),
    transaction_id: transactionId
  });

  if (sent) {
    try {
      window.localStorage.setItem(storageKey, 'sent');
    } catch {
      // The conversion was queued even if the local de-duplication marker could not be stored.
    }
  }

  return sent;
}
