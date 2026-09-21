'use client';

import {
  type ReactNode,
  useCallback,
  useId,
  useState
} from 'react';
import CheckoutAccountConfirmationModal from '@/components/checkout/CheckoutAccountConfirmationModal';
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

const CHECKOUT_PREPARATION_ERROR = 'Could not prepare secure checkout. Please try again.';

export default function LemonCheckoutLink({
  productName,
  className,
  children,
  title,
  ariaLabel
}: LemonCheckoutLinkProps) {
  const { openCheckout } = useLemonCheckout();
  const modalId = useId();
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  const [isPreparingCheckout, setIsPreparingCheckout] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const checkoutUrl = getLemonCheckoutUrlByProductName(productName);
  const label = children ?? getLemonBuyButtonLabel(productName);

  const redirectToLogin = useCallback(() => {
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`/login?redirect=${encodeURIComponent(returnPath)}`);
  }, []);

  const handleClick = async () => {
    if (isCheckingAuth || isPreparingCheckout) {
      return;
    }

    setIsCheckingAuth(true);
    setCheckoutError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      const accountEmail = session?.user.email?.trim();
      if (!session?.access_token || !accountEmail) {
        redirectToLogin();
        return;
      }

      setConfirmationEmail(accountEmail);
    } catch {
      redirectToLogin();
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const closeConfirmation = useCallback(() => {
    if (isPreparingCheckout) {
      return;
    }

    setConfirmationEmail(null);
    setCheckoutError(null);
  }, [isPreparingCheckout]);

  const continueToCheckout = async () => {
    if (!confirmationEmail || isPreparingCheckout) {
      return;
    }

    setIsPreparingCheckout(true);
    setCheckoutError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      const currentAccountEmail = session?.user.email?.trim();
      if (!session?.access_token || !currentAccountEmail) {
        redirectToLogin();
        return;
      }

      if (currentAccountEmail.toLowerCase() !== confirmationEmail.toLowerCase()) {
        setConfirmationEmail(currentAccountEmail);
        setCheckoutError('Your signed-in FarmVerb account changed. Please review it and continue again.');
        return;
      }

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
        setCheckoutError(CHECKOUT_PREPARATION_ERROR);
        return;
      }

      setConfirmationEmail(null);
      if (!openCheckout(secureCheckoutUrl)) {
        window.location.assign(secureCheckoutUrl);
      }
    } catch {
      setCheckoutError(CHECKOUT_PREPARATION_ERROR);
    } finally {
      setIsPreparingCheckout(false);
    }
  };

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

  return (
    <>
      <button
        type="button"
        className={className}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={Boolean(confirmationEmail)}
        aria-controls={confirmationEmail ? modalId : undefined}
        aria-busy={isCheckingAuth || isPreparingCheckout}
        disabled={isCheckingAuth || isPreparingCheckout}
        data-lemon-checkout-product={productName}
        onClick={() => void handleClick()}
      >
        {label}
      </button>
      <CheckoutAccountConfirmationModal
        id={modalId}
        email={confirmationEmail}
        error={checkoutError}
        isPreparing={isPreparingCheckout}
        onCancel={closeConfirmation}
        onContinue={() => void continueToCheckout()}
      />
    </>
  );
}
