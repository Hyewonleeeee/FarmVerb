'use client';

import Script from 'next/script';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
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
  showAccountNotice: (maskedEmail: string) => void;
};

const LemonCheckoutContext = createContext<LemonCheckoutContextValue>({
  openCheckout: () => false,
  showAccountNotice: () => {}
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
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const accountNoticeTimerRef = useRef<number | null>(null);

  const initialize = useCallback(() => {
    initializeLemonSqueezy(getLemonWindow());
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const openCheckout = useCallback((checkoutUrl: string) => {
    return tryOpenLemonCheckout(checkoutUrl, getLemonWindow());
  }, []);

  const showAccountNotice = useCallback((maskedEmail: string) => {
    if (accountNoticeTimerRef.current !== null) {
      window.clearTimeout(accountNoticeTimerRef.current);
    }

    setAccountNotice(maskedEmail);
    accountNoticeTimerRef.current = window.setTimeout(() => {
      setAccountNotice(null);
      accountNoticeTimerRef.current = null;
    }, 6000);
  }, []);

  useEffect(() => () => {
    if (accountNoticeTimerRef.current !== null) {
      window.clearTimeout(accountNoticeTimerRef.current);
    }
  }, []);

  return (
    <LemonCheckoutContext.Provider value={{ openCheckout, showAccountNotice }}>
      {children}
      {accountNotice ? (
        <div
          className="checkout-account-notice"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span>FarmVerb product access will be linked to</span>
          <strong>{accountNotice}</strong>
        </div>
      ) : null}
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
