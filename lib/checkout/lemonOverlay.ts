export type LemonSqueezyEvent = {
  event?: string;
  data?: unknown;
};

export type LemonSqueezyBrowser = {
  LemonSqueezy?: {
    Setup?: (options: { eventHandler: (event: LemonSqueezyEvent) => void }) => void;
    Refresh?: () => void;
    Url?: {
      Open?: (url: string) => void;
      Close?: () => void;
    };
  };
  createLemonSqueezy?: () => void;
};

export type CheckoutSuccessMarker = {
  productName: string;
  openedAt: number;
  orderId: string | null;
};

type ConfirmablePurchase = {
  lemon_order_id: string;
  product_name: string;
  purchased_at: string;
  status: string;
};

export const CHECKOUT_SUCCESS_STORAGE_KEY = 'farmverb.checkout-success.v1';
export const CHECKOUT_CONFIRMATION_BACKOFF_MS = [750, 1250, 2000, 3000, 4500, 6500] as const;

const CHECKOUT_SUCCESS_EVENT = 'Checkout.Success';
const RECENT_PURCHASE_TOLERANCE_MS = 5 * 60 * 1000;

function normalizeProductName(productName: string) {
  return productName.trim().toLowerCase();
}

export function getCheckoutSuccessOrderId(event: LemonSqueezyEvent) {
  if (event.event !== CHECKOUT_SUCCESS_EVENT || !event.data || typeof event.data !== 'object') {
    return null;
  }

  const orderId = (event.data as { id?: unknown }).id;
  return typeof orderId === 'string' || typeof orderId === 'number' ? String(orderId) : null;
}

export function serializeCheckoutSuccessMarker(marker: CheckoutSuccessMarker) {
  return JSON.stringify(marker);
}

export function parseCheckoutSuccessMarker(value: string | null): CheckoutSuccessMarker | null {
  if (!value) {
    return null;
  }

  try {
    const marker = JSON.parse(value) as Partial<CheckoutSuccessMarker>;
    if (
      typeof marker.productName !== 'string'
      || !marker.productName.trim()
      || typeof marker.openedAt !== 'number'
      || !Number.isFinite(marker.openedAt)
      || (marker.orderId !== null
        && marker.orderId !== undefined
        && typeof marker.orderId !== 'string')
    ) {
      return null;
    }

    return {
      productName: marker.productName.trim(),
      openedAt: marker.openedAt,
      orderId: marker.orderId ?? null
    };
  } catch {
    return null;
  }
}

export function hasConfirmedCheckoutPurchase(
  purchases: readonly ConfirmablePurchase[],
  marker: CheckoutSuccessMarker | null
) {
  if (!marker) {
    return false;
  }

  return purchases.some((purchase) => {
    if (purchase.status !== 'paid' && purchase.status !== 'partial_refund') {
      return false;
    }

    if (marker.orderId) {
      return purchase.lemon_order_id === marker.orderId;
    }

    const purchasedAt = Date.parse(purchase.purchased_at);
    return normalizeProductName(purchase.product_name) === normalizeProductName(marker.productName)
      && Number.isFinite(purchasedAt)
      && purchasedAt >= marker.openedAt - RECENT_PURCHASE_TOLERANCE_MS;
  });
}

export function initializeLemonSqueezy(
  target: LemonSqueezyBrowser | undefined,
  eventHandler?: (event: LemonSqueezyEvent) => void
) {
  if (!target) {
    return false;
  }

  try {
    const isAlreadyInitialized = typeof target.LemonSqueezy?.Url?.Open === 'function';
    if (!isAlreadyInitialized) {
      target.createLemonSqueezy?.();
    }
    if (eventHandler) {
      target.LemonSqueezy?.Setup?.({ eventHandler });
    }
    target.LemonSqueezy?.Refresh?.();
    return typeof target.LemonSqueezy?.Url?.Open === 'function';
  } catch {
    return false;
  }
}

export function tryOpenLemonCheckout(
  checkoutUrl: string,
  target: LemonSqueezyBrowser | undefined
) {
  const open = target?.LemonSqueezy?.Url?.Open;
  if (typeof open !== 'function') {
    return false;
  }

  try {
    open(checkoutUrl);
    return true;
  } catch {
    return false;
  }
}
