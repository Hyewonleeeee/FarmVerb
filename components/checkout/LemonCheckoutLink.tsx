'use client';

import {
  type ReactNode,
  useState
} from 'react';
import { useLemonCheckout } from '@/components/checkout/LemonCheckoutProvider';
import {
  getLemonBuyButtonLabel,
  getLemonCheckoutUrlByProductName
} from '@/lib/checkout/lemonLinks';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type LemonCheckoutLinkProps = {
  productName: string;
  className?: string;
  children?: ReactNode;
  title?: string;
  ariaLabel?: string;
};

export default function LemonCheckoutLink({
  productName,
  className,
  children,
  title,
  ariaLabel
}: LemonCheckoutLinkProps) {
  const { openCheckout } = useLemonCheckout();
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  const checkoutUrl = getLemonCheckoutUrlByProductName(productName);
  const label = children ?? getLemonBuyButtonLabel(productName);

  if (!checkoutUrl) {
    return (
      <button
        type="button"
        className={className}
        disabled
        title={title ?? 'Checkout link coming soon'}
        aria-label={ariaLabel}
      >
        {label}
      </button>
    );
  }

  const redirectToLogin = () => {
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`/login?redirect=${encodeURIComponent(returnPath)}`);
  };

  const handleClick = async () => {
    if (isCheckingAuth) {
      return;
    }

    setIsCheckingAuth(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        redirectToLogin();
        return;
      }

      if (!openCheckout(checkoutUrl)) {
        window.location.assign(checkoutUrl);
      }
    } catch {
      redirectToLogin();
    } finally {
      setIsCheckingAuth(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-label={ariaLabel}
      aria-busy={isCheckingAuth}
      disabled={isCheckingAuth}
      data-lemon-checkout-product={productName}
      onClick={() => void handleClick()}
    >
      {label}
    </button>
  );
}
