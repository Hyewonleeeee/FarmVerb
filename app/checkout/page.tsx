'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { getMainProductPrice, getProductPricing } from '@/lib/pricing/products';

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      requestPayment: (method: string, options: Record<string, unknown>) => Promise<void>;
    };
  }
}

const germinatePricing = getProductPricing('Germinate');

const CHECKOUT_PRODUCT = {
  name: 'Germinate',
  amount: germinatePricing ? getMainProductPrice(germinatePricing) : 49,
  currency: 'USD'
};

const TOSS_SDK_URL = 'https://js.tosspayments.com/v1/payment';

function loadTossScript() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Window is not available.'));
      return;
    }

    if (window.TossPayments) {
      resolve();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${TOSS_SDK_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Toss SDK.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = TOSS_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Toss SDK.'));
    document.body.appendChild(script);
  });
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

function generateOrderId() {
  return `farmverb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function CheckoutPage() {
  const tossClientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? '';
  const [sdkReady, setSdkReady] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [message, setMessage] = useState('');

  const priceLabel = useMemo(() => formatUsd(CHECKOUT_PRODUCT.amount), []);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      try {
        await loadTossScript();
        if (mounted) {
          setSdkReady(true);
        }
      } catch (error) {
        if (!mounted) {
          return;
        }
        const reason = error instanceof Error ? error.message : 'Failed to initialize Toss Payments.';
        setMessage(reason);
      }
    };

    void initialize();
    return () => {
      mounted = false;
    };
  }, []);

  const handlePayWithToss = async () => {
    setMessage('');

    if (!tossClientKey) {
      setMessage('Missing NEXT_PUBLIC_TOSS_CLIENT_KEY in environment variables.');
      return;
    }

    if (!window.TossPayments) {
      setMessage('Toss Payments SDK is not loaded yet.');
      return;
    }

    try {
      setIsPaying(true);
      const tossPayments = window.TossPayments(tossClientKey);
      const orderId = generateOrderId();

      await tossPayments.requestPayment('카드', {
        amount: CHECKOUT_PRODUCT.amount,
        orderId,
        orderName: CHECKOUT_PRODUCT.name,
        customerName: 'FarmVerb Test User',
        successUrl: `${window.location.origin}/success`,
        failUrl: `${window.location.origin}/fail`
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Could not open Toss payment window.';
      setMessage(reason);
      setIsPaying(false);
    }
  };

  return (
    <div className="auth-page-shell">
      <AuthPageHeader />

      <main className="auth-page-main cart-page-main">
        <section className="mypage-card cart-page-card" aria-label="Checkout">
          <header className="cart-page-head">
            <div>
              <p className="auth-overline">Checkout</p>
              <h1 className="auth-title">Secure Test Payment</h1>
              <p className="auth-copy">Test mode only. No real charge will be processed.</p>
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
                <strong>Toss Payments</strong>
              </div>
              <div className="cart-page-summary-row">
                <span>Status</span>
                <strong>{sdkReady ? 'Ready' : 'Loading SDK...'}</strong>
              </div>
              <button
                type="button"
                className="auth-submit cart-page-checkout"
                onClick={() => void handlePayWithToss()}
                disabled={!sdkReady || isPaying}
              >
                {isPaying ? 'Opening...' : 'Pay with Toss'}
              </button>
            </aside>
          </div>

          {message ? <p className="auth-message">{message}</p> : null}
        </section>
      </main>
    </div>
  );
}
