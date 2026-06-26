'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { getPaymentCopy, type PaymentLocale } from '@/lib/i18n/payment';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  clearCartItems,
  getCatalogProductByName,
  getCatalogProductBySlug,
  getCartItemCount,
  getCartItems,
  getCartSubtotal,
  removeCartItem,
  subscribeToCart,
  type CartItem
} from '@/lib/cart/store';

const formatCurrency = (amount: number, currency: string, locale: PaymentLocale) => {
  const numberLocale = locale === 'ko' ? 'ko-KR' : 'en-US';
  const normalizedCurrency = currency.toUpperCase();
  const maxFractionDigits = normalizedCurrency === 'USD' ? 0 : 2;

  try {
    return new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: maxFractionDigits,
      minimumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${amount.toFixed(maxFractionDigits)} ${normalizedCurrency}`;
  }
};

export default function CartPage() {
  const paymentLocale: PaymentLocale = 'en';
  const paymentCopy = getPaymentCopy(paymentLocale);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartMessage, setCartMessage] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) {
          return;
        }

        if (!data.session) {
          clearCartItems();
          setCartItems([]);
          window.location.assign('/login?redirect=%2Fcart');
          return;
        }

        setIsLoggedIn(true);
        setIsAuthReady(true);
        setCartItems(getCartItems());
      })
      .catch(() => {
        clearCartItems();
        setCartItems([]);
        window.location.assign('/login?redirect=%2Fcart');
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        clearCartItems();
        setCartItems([]);
        setIsLoggedIn(false);
        setIsAuthReady(true);
        window.location.assign('/login?redirect=%2Fcart');
        return;
      }

      setIsLoggedIn(true);
      setIsAuthReady(true);
      setCartItems(getCartItems());
    });

    const syncCart = () => {
      if (isLoggedIn) {
        setCartItems(getCartItems());
      }
    };

    const unsubscribeCart = subscribeToCart(syncCart);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      unsubscribeCart();
    };
  }, [isLoggedIn]);

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

  const handleRemove = (slug: string) => {
    removeCartItem(slug);
    setCartItems(getCartItems());
    setCartMessage('');
  };

  const handleBuyItem = (_productName: string) => {
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

          {!isAuthReady ? (
            <section className="cart-page-empty" aria-label="Checking cart access">
              <p>Checking your account...</p>
            </section>
          ) : !isLoggedIn ? (
            <section className="cart-page-empty" aria-label="Login required">
              <p>Please log in to view your cart.</p>
              <Link href="/login?redirect=%2Fcart" className="auth-submit cart-page-empty-link">
                Login
              </Link>
            </section>
          ) : cartItems.length === 0 ? (
            <section className="cart-page-empty" aria-label="Empty cart">
              <p>{paymentCopy.cart.emptyTitle}</p>
              <p>{paymentCopy.cart.emptyDescription}</p>
              <Link href="/plugins" className="auth-submit cart-page-empty-link">
                {paymentCopy.cart.browsePlugins}
              </Link>
            </section>
          ) : (
            <div className="cart-page-layout">
              <section className="cart-page-lines" aria-label="Cart items">
                <ul className="cart-page-line-list">
                  {cartItems.map((item) => {
                    const catalogImage = getCatalogProductBySlug(item.slug)?.image ?? getCatalogProductByName(item.name)?.image ?? null;
                    const itemImage = catalogImage ?? item.image;

                    return (
                      <li key={item.slug} className="cart-page-line-item">
                        <figure className="cart-page-item-media" aria-hidden="true">
                          {itemImage ? <img src={itemImage} alt="" /> : <span>{item.name.slice(0, 2)}</span>}
                        </figure>

                        <div className="cart-page-line-main">
                          <div className="mypage-item-head">{item.name}</div>
                          <p className="cart-page-item-description">{item.description}</p>
                          <button
                            type="button"
                            className="auth-submit auth-submit-secondary cart-page-buy"
                            onClick={() => handleBuyItem(item.name)}
                          >
                            Buy {item.name}
                          </button>
                        </div>

                        <div className="cart-page-item-price">{formatCurrency(item.price, item.currency, paymentLocale)}</div>

                        <button
                          type="button"
                          className="auth-submit auth-submit-secondary cart-page-remove"
                          onClick={() => handleRemove(item.slug)}
                        >
                          {paymentCopy.cart.remove}
                        </button>
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
                <div className="cart-page-summary-row cart-page-total-row">
                  <span>{paymentCopy.cart.total}</span>
                  <strong>{formatCurrency(summary.subtotal, summary.currency, paymentLocale)}</strong>
                </div>
                <p className="cart-page-inline-message">Each item has its own placeholder Buy button.</p>
              </aside>
            </div>
          )}

          {cartMessage ? <p className="cart-page-inline-message">{cartMessage}</p> : null}
        </section>
      </main>
    </div>
  );
}
