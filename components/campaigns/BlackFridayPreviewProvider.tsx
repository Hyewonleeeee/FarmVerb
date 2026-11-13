'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react';
import {
  getCampaignClockState,
  isCampaignPhase,
  parseCampaignSnapshot,
  type CampaignPhase,
  type CampaignSnapshot
} from '@/lib/campaigns/blackFridayClock';

type BlackFridayPreviewContextValue = {
  // Backwards-compatible alias: this NEVER means a Live sale is enabled.
  enabled: boolean;
  previewMode: boolean;
  campaignEnabled: boolean;
  phase: CampaignPhase;
  saleActive: boolean;
  clockReady: boolean;
};

const BlackFridayPreviewContext = createContext<BlackFridayPreviewContextValue>({
  enabled: false, previewMode: false, campaignEnabled: false,
  phase: 'before', saleActive: false, clockReady: false
});

export function useBlackFridayPreview() {
  return useContext(BlackFridayPreviewContext);
}

export default function BlackFridayPreviewProvider({
  enabled,
  campaignEnabled = enabled,
  children
}: {
  enabled: boolean;
  campaignEnabled?: boolean;
  children: ReactNode;
}) {
  // Never serialize a time-based SSR result into a cached page. Initial render
  // and hydration agree; the non-cacheable endpoint establishes the clock.
  const [value, setValue] = useState<BlackFridayPreviewContextValue>({
    enabled, previewMode: enabled, campaignEnabled,
    phase: 'before', saleActive: false, clockReady: false
  });

  useEffect(() => {
    let mounted = true;
    let inFlight = false;
    let timer: number | null = null;
    let boundaryTimer: number | null = null;
    let timeout: number | null = null;
    let controller: AbortController | null = null;
    let snapshot: CampaignSnapshot | null = null;
    let receivedAt = 0;
    // The provider survives product soft navigation. A phase chosen in a design
    // URL remains selected when product links omit the query parameter.
    let forcedPhase: CampaignPhase | null = null;
    const readPreviewPhase = () => {
      if (!enabled) return;
      const requested = new URLSearchParams(window.location.search).get('bf');
      if (isCampaignPhase(requested)) forcedPhase = requested;
    };
    readPreviewPhase();

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const markUnready = () => {
      if (!mounted) return;
      setValue(previous => ({ ...previous, clockReady: false }));
    };
    const updateFromClock = () => {
      if (!mounted || !snapshot) return;
      const clock = getCampaignClockState(snapshot, performance.now() - receivedAt);
      setValue({
        enabled, previewMode: enabled, campaignEnabled: snapshot.campaignEnabled, ...clock
      });
    };
    const schedule = (delay: number, invalidate: boolean) => {
      clearTimer();
      if (!mounted) return;
      timer = window.setTimeout(() => {
        timer = null;
        updateFromClock();
        void refresh(invalidate);
      }, Math.max(1, Math.min(delay, 30_000)));
    };
    const refresh = async (invalidate = false) => {
      // A regular poll can start just before a boundary. Its request timeout
      // must not create a window in which the previous price remains trusted.
      const nearBoundary = snapshot?.nextBoundaryAt !== null && snapshot !== null
        && snapshot.nextBoundaryAt - snapshot.serverNowMs - (performance.now() - receivedAt) <= 8_000;
      if (invalidate || nearBoundary) markUnready();
      if (!mounted || inFlight) return;
      clearTimer();
      readPreviewPhase();
      inFlight = true;
      controller = new AbortController();
      const requestedAt = performance.now();
      timeout = window.setTimeout(() => {
        markUnready();
        controller?.abort();
      }, 8_000);
      try {
        const query = enabled && forcedPhase ? `?bf=${forcedPhase}` : '';
        const response = await fetch(`/api/campaign/status${query}`, {
          cache: 'no-store', credentials: 'same-origin', signal: controller.signal
        });
        if (!response.ok) throw new Error('Campaign clock unavailable.');
        const next = parseCampaignSnapshot(await response.json(), enabled);
        const roundTripMs = performance.now() - requestedAt;
        if (!next || next.forcedPhase !== (enabled ? forcedPhase : null)
          || roundTripMs < 0 || roundTripMs >= 8_000) throw new Error('Invalid campaign clock.');
        if (!mounted) return;
        snapshot = next;
        // Use the request start as a conservative upper bound for server time.
        // This may invalidate a price slightly early (by at most one RTT), but
        // never loses the transit time or rewinds after a stale boundary reply.
        receivedAt = requestedAt;
        const remaining = next.nextBoundaryAt === null
          ? Infinity : next.nextBoundaryAt - next.serverNowMs - roundTripMs;
        if (boundaryTimer !== null) window.clearTimeout(boundaryTimer);
        boundaryTimer = null;
        if (next.nextBoundaryAt !== null) {
          // Keep this separate from polling: a request already in flight must
          // not delay the UI's start/end transition or restore stale readiness.
          boundaryTimer = window.setTimeout(() => {
            boundaryTimer = null;
            updateFromClock();
            void refresh(true);
          }, Math.max(1, Math.min(remaining, 2_147_483_647)));
        }
        if (remaining <= 0) {
          // The response may have crossed a boundary while in transit. Do not
          // enable checkout from that old phase; obtain a new server snapshot.
          setValue({
            enabled, previewMode: enabled, campaignEnabled: next.campaignEnabled,
            ...getCampaignClockState(next, roundTripMs), clockReady: false
          });
          schedule(1_000, true);
        } else {
          updateFromClock();
          schedule(Math.min(remaining, 30_000), remaining <= 30_000);
        }
      } catch {
        markUnready();
        schedule(5_000, true);
      } finally {
        if (timeout !== null) window.clearTimeout(timeout);
        timeout = null;
        controller = null;
        inFlight = false;
      }
    };
    const refreshOnFocus = () => { void refresh(true); };
    const onVisibility = () => {
      markUnready();
      if (document.visibilityState === 'visible') void refresh(true);
    };
    const onHistory = () => { readPreviewPhase(); void refresh(true); };
    void refresh(true);
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('online', refreshOnFocus);
    window.addEventListener('popstate', onHistory);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mounted = false;
      clearTimer();
      if (boundaryTimer !== null) window.clearTimeout(boundaryTimer);
      if (timeout !== null) window.clearTimeout(timeout);
      controller?.abort();
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('online', refreshOnFocus);
      window.removeEventListener('popstate', onHistory);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, campaignEnabled]);

  return (
    <BlackFridayPreviewContext.Provider value={value}>
      {children}
    </BlackFridayPreviewContext.Provider>
  );
}
