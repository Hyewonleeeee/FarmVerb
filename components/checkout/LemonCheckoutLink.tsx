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

type CheckoutSessionResponse = {
  ok?: boolean;
  checkoutUrl?: string;
  error?: string;
};

function maskAccountEmail(email: string | null | undefined) {
  const normalizedEmail = email?.trim().toLowerCase() ?? '';
  const separatorIndex = normalizedEmail.lastIndexOf('@');
  if (separatorIndex <= 0 || separatorIndex === normalizedEmail.length - 1) {
    return 'Signed-in account';
  }

  const localPart = normalizedEmail.slice(0, separatorIndex);
  const domain = normalizedEmail.slice(separatorIndex + 1);
  return `${localPart.slice(0, 1)}***@${domain}`;
}

export default function LemonCheckoutLink({
  productName,
  className,
  children,
  title,
  ariaLabel
}: LemonCheckoutLinkProps) {
  const { openCheckout, showAccountNotice } = useLemonCheckout();
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
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        redirectToLogin();
        return;
      }

      showAccountNotice(maskAccountEmail(session.user.email));

      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ productName }),
        cache: 'no-store'
      });
      const payload = (await response.json().catch(() => null)) as CheckoutSessionResponse | null;

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const secureCheckoutUrl = payload?.checkoutUrl?.trim();
      if (!response.ok || !secureCheckoutUrl) {
        window.alert(payload?.error ?? 'Could not prepare secure checkout. Please try again.');
        return;
      }

      if (!openCheckout(secureCheckoutUrl)) {
        window.location.assign(secureCheckoutUrl);
      }
    } catch {
      window.alert('Could not connect to secure checkout. Please try again.');
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
