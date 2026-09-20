'use client';

import Script from 'next/script';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ReactNode
} from 'react';
import {
  initializeLemonSqueezy,
  tryOpenLemonCheckout,
  type LemonSqueezyBrowser
} from '@/lib/checkout/lemonOverlay';

const LEMON_SCRIPT_URL = 'https://app.lemonsqueezy.com/js/lemon.js';

type LemonCheckoutContextValue = {
  openCheckout: (checkoutUrl: string) => boolean;
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
  const initialize = useCallback(() => {
    initializeLemonSqueezy(getLemonWindow());
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const openCheckout = useCallback((checkoutUrl: string) => {
    return tryOpenLemonCheckout(checkoutUrl, getLemonWindow());
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
