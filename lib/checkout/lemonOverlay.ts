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
  userId?: string;
  claimId?: string;
};

type ConfirmablePurchase = {
  lemon_order_id: string;
  product_name: string;
  purchased_at: string;
  status: string;
  test_mode: boolean;
};

export const CHECKOUT_SUCCESS_STORAGE_KEY = 'farmverb.checkout-success.v1';
export const CHECKOUT_CONFIRMATION_BACKOFF_MS = [750, 1250, 2000, 3000, 4500, 6500] as const;

const CHECKOUT_SUCCESS_EVENT = 'Checkout.Success';
const CHECKOUT_RECOVERY_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const memoryMarkers = new WeakMap<Window, CheckoutSuccessMarker>();

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
      orderId: marker.orderId ?? null,
      ...(typeof marker.userId === 'string' ? { userId: marker.userId } : {}),
      ...(typeof marker.claimId === 'string' ? { claimId: marker.claimId } : {})
    };
  } catch {
    return null;
  }
}

export function saveCheckoutSuccessMarker(marker: CheckoutSuccessMarker) {
  if (typeof window === 'undefined') return;
  memoryMarkers.set(window, marker);
  for (const storageName of ['localStorage', 'sessionStorage'] as const) {
    try {
      window[storageName].setItem(CHECKOUT_SUCCESS_STORAGE_KEY, serializeCheckoutSuccessMarker(marker));
    } catch {
      // Authenticated server claim recovery handles a reload with storage blocked.
    }
  }
}

export function loadCheckoutSuccessMarker(userId?: string): CheckoutSuccessMarker | null {
  if (typeof window === 'undefined') return null;
  const candidates = [memoryMarkers.get(window) ?? null];
  for (const storageName of ['localStorage', 'sessionStorage'] as const) {
    try {
      candidates.push(parseCheckoutSuccessMarker(window[storageName].getItem(CHECKOUT_SUCCESS_STORAGE_KEY)));
    } catch {
      // One storage backend may be unavailable while another remains usable.
    }
  }
  const stored = candidates.filter((marker): marker is CheckoutSuccessMarker => Boolean(marker))
    .filter((marker) => (!userId || !marker.userId || marker.userId === userId)
      && marker.openedAt <= Date.now() + 60_000
      && Date.now() - marker.openedAt <= CHECKOUT_RECOVERY_MAX_AGE_MS)
    .sort((left, right) => right.openedAt - left.openedAt)[0] ?? null;
  // This ID is an untrusted correlation hint only. The account API must still
  // return the same owned live order before it confirms anything.
  const query = new URLSearchParams(window.location?.search ?? '');
  const orderId = query.get('order_id')?.trim();
  if (query.get('checkout') === 'success' && orderId) {
    // A failed storage write may leave an older checkout behind. The return ID
    // takes precedence without borrowing that older checkout's claim identity.
    return stored?.orderId === orderId ? stored
      : { productName: 'Checkout', openedAt: Date.now(), orderId, ...(userId ? { userId } : {}) };
  }
  return stored;
}

export function clearCheckoutSuccessMarker(orderId: string) {
  if (typeof window === 'undefined') return;
  const marker = loadCheckoutSuccessMarker();
  if (marker?.orderId !== orderId) return;
  memoryMarkers.delete(window);
  for (const storageName of ['localStorage', 'sessionStorage'] as const) {
    try {
      window[storageName].removeItem(CHECKOUT_SUCCESS_STORAGE_KEY);
    } catch {
      // The server acknowledgement prevents re-emission if local cleanup fails.
    }
  }
}

export function getConfirmedCheckoutPurchase<TPurchase extends ConfirmablePurchase>(
  purchases: readonly TPurchase[],
  marker: CheckoutSuccessMarker | null
) {
  if (!marker) {
    return null;
  }

  return purchases.find((purchase) => {
    if (purchase.test_mode !== false || (purchase.status !== 'paid' && purchase.status !== 'partial_refund')) {
      return false;
    }

    // Product/time resemblance can select a previous purchase after cancellation.
    // Only an order ID from the overlay or authenticated claim recovery correlates.
    return Boolean(marker.orderId) && purchase.lemon_order_id === marker.orderId;
  }) ?? null;
}

export function hasConfirmedCheckoutPurchase(
  purchases: readonly ConfirmablePurchase[],
  marker: CheckoutSuccessMarker | null
) {
  return Boolean(getConfirmedCheckoutPurchase(purchases, marker));
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
