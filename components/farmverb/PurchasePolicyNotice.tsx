'use client';

import Link from 'next/link';
import { useLemonCheckout } from '@/components/checkout/LemonCheckoutProvider';

export default function PurchasePolicyNotice() {
  const { maskedAccountEmail } = useLemonCheckout();

  return (
    <div className="purchase-policy-stack">
      {maskedAccountEmail ? (
        <p className="checkout-account-inline" role="status" aria-live="polite">
          Purchases will be linked to <strong>{maskedAccountEmail}</strong>
        </p>
      ) : null}
      <p className="purchase-policy-notice">
        Before purchasing, please review our <Link href="/refund-policy">Refund Policy</Link>.
      </p>
    </div>
  );
}
