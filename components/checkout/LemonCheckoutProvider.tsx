'use client';

import Script from 'next/script';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react';
import {
  initializeLemonSqueezy,
  tryOpenLemonCheckout,
  type LemonSqueezyBrowser
} from '@/lib/checkout/lemonOverlay';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const LEMON_SCRIPT_URL = 'https://app.lemonsqueezy.com/js/lemon.js';

type LemonCheckoutContextValue = {
  openCheckout: (checkoutUrl: string) => boolean;
  maskedAccountEmail: string | null;
};

const LemonCheckoutContext = createContext<LemonCheckoutContextValue>({
  openCheckout: () => false,
  maskedAccountEmail: null
});

function maskAccountEmail(email: string | null | undefined) {
  const normalizedEmail = email?.trim().toLowerCase() ?? '';
  const separatorIndex = normalizedEmail.lastIndexOf('@');
  if (separatorIndex <= 0 || separatorIndex === normalizedEmail.length - 1) {
    return null;
  }

  const localPart = normalizedEmail.slice(0, separatorIndex);
  const domain = normalizedEmail.slice(separatorIndex + 1);
  return `${localPart.slice(0, 1)}***@${domain}`;
}

function getLemonWindow() {
  return typeof window === 'undefined'
    ? undefined
    : (window as Window & LemonSqueezyBrowser);
}

export function useLemonCheckout() {
  return useContext(LemonCheckoutContext);
}

export default function LemonCheckoutProvider({ children }: { children: ReactNode }) {
  const [maskedAccountEmail, setMaskedAccountEmail] = useState<string | null>(null);

  const initialize = useCallback(() => {
    initializeLemonSqueezy(getLemonWindow());
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let isMounted = true;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setMaskedAccountEmail(maskAccountEmail(session?.user.email));
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setMaskedAccountEmail(maskAccountEmail(session?.user.email));
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const openCheckout = useCallback((checkoutUrl: string) => {
    return tryOpenLemonCheckout(checkoutUrl, getLemonWindow());
  }, []);

  return (
    <LemonCheckoutContext.Provider value={{ openCheckout, maskedAccountEmail }}>
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
