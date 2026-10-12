'use client';

import Script from 'next/script';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode
} from 'react';
import {
  getCheckoutSuccessOrderId,
  initializeLemonSqueezy,
  loadCheckoutSuccessMarker,
  saveCheckoutSuccessMarker,
  tryOpenLemonCheckout,
  type LemonSqueezyBrowser,
  type LemonSqueezyEvent,
  type CheckoutSuccessMarker
} from '@/lib/checkout/lemonOverlay';
import { getOfficialProductByName } from '@/lib/products/catalog';

const LEMON_SCRIPT_URL = 'https://app.lemonsqueezy.com/js/lemon.js';

type LemonCheckoutContextValue = {
  openCheckout: (checkoutUrl: string, productName: string) => boolean;
};

const LemonCheckoutContext = createContext<LemonCheckoutContextValue>({
  openCheckout: () => false
});

function getLemonWindow() {
  return typeof window === 'undefined'
    ? undefined
    : (window as Window & LemonSqueezyBrowser);
}

export function useLemonCheckout() {
  return useContext(LemonCheckoutContext);
}

export default function LemonCheckoutProvider({ children }: { children: ReactNode }) {
  const pendingCheckoutRef = useRef<CheckoutSuccessMarker | null>(null);
  const checkoutSuccessHandledRef = useRef(false);

  const handleLemonEvent = useCallback((event: LemonSqueezyEvent) => {
    if (event.event !== 'Checkout.Success' || checkoutSuccessHandledRef.current) {
      return;
    }

    checkoutSuccessHandledRef.current = true;
    const pendingCheckout = pendingCheckoutRef.current;
    const orderId = getCheckoutSuccessOrderId(event);
    if (pendingCheckout) {
      saveCheckoutSuccessMarker({
        ...pendingCheckout,
        orderId
      });
    }

    const lemonWindow = getLemonWindow();
    try {
      lemonWindow?.LemonSqueezy?.Url?.Close?.();
    } finally {
      window.location.assign(`/mypage?checkout=success${orderId ? `&order_id=${encodeURIComponent(orderId)}` : ''}`);
    }
  }, []);

  const initialize = useCallback(() => {
    initializeLemonSqueezy(getLemonWindow(), handleLemonEvent);
  }, [handleLemonEvent]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const openCheckout = useCallback((checkoutUrl: string, productName: string) => {
    checkoutSuccessHandledRef.current = false;
    pendingCheckoutRef.current = {
      ...loadCheckoutSuccessMarker(),
      productName: getOfficialProductByName(productName)?.name ?? productName,
      openedAt: Date.now(),
      orderId: null
    };
    // Persist before trying Lemon.js: hosted checkout must retain the same intent.
    saveCheckoutSuccessMarker(pendingCheckoutRef.current);
    const opened = tryOpenLemonCheckout(checkoutUrl, getLemonWindow());
    return opened;
  }, []);

  return (
    <LemonCheckoutContext.Provider value={{ openCheckout }}>
      {children}
      <Script
        id="farmverb-lemon-squeezy"
        src={LEMON_SCRIPT_URL}
        strategy="afterInteractive"
        onLoad={initialize}
        onReady={initialize}
      />
    </LemonCheckoutContext.Provider>
  );
}
