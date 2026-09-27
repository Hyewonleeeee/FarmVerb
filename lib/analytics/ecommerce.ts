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

export function sendGa4Event(eventName: string, parameters: Record<string, unknown>) {
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

function trackProductEvent(eventName: ProductEventName, product: AnalyticsProduct) {
  return sendGa4Event(eventName, buildProductEventParams(product));
}

export function trackBuyNowClick(product: AnalyticsProduct) {
  return trackProductEvent('buy_now_click', product);
}

export function trackAddToCart(product: AnalyticsProduct) {
  return trackProductEvent('add_to_cart', product);
}

export function trackBeginCheckout(product: AnalyticsProduct) {
  return trackProductEvent('begin_checkout', product);
}

export function trackPurchase(product: AnalyticsProduct, purchase: PurchaseAnalyticsDetails) {
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
  });

  if (sent) {
    try {
      window.localStorage.setItem(storageKey, 'sent');
    } catch {
      // The GA event was queued even if the de-duplication marker could not be stored.
    }
  }

  return sent;
}
