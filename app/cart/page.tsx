'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import AuthPageHeader from '@/components/auth/AuthPageHeader';
import { getPaymentCopy, type PaymentLocale } from '@/lib/i18n/payment';
import {
  clearCartItems,
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
  const router = useRouter();
  const paymentLocale: PaymentLocale = 'en';
  const paymentCopy = getPaymentCopy(paymentLocale);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [cartMessage, setCartMessage] = useState('');

  useEffect(() => {
    const syncCart = () => {
      setCartItems(getCartItems());
    };

    syncCart();
    return subscribeToCart(syncCart);
  }, []);

  useEffect(() => {
    if (cartItems.length === 0) {
      setSelectedSlugs([]);
      return;
    }

    setSelectedSlugs(cartItems.map((item) => item.slug));
  }, [cartItems]);

  const selectedItems = useMemo(
    () => cartItems.filter((item) => selectedSlugs.includes(item.slug)),
    [cartItems, selectedSlugs]
  );

  const summary = useMemo(() => {
    const itemCount = getCartItemCount(selectedItems);
    const subtotal = getCartSubtotal(selectedItems);
    const currency = (selectedItems[0]?.currency ?? cartItems[0]?.currency ?? 'USD').toUpperCase();

    return {
      itemCount,
      subtotal,
      currency
    };
  }, [cartItems, selectedItems]);

  const handleToggleSelect = (slug: string) => {
    setSelectedSlugs((current) => {
      if (current.includes(slug)) {
        return current.filter((itemSlug) => itemSlug !== slug);
      }

      return [...current, slug];
    });
    setCartMessage('');
  };

  const handleRemove = (slug: string) => {
    removeCartItem(slug);
    setCartItems(getCartItems());
    setCartMessage('');
  };

  const handleCheckout = () => {
    if (selectedItems.length === 0) {
      setCartMessage(paymentCopy.cart.selectAtLeastOneProductToCheckout);
      return;
    }

    router.push('/checkout');
  };

  const handleClearCart = () => {
    clearCartItems();
    setCartItems([]);
    setSelectedSlugs([]);
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
              <Link href="/plugins" className="auth-submit cart-page-empty-link">
                {paymentCopy.cart.browsePlugins}
              </Link>
            </section>
          ) : (
            <div className="cart-page-layout">
              <section className="cart-page-lines" aria-label="Cart items">
                <ul className="cart-page-line-list">
                  {cartItems.map((item) => {
                    const isSelected = selectedSlugs.includes(item.slug);
                    const catalogImage = getCatalogProductBySlug(item.slug)?.image ?? null;
                    const itemImage = catalogImage ?? item.image;

                    return (
                      <li key={item.slug} className={`cart-page-line-item ${isSelected ? 'is-selected' : ''}`}>
                        <figure className="cart-page-item-media" aria-hidden="true">
                          {itemImage ? <img src={itemImage} alt="" /> : <span>{item.name.slice(0, 2)}</span>}
                        </figure>

                        <label className="cart-page-item-select">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(item.slug)}
                            aria-label={`Select ${item.name} for checkout`}
                          />
                          <span className="cart-page-item-checkbox" aria-hidden="true" />
                        </label>

                        <div className="cart-page-line-main">
                          <div className="mypage-item-head">{item.name}</div>
                          <p className="cart-page-item-description">{item.description}</p>
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

                <button
                  type="button"
                  className="auth-submit cart-page-checkout"
                  onClick={handleCheckout}
                  disabled={selectedItems.length === 0}
                >
                  {paymentCopy.cart.checkout}
                </button>

                {selectedItems.length === 0 ? (
                  <p className="cart-page-inline-message">{paymentCopy.cart.selectAtLeastOneProductToCheckout}</p>
                ) : null}
              </aside>
            </div>
          )}

          {cartMessage && selectedItems.length > 0 ? <p className="cart-page-inline-message">{cartMessage}</p> : null}
        </section>
      </main>
    </div>
  );
}
