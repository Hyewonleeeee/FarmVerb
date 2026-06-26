'use client';

import Link from 'next/link';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { getPaymentCopy } from '@/lib/i18n/payment';

export default function CheckoutPage() {
  const paymentCopy = getPaymentCopy('en');

  return (
    <div className="auth-page-shell">
      <AuthPageHeader />

      <main className="auth-page-main cart-page-main">
        <section className="mypage-card cart-page-card" aria-label="Checkout">
          <header className="cart-page-head">
            <div>
              <p className="auth-overline">Checkout</p>
              <h1 className="auth-title">Checkout link coming soon.</h1>
              <p className="auth-copy">{paymentCopy.cart.checkoutSoon}</p>
            </div>

            <Link href="/cart" className="auth-submit auth-submit-secondary cart-page-clear">
              Back to Cart
            </Link>
          </header>

          <section className="cart-page-empty" aria-label="Checkout placeholder">
            <p>Product-specific checkout URLs will be connected later through environment variables.</p>
            <p>For now, this page exists only as a structural placeholder.</p>
            <button type="button" className="auth-submit cart-page-checkout" disabled>
              Coming soon
            </button>
          </section>
        </section>
      </main>
    </div>
  );
}
