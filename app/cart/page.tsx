'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { getPaymentCopy, type PaymentLocale } from '@/lib/i18n/payment';
import {
  clearCartItems,
  getCartItemCount,
  getCartItems,
  getCartSubtotal,
  removeCartItem,
  subscribeToCart,
  updateCartItemQuantity,
  type CartItem
} from '@/lib/cart/store';

const formatCurrency = (amount: number, currency: string, locale: PaymentLocale) => {
  const numberLocale = locale === 'ko' ? 'ko-KR' : 'en-US';
  try {
    return new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
};

export default function CartPage() {
  const paymentLocale: PaymentLocale = 'en';
  const paymentCopy = getPaymentCopy(paymentLocale);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartMessage, setCartMessage] = useState('');

  useEffect(() => {
    const syncCart = () => {
      setCartItems(getCartItems());
    };

    syncCart();
    return subscribeToCart(syncCart);
  }, []);

  const summary = useMemo(() => {
    const itemCount = getCartItemCount(cartItems);
    const subtotal = getCartSubtotal(cartItems);
    const currency = (cartItems[0]?.currency ?? 'USD').toUpperCase();

    return {
      itemCount,
      subtotal,
      currency
    };
  }, [cartItems]);

  const handleIncreaseQuantity = (slug: string, quantity: number) => {
    updateCartItemQuantity(slug, quantity + 1);
    setCartItems(getCartItems());
    setCartMessage('');
  };

  const handleDecreaseQuantity = (slug: string, quantity: number) => {
    updateCartItemQuantity(slug, quantity - 1);
    setCartItems(getCartItems());
    setCartMessage('');
  };

  const handleRemove = (slug: string) => {
    removeCartItem(slug);
    setCartItems(getCartItems());
    setCartMessage('');
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) {
      setCartMessage(paymentCopy.cart.emptyMessage);
      return;
    }

    setCartMessage(paymentCopy.cart.checkoutSoon);
  };

  const handleClearCart = () => {
    clearCartItems();
    setCartItems([]);
    setCartMessage(paymentCopy.cart.cartCleared);
  };

  return (
    <div className="auth-page-shell">
      <AuthPageHeader />

      <main className="auth-page-main cart-page-main">
        <section className="mypage-card cart-page-card" aria-label="FarmVerb shopping cart">
          <header className="cart-page-head">
            <div>
              <p className="auth-overline">{paymentCopy.cart.overline}</p>
              <h1 className="auth-title">{paymentCopy.cart.title}</h1>
              <p className="auth-copy">{paymentCopy.cart.intro}</p>
            </div>

            {cartItems.length > 0 ? (
              <button type="button" className="auth-submit auth-submit-secondary cart-page-clear" onClick={handleClearCart}>
                {paymentCopy.cart.clearCart}
              </button>
            ) : null}
          </header>

          {cartItems.length === 0 ? (
            <section className="cart-page-empty" aria-label="Empty cart">
              <p>{paymentCopy.cart.emptyTitle}</p>
              <p>{paymentCopy.cart.emptyDescription}</p>
              <Link href="/#/plugins" className="auth-submit cart-page-empty-link">
                {paymentCopy.cart.browsePlugins}
              </Link>
            </section>
          ) : (
            <div className="cart-page-layout">
              <section className="cart-page-lines" aria-label="Cart items">
                <ul className="cart-page-line-list">
                  {cartItems.map((item) => {
                    const lineTotal = item.price * item.quantity;
                    return (
                      <li key={item.slug} className="cart-page-line-item">
                        <div className="cart-page-line-main">
                          <div className="mypage-item-head">{item.name}</div>
                          <div className="cart-page-meta">
                            {formatCurrency(item.price, item.currency, paymentLocale)} {paymentCopy.cart.each}
                          </div>
                          <div className="cart-page-price-row">
                            <span>{paymentCopy.cart.lineTotal}</span>
                            <strong>{formatCurrency(lineTotal, item.currency, paymentLocale)}</strong>
                          </div>
                        </div>

                        <div className="cart-page-actions">
                          <button
                            type="button"
                            className="auth-submit auth-submit-secondary cart-page-qty-button"
                            onClick={() => handleDecreaseQuantity(item.slug, item.quantity)}
                            aria-label={`Decrease quantity for ${item.name}`}
                          >
                            -
                          </button>
                          <span className="cart-page-qty-label">
                            {paymentCopy.cart.qty} {item.quantity}
                          </span>
                          <button
                            type="button"
                            className="auth-submit auth-submit-secondary cart-page-qty-button"
                            onClick={() => handleIncreaseQuantity(item.slug, item.quantity)}
                            aria-label={`Increase quantity for ${item.name}`}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="auth-submit auth-submit-secondary cart-page-remove"
                            onClick={() => handleRemove(item.slug)}
                          >
                            {paymentCopy.cart.remove}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <aside className="cart-page-summary" aria-label="Order summary">
                <h2>{paymentCopy.cart.orderSummary}</h2>
                <div className="cart-page-summary-row">
                  <span>{paymentCopy.cart.items}</span>
                  <strong>{summary.itemCount}</strong>
                </div>
                <div className="cart-page-summary-row">
                  <span>{paymentCopy.cart.subtotal}</span>
                  <strong>{formatCurrency(summary.subtotal, summary.currency, paymentLocale)}</strong>
                </div>
                <div className="cart-page-summary-row cart-page-total-row">
                  <span>{paymentCopy.cart.total}</span>
                  <strong>{formatCurrency(summary.subtotal, summary.currency, paymentLocale)}</strong>
                </div>

                <button type="button" className="auth-submit cart-page-checkout" onClick={handleCheckout}>
                  {paymentCopy.cart.checkout}
                </button>
              </aside>
            </div>
          )}

          {cartMessage ? <p className="cart-page-inline-message">{cartMessage}</p> : null}
        </section>
      </main>
    </div>
  );
}
