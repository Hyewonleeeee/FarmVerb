'use client';

import Link from 'next/link';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { getMainProductPrice, getProductPricing } from '@/lib/pricing/products';

const germinatePricing = getProductPricing('Germinate');

const CHECKOUT_PRODUCT = {
  name: 'Germinate',
  amount: germinatePricing ? getMainProductPrice(germinatePricing) : 49,
  currency: 'USD'
};

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

export default function CheckoutPage() {
  const priceLabel = formatUsd(CHECKOUT_PRODUCT.amount);

  return (
    <div className="auth-page-shell">
      <AuthPageHeader />

      <main className="auth-page-main cart-page-main">
        <section className="mypage-card cart-page-card" aria-label="Checkout">
          <header className="cart-page-head">
            <div>
              <p className="auth-overline">Checkout</p>
              <h1 className="auth-title">Lemon Squeezy Checkout</h1>
              <p className="auth-copy">Payment gateway is being migrated. Checkout will be available shortly.</p>
            </div>

            <Link href="/cart" className="auth-submit auth-submit-secondary cart-page-clear">
              Back to Cart
            </Link>
          </header>

          <div className="cart-page-layout">
            <section className="cart-page-lines" aria-label="Checkout item">
              <div className="cart-page-line-item">
                <div className="cart-page-line-main">
                  <div className="mypage-item-head">{CHECKOUT_PRODUCT.name}</div>
                  <div className="cart-page-meta">Currency: {CHECKOUT_PRODUCT.currency}</div>
                  <div className="cart-page-price-row">
                    <span>Total Amount</span>
                    <strong>{priceLabel}</strong>
                  </div>
                </div>
              </div>
            </section>

            <aside className="cart-page-summary" aria-label="Checkout action">
              <h2>Payment</h2>
              <div className="cart-page-summary-row">
                <span>Method</span>
                <strong>Lemon Squeezy</strong>
              </div>
              <div className="cart-page-summary-row">
                <span>Status</span>
                <strong>Preparing Integration</strong>
              </div>
              <button type="button" className="auth-submit cart-page-checkout" disabled>
                Checkout Coming Soon
              </button>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
