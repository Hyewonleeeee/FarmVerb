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
  CHECKOUT_SUCCESS_STORAGE_KEY,
  getCheckoutSuccessOrderId,
  initializeLemonSqueezy,
  serializeCheckoutSuccessMarker,
  tryOpenLemonCheckout,
  type LemonSqueezyBrowser,
  type LemonSqueezyEvent
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
  const pendingCheckoutRef = useRef<{ productName: string; openedAt: number } | null>(null);
  const checkoutSuccessHandledRef = useRef(false);

  const handleLemonEvent = useCallback((event: LemonSqueezyEvent) => {
    if (event.event !== 'Checkout.Success' || checkoutSuccessHandledRef.current) {
      return;
    }

    checkoutSuccessHandledRef.current = true;
    const pendingCheckout = pendingCheckoutRef.current;
    if (pendingCheckout) {
      try {
        window.sessionStorage.setItem(
          CHECKOUT_SUCCESS_STORAGE_KEY,
          serializeCheckoutSuccessMarker({
            ...pendingCheckout,
            orderId: getCheckoutSuccessOrderId(event)
          })
        );
      } catch {
        // The confirmation page can still show its bounded fallback state without session storage.
      }
    }

    const lemonWindow = getLemonWindow();
    try {
      lemonWindow?.LemonSqueezy?.Url?.Close?.();
    } finally {
      window.location.assign('/mypage?checkout=success');
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
      productName: getOfficialProductByName(productName)?.name ?? productName,
      openedAt: Date.now()
    };
    const opened = tryOpenLemonCheckout(checkoutUrl, getLemonWindow());
    if (!opened) {
      pendingCheckoutRef.current = null;
    }
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
