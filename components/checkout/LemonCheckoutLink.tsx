'use client';

import {
  type MouseEvent,
  type ReactNode
} from 'react';
import { useLemonCheckout } from '@/components/checkout/LemonCheckoutProvider';
import {
  getLemonBuyButtonLabel,
  getLemonCheckoutUrlByProductName
} from '@/lib/checkout/lemonLinks';

type LemonCheckoutLinkProps = {
  productName: string;
  className?: string;
  children?: ReactNode;
  title?: string;
  ariaLabel?: string;
};

function shouldUseNativeNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export default function LemonCheckoutLink({
  productName,
  className,
  children,
  title,
  ariaLabel
}: LemonCheckoutLinkProps) {
  const { openCheckout } = useLemonCheckout();
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

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || shouldUseNativeNavigation(event)) {
      return;
    }

    if (openCheckout(checkoutUrl)) {
      event.preventDefault();
    }
  };

  return (
    <a
      href={checkoutUrl}
      className={className}
      title={title}
      aria-label={ariaLabel}
      data-lemon-checkout-product={productName}
      onClick={handleClick}
    >
      {label}
    </a>
  );
}
