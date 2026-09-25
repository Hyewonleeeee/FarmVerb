'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const FARMVERB_ROUTE_CHANGE_EVENT = 'farmverb-routechange';
const GOOGLE_ANALYTICS_READY_EVENT = 'farmverb-ga-ready';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function GoogleAnalyticsPageViews({
  measurementId
}: {
  measurementId: string;
}) {
  const pathname = usePathname();
  const lastTrackedLocationRef = useRef<string | null>(null);

  const trackCurrentPage = useCallback(() => {
    if (typeof window.gtag !== 'function') {
      return;
    }

    const pagePath = `${window.location.pathname}${window.location.search}`;
    if (lastTrackedLocationRef.current === pagePath) {
      return;
    }

    lastTrackedLocationRef.current = pagePath;
    window.gtag('event', 'page_view', {
      send_to: measurementId,
      page_title: document.title,
      page_location: window.location.href
    });
  }, [measurementId]);

  useEffect(() => {
    const timerId = window.setTimeout(trackCurrentPage, 0);
    return () => window.clearTimeout(timerId);
  }, [pathname, trackCurrentPage]);

  useEffect(() => {
    let timerId: number | null = null;

    const schedulePageView = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }

      // FarmVerb updates its custom route URL immediately after dispatching its
      // route-change event. Deferring one task reads the final URL and title.
      timerId = window.setTimeout(() => {
        timerId = null;
        trackCurrentPage();
      }, 0);
    };

    window.addEventListener(FARMVERB_ROUTE_CHANGE_EVENT, schedulePageView);
    window.addEventListener(GOOGLE_ANALYTICS_READY_EVENT, schedulePageView);
    window.addEventListener('popstate', schedulePageView);

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }

      window.removeEventListener(FARMVERB_ROUTE_CHANGE_EVENT, schedulePageView);
      window.removeEventListener(GOOGLE_ANALYTICS_READY_EVENT, schedulePageView);
      window.removeEventListener('popstate', schedulePageView);
    };
  }, [trackCurrentPage]);

  return null;
}
