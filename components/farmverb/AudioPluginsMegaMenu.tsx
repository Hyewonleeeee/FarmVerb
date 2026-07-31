'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AUDIO_PLUGIN_NAVIGATION,
  type ProductNavigationItem
} from '@/lib/ui/productNavigation';
import type { PluginSectionKey, RouteKey } from '@/lib/ui/farmVerbRoutes';

type AudioPluginsMegaMenuProps = {
  currentRoute: RouteKey;
  activePluginSection: PluginSectionKey;
};

const CLOSE_DELAY_MS = 220;

export default function AudioPluginsMegaMenu({
  currentRoute,
  activePluginSection
}: AudioPluginsMegaMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(AUDIO_PLUGIN_NAVIGATION.map((category) => category.id))
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const cancelCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) {
      return;
    }

    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const closeMenu = useCallback(() => {
    cancelCloseTimer();
    setIsOpen(false);
  }, [cancelCloseTimer]);

  const scheduleClose = useCallback(() => {
    cancelCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  }, [cancelCloseTimer]);

  useEffect(() => {
    return () => cancelCloseTimer();
  }, [cancelCloseTimer]);

  useEffect(() => {
    closeMenu();
  }, [currentRoute, activePluginSection, closeMenu]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) {
        return;
      }

      closeMenu();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      closeMenu();
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, closeMenu]);

  const handlePointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      return;
    }

    cancelCloseTimer();
    setIsOpen(true);
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      return;
    }

    scheduleClose();
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const isItemActive = (item: ProductNavigationItem) => {
    if (item.kind !== 'product' || currentRoute !== item.route) {
      return false;
    }

    if (item.route === 'plugins') {
      return item.pluginSection === activePluginSection;
    }

    return true;
  };

  return (
    <div
      className={`nav-dropdown audio-plugins-menu ${isOpen ? 'is-open' : ''}`}
      ref={rootRef}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <button
        ref={triggerRef}
        type="button"
        className="nav-link nav-link-trigger"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls="audio-plugins-mega-menu"
        onClick={() => {
          cancelCloseTimer();
          setIsOpen((current) => !current);
        }}
      >
        <span>Audio Plugins</span>
        <span className="nav-dropdown-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      <div
        id="audio-plugins-mega-menu"
        className="audio-mega-menu"
        aria-label="Audio Plugins"
        aria-hidden={!isOpen}
      >
        <div className="audio-mega-grid">
          {AUDIO_PLUGIN_NAVIGATION.map((category) => {
            const isExpanded = expandedCategories.has(category.id);
            const hasActiveItem = category.items.some(isItemActive);

            return (
              <section
                key={category.id}
                className={`audio-mega-category ${isExpanded ? 'is-expanded' : ''} ${
                  hasActiveItem ? 'has-active-item' : ''
                }`}
                aria-labelledby={`audio-mega-heading-${category.id}`}
              >
                <p id={`audio-mega-heading-${category.id}`} className="audio-mega-category-label">
                  {category.label}
                </p>
                <button
                  type="button"
                  className="audio-mega-category-toggle"
                  aria-expanded={isExpanded}
                  aria-controls={`audio-mega-list-${category.id}`}
                  tabIndex={isOpen ? 0 : -1}
                  onClick={() => toggleCategory(category.id)}
                >
                  <span>{category.label}</span>
                  <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                </button>

                <div id={`audio-mega-list-${category.id}`} className="audio-mega-list">
                  {category.items.map((item) => {
                    const isActive = isItemActive(item);

                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className={`audio-mega-item ${isActive ? 'is-active' : ''}`}
                        data-route={item.route}
                        data-plugin-section={item.pluginSection}
                        aria-current={isActive ? 'page' : undefined}
                        tabIndex={isOpen ? 0 : -1}
                        onClick={closeMenu}
                      >
                        <span>{item.label}</span>
                        <span className="audio-mega-item-arrow" aria-hidden="true">
                          ↗
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
