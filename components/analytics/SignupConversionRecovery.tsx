'use client';

import { useEffect } from 'react';
import { recoverSignupAnalytics } from '@/lib/analytics/signupRecovery.client';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const GOOGLE_ANALYTICS_READY_EVENT = 'farmverb-ga-ready';
const NETWORK_RETRY_DELAY_MS = 5_000;
const LEASE_RETRY_DELAY_MS = 65_000;
const MAX_AUTOMATIC_RETRIES = 4;

export default function SignupConversionRecovery() {
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let mounted = true;
    let accessToken: string | null = null;
    let accountId: string | null = null;
    let resolved = false;
    let inFlight = false;
    let retryBudget = MAX_AUTOMATIC_RETRIES;
    let retryTimer: number | null = null;

    const clearRetry = () => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const scheduleRetry = (delay: number) => {
      clearRetry();
      if (!mounted || retryBudget <= 0 || !accessToken) {
        return;
      }
      retryBudget -= 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void runRecovery();
      }, delay);
    };

    const runRecovery = async () => {
      if (!mounted || inFlight || !accessToken) {
        return;
      }

      const token = accessToken;
      const activeAccountId = accountId;
      inFlight = true;
      try {
        const result = await recoverSignupAnalytics(token);
        if (!mounted || accessToken !== token || accountId !== activeAccountId) {
          return;
        }
        if (result.state === 'retry') {
          scheduleRetry(NETWORK_RETRY_DELAY_MS);
        } else if (result.state === 'reserved') {
          // A callback/ACK interrupted by navigation becomes retryable after the
          // DB lease expires. The local marker prevents resending delivered tags.
          scheduleRetry(LEASE_RETRY_DELAY_MS);
        } else {
          resolved = true;
          clearRetry();
        }
      } finally {
        inFlight = false;
      }
    };

    const retryFromExternalSignal = () => {
      if (resolved) {
        return;
      }
      retryBudget = MAX_AUTOMATIC_RETRIES;
      void runRecovery();
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }
      accessToken = data.session?.access_token ?? null;
      accountId = data.session?.user.id ?? null;
      if (accessToken) {
        void runRecovery();
      }
    }).catch(() => {
      // Authentication remains usable if optional analytics recovery is offline.
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextAccountId = session?.user.id ?? null;
      if (nextAccountId !== accountId) {
        resolved = false;
      }
      accountId = nextAccountId;
      accessToken = session?.access_token ?? null;
      retryBudget = MAX_AUTOMATIC_RETRIES;
      clearRetry();
      if (accessToken) {
        void runRecovery();
      }
    });

    window.addEventListener('online', retryFromExternalSignal);
    window.addEventListener('focus', retryFromExternalSignal);
    window.addEventListener(GOOGLE_ANALYTICS_READY_EVENT, retryFromExternalSignal);

    return () => {
      mounted = false;
      accessToken = null;
      accountId = null;
      clearRetry();
      subscription.unsubscribe();
      window.removeEventListener('online', retryFromExternalSignal);
      window.removeEventListener('focus', retryFromExternalSignal);
      window.removeEventListener(GOOGLE_ANALYTICS_READY_EVENT, retryFromExternalSignal);
    };
  }, []);

  return null;
}
