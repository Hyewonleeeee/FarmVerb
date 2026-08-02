'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import AuthNav from '@/components/auth/AuthNav';
import {
  AUDIO_PLUGIN_NAVIGATION,
  type ProductNavigationItem
} from '@/lib/ui/productNavigation';
import { type PluginSectionKey, type RouteKey } from '@/lib/ui/farmVerbRoutes';

type MobileSiteNavigationProps = {
  currentRoute: RouteKey;
  activePluginSection: PluginSectionKey;
  showCart: boolean;
  cartItemCount: number;
};

function isItemActive(
  item: ProductNavigationItem,
  currentRoute: RouteKey,
  activePluginSection: PluginSectionKey
) {
  if (item.kind !== 'product' || currentRoute !== item.route) {
    return false;
  }

  return item.pluginSection ? activePluginSection === item.pluginSection : true;
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 4h2l1.8 9.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L20 8H7" />
      <circle cx="9" cy="19" r="1.25" />
      <circle cx="17" cy="19" r="1.25" />
    </svg>
  );
}

export default function MobileSiteNavigation({
  currentRoute,
  activePluginSection,
  showCart,
  cartItemCount
}: MobileSiteNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAudioPluginsOpen, setIsAudioPluginsOpen] = useState(
    currentRoute === 'plugins' || currentRoute === 'instrument'
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const closeMenu = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const openMenu = useCallback(() => {
    setIsAudioPluginsOpen(currentRoute === 'plugins' || currentRoute === 'instrument');
    setIsOpen(true);
  }, [currentRoute]);

  useEffect(() => {
    closeMenu(false);
  }, [activePluginSection, closeMenu, currentRoute]);

  useEffect(() => {
    if (!isOpen) return;

    document.body.classList.add('mobile-nav-open');

    window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>('button, a[href]')?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu(true);
        return;
      }

      if (event.key === 'Tab' && drawerRef.current) {
        const focusableItems = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
        ).filter((item) => item.getClientRects().length > 0);
        const firstItem = focusableItems[0];
        const lastItem = focusableItems[focusableItems.length - 1];

        if (!firstItem || !lastItem) return;

        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault();
          lastItem.focus();
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }
    };
    const desktopMedia = window.matchMedia('(min-width: 901px)');
    const onDesktopChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeMenu(false);
    };

    window.addEventListener('keydown', onKeyDown);
    desktopMedia.addEventListener('change', onDesktopChange);

    return () => {
      document.body.classList.remove('mobile-nav-open');
      window.removeEventListener('keydown', onKeyDown);
      desktopMedia.removeEventListener('change', onDesktopChange);
    };
  }, [closeMenu, isOpen]);

  const closeAfterNavigation = () => closeMenu(false);

  return (
    <div className="mobile-site-navigation">
      <div className="mobile-nav-bar site-container">
        <button
          ref={triggerRef}
          type="button"
          className="mobile-nav-trigger"
          aria-label="Open navigation"
          aria-expanded={isOpen}
          aria-controls="mobile-primary-navigation"
          onClick={openMenu}
        >
          <span />
          <span />
          <span />
        </button>

        <Link href="/" className="mobile-nav-brand" data-route="home" onClick={closeAfterNavigation}>
          FARMVERB
        </Link>

        {showCart ? (
          <Link
            href="/cart"
            className="mobile-nav-cart"
            data-route="cart"
            aria-label={`Cart with ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`}
            onClick={closeAfterNavigation}
          >
            <CartIcon />
            <span className="mobile-nav-cart-count">{cartItemCount}</span>
          </Link>
        ) : (
          <span className="mobile-nav-cart-spacer" aria-hidden="true" />
        )}
      </div>

      {isOpen ? (
        <div className="mobile-nav-layer">
          <button
            type="button"
            className="mobile-nav-backdrop"
            aria-label="Close navigation"
            tabIndex={-1}
            onClick={() => closeMenu(false)}
          />

          <nav
            ref={drawerRef}
            id="mobile-primary-navigation"
            className="mobile-nav-drawer"
            aria-label="Mobile navigation"
          >
            <div className="mobile-nav-drawer-head">
              <span>Menu</span>
              <button type="button" className="mobile-nav-close" onClick={() => closeMenu(true)} aria-label="Close navigation">
                <span aria-hidden="true">&times;</span>
              </button>
            </div>

            <div className="mobile-nav-primary-links">
              <Link
                href="/instrument"
                data-route="instrument"
                className={currentRoute === 'instrument' ? 'is-active' : undefined}
                aria-current={currentRoute === 'instrument' ? 'page' : undefined}
                onClick={closeAfterNavigation}
              >
                Software Instrument
              </Link>

              <button
                type="button"
                className={`mobile-nav-accordion-trigger${isAudioPluginsOpen ? ' is-open' : ''}${
                  currentRoute === 'plugins' || currentRoute === 'instrument' ? ' is-active' : ''
                }`}
                aria-expanded={isAudioPluginsOpen}
                aria-controls="mobile-audio-plugin-navigation"
                onClick={() => setIsAudioPluginsOpen((open) => !open)}
              >
                <span>Audio Plugins</span>
                <span className="mobile-nav-chevron" aria-hidden="true" />
              </button>

              {isAudioPluginsOpen ? (
                <div id="mobile-audio-plugin-navigation" className="mobile-nav-product-groups">
                  {AUDIO_PLUGIN_NAVIGATION.map((category) => (
                    <section className="mobile-nav-product-group" key={category.id} aria-labelledby={`mobile-${category.id}`}>
                      <h2 id={`mobile-${category.id}`}>{category.label}</h2>
                      <div className="mobile-nav-product-links">
                        {category.items.map((item) => {
                          const active = isItemActive(item, currentRoute, activePluginSection);
                          return (
                            <Link
                              key={item.id}
                              href={item.href}
                              data-route={item.route}
                              data-plugin-section={item.pluginSection}
                              className={active ? 'is-active' : undefined}
                              aria-current={active ? 'page' : undefined}
                              onClick={closeAfterNavigation}
                            >
                              {item.label}
                            </Link>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}

              <Link
                href="/sample-pack"
                data-route="sample-pack"
                className={currentRoute === 'sample-pack' ? 'is-active' : undefined}
                aria-current={currentRoute === 'sample-pack' ? 'page' : undefined}
                onClick={closeAfterNavigation}
              >
                Sample Pack
              </Link>
              <Link
                href="/support"
                data-route="support"
                className={currentRoute === 'support' ? 'is-active' : undefined}
                aria-current={currentRoute === 'support' ? 'page' : undefined}
                onClick={closeAfterNavigation}
              >
                Support
              </Link>
            </div>

            <div className="mobile-nav-account" onClick={(event) => {
              if ((event.target as HTMLElement).closest('a, button')) closeAfterNavigation();
            }}>
              <AuthNav />
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
