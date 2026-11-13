'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import { useBlackFridayPreview } from '@/components/campaigns/BlackFridayPreviewProvider';
import CheckoutAccountConfirmationModal from '@/components/checkout/CheckoutAccountConfirmationModal';
import { useLemonCheckout } from '@/components/checkout/LemonCheckoutProvider';
import { GA4_MEASUREMENT_ID } from '@/lib/analytics/config';
import {
  queueBuyNowClickForNextPage,
  trackBeginCheckout,
  trackBuyNowClick
} from '@/lib/analytics/ecommerce';
import { getAnalyticsProductByName } from '@/lib/analytics/products';
import {
  getLemonBuyButtonLabel,
  getLemonCheckoutUrlByProductName
} from '@/lib/checkout/lemonLinks';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { saveCheckoutSuccessMarker } from '@/lib/checkout/lemonOverlay';
import { getCampaignPriceByProductName } from '@/lib/campaigns/blackFridayPricing';
import type { CampaignPhase } from '@/lib/campaigns/blackFridayClock';

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
  claimId?: string;
  error?: string;
  code?: string;
  verifiedPriceCents?: number;
  currency?: string;
  phase?: CampaignPhase;
};

const CHECKOUT_PREPARATION_ERROR = 'Could not prepare secure checkout. Please try again.';
const PRICE_CHECK_MESSAGE = 'We’re confirming the current price. Please try again shortly.';
const PRICE_CHANGED_MESSAGE = 'The price has been updated. Please review the current price and try again.';

export default function LemonCheckoutLink({
  productName,
  className,
  children,
  title,
  ariaLabel
}: LemonCheckoutLinkProps) {
  const { openCheckout } = useLemonCheckout();
  const { enabled: blackFridayPreview, campaignEnabled, phase, clockReady } = useBlackFridayPreview();
  const campaignState = useRef({ campaignEnabled, phase, clockReady });
  campaignState.current = { campaignEnabled, phase, clockReady };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const campaignPrice = campaignEnabled ? getCampaignPriceByProductName(productName, phase) : null;
  const pricePending = campaignEnabled && (!clockReady || !campaignPrice);
  const modalId = useId();
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  const [isPreparingCheckout, setIsPreparingCheckout] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const checkoutUrl = getLemonCheckoutUrlByProductName(productName);
  const analyticsProduct = getAnalyticsProductByName(productName, campaignEnabled ? phase : undefined);
  const label = children ?? getLemonBuyButtonLabel(productName);

  const redirectToLogin = useCallback(() => {
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`/login?redirect=${encodeURIComponent(returnPath)}`);
  }, []);

  const handleClick = async () => {
    if (blackFridayPreview || pricePending || isCheckingAuth || isPreparingCheckout) {
      return;
    }

    setIsCheckingAuth(true);
    setCheckoutError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!mounted.current) return;

      const accountEmail = session?.user.email?.trim();
      if (!session?.access_token || !accountEmail) {
        if (analyticsProduct && !queueBuyNowClickForNextPage(analyticsProduct)) {
          trackBuyNowClick(analyticsProduct, GA4_MEASUREMENT_ID);
        }
        redirectToLogin();
        return;
      }

      if (analyticsProduct) {
        trackBuyNowClick(analyticsProduct, GA4_MEASUREMENT_ID);
      }
      setConfirmationEmail(accountEmail);
    } catch {
      if (analyticsProduct && !queueBuyNowClickForNextPage(analyticsProduct)) {
        trackBuyNowClick(analyticsProduct, GA4_MEASUREMENT_ID);
      }
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
    if (blackFridayPreview || pricePending) {
      setCheckoutError(PRICE_CHECK_MESSAGE);
      return;
    }

    setIsPreparingCheckout(true);
    setCheckoutError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!mounted.current) return;

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
        body: JSON.stringify({
          productName,
          ...(campaignEnabled && campaignPrice
            ? { expectedPriceCents: campaignPrice.priceCents, expectedPhase: phase } : {})
        }),
        cache: 'no-store'
      });
      const payload = (await response.json().catch(() => null)) as CheckoutSessionResponse | null;
      if (!mounted.current) return;

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const secureCheckoutUrl = payload?.checkoutUrl?.trim();
      if (!response.ok || !secureCheckoutUrl) {
        setCheckoutError(payload?.code === 'PRICE_CHANGED' ? PRICE_CHANGED_MESSAGE
          : payload?.code === 'PRICE_CHECK_UNAVAILABLE' ? PRICE_CHECK_MESSAGE : CHECKOUT_PREPARATION_ERROR);
        return;
      }

      // A checkout prepared across a phase change must not be opened from an
      // old modal, even if its response was valid when the server sent it.
      const latest = campaignState.current;
      if (latest.campaignEnabled !== campaignEnabled || (campaignEnabled
        && (!latest.clockReady || latest.phase !== payload?.phase
          || payload?.currency !== 'USD' || payload?.verifiedPriceCents !== campaignPrice?.priceCents))) {
        setCheckoutError(PRICE_CHANGED_MESSAGE);
        return;
      }

      setConfirmationEmail(null);
      saveCheckoutSuccessMarker({
        productName: analyticsProduct?.productName ?? productName,
        openedAt: Date.now(),
        orderId: null,
        userId: session.user.id,
        claimId: payload?.claimId
      });
      if (analyticsProduct) {
        trackBeginCheckout(campaignEnabled && payload?.verifiedPriceCents
          ? { ...analyticsProduct, price: payload.verifiedPriceCents / 100 } : analyticsProduct, GA4_MEASUREMENT_ID);
      }
      if (!openCheckout(secureCheckoutUrl, productName)) {
        window.location.assign(secureCheckoutUrl);
      }
    } catch {
      setCheckoutError(CHECKOUT_PREPARATION_ERROR);
    } finally {
      setIsPreparingCheckout(false);
    }
  };

  if (blackFridayPreview) {
    return (
      <button
        type="button"
        className={className}
        disabled
        title="Black Friday design preview — checkout disabled"
        aria-label={ariaLabel ?? `${productName} checkout disabled in preview`}
        data-black-friday-checkout-disabled="true"
      >
        {label}
      </button>
    );
  }

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
        title={pricePending ? PRICE_CHECK_MESSAGE : title}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={Boolean(confirmationEmail)}
        aria-controls={confirmationEmail ? modalId : undefined}
        aria-busy={isCheckingAuth || isPreparingCheckout}
        disabled={pricePending || isCheckingAuth || isPreparingCheckout}
        data-lemon-checkout-product={productName}
        onClick={() => void handleClick()}
      >
        {pricePending ? 'Checking price…' : label}
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
