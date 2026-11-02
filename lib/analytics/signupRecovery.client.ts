import {
  GA4_MEASUREMENT_ID,
  GOOGLE_ADS_SIGNUP_SEND_TO
} from '@/lib/analytics/config';
import type {
  PendingSignupConversion,
  SignupAnalyticsChannel,
  SignupRecoveryResult
} from '@/lib/analytics/signupRecovery';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const PRODUCTION_HOSTS = new Set(['farmverb.com', 'www.farmverb.com']);
const SIGNUP_API_PATH = '/api/auth/signup-conversions';
const GA4_STORAGE_PREFIX = 'farmverb.ga4.sign-up.v1';
const GOOGLE_ADS_STORAGE_PREFIX = 'farmverb.google-ads.sign-up.v1';
const RETRY_AFTER_MS = 15_000;
const attempts = new WeakMap<Window, Map<string, { startedAt: number; processed: boolean }>>();

function isPendingSignupConversion(value: unknown): value is PendingSignupConversion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<PendingSignupConversion>;
  return typeof candidate.eventId === 'string'
    && candidate.method === 'email_otp'
    && typeof candidate.ga4Pending === 'boolean'
    && typeof candidate.googleAdsPending === 'boolean';
}

function getStorageKey(channel: SignupAnalyticsChannel, eventId: string) {
  const prefix = channel === 'ga4' ? GA4_STORAGE_PREFIX : GOOGLE_ADS_STORAGE_PREFIX;
  return `${prefix}:${eventId}`;
}

function readProcessedMarker(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) === 'processed';
  } catch {
    return false;
  }
}

function markProcessed(storageKey: string) {
  try {
    window.localStorage.setItem(storageKey, 'processed');
  } catch {
    // The authenticated server acknowledgement remains the durable fallback.
  }
}

function sendSignupEvent(
  channel: SignupAnalyticsChannel,
  conversion: PendingSignupConversion,
  onProcessed: () => void
) {
  if (typeof window.gtag !== 'function') {
    return false;
  }

  const storageKey = getStorageKey(channel, conversion.eventId);
  let windowAttempts = attempts.get(window);
  if (!windowAttempts) {
    windowAttempts = new Map();
    attempts.set(window, windowAttempts);
  }

  const previous = windowAttempts.get(storageKey);
  if (readProcessedMarker(storageKey) || previous?.processed) {
    onProcessed();
    return false;
  }
  if (previous && Date.now() - previous.startedAt < RETRY_AFTER_MS) {
    return false;
  }

  const attempt = { startedAt: Date.now(), processed: false };
  windowAttempts.set(storageKey, attempt);
  const complete = () => {
    if (attempt.processed) {
      return;
    }
    attempt.processed = true;
    windowAttempts?.set(storageKey, attempt);
    markProcessed(storageKey);
    onProcessed();
  };

  try {
    if (channel === 'ga4') {
      window.gtag('event', 'sign_up', {
        method: conversion.method,
        send_to: GA4_MEASUREMENT_ID,
        event_callback: complete
      });
    } else {
      window.gtag('event', 'conversion', {
        send_to: GOOGLE_ADS_SIGNUP_SEND_TO,
        transaction_id: conversion.eventId,
        event_callback: complete
      });
    }
    return true;
  } catch {
    windowAttempts.delete(storageKey);
    return false;
  }
}

export async function recoverSignupAnalytics(accessToken: string): Promise<SignupRecoveryResult> {
  if (
    typeof window === 'undefined'
    || !PRODUCTION_HOSTS.has(window.location.hostname.toLowerCase())
    || !accessToken.trim()
  ) {
    return { state: 'none' };
  }

  if (typeof window.gtag !== 'function') {
    return { state: 'retry' };
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  try {
    const reserveResponse = await fetch(SIGNUP_API_PATH, {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify({ action: 'reserve' })
    });
    if (!reserveResponse.ok) {
      return reserveResponse.status === 401 || reserveResponse.status === 404
        ? { state: 'none' }
        : { state: 'retry' };
    }

    const payload = await reserveResponse.json() as {
      conversion?: unknown;
      leaseToken?: unknown;
    };
    if (!isPendingSignupConversion(payload.conversion) || typeof payload.leaseToken !== 'string') {
      return { state: 'none' };
    }

    const conversion = payload.conversion;
    const acknowledge = async (channel: SignupAnalyticsChannel) => {
      try {
        await fetch(SIGNUP_API_PATH, {
          method: 'POST',
          headers,
          cache: 'no-store',
          keepalive: true,
          body: JSON.stringify({
            action: 'ack',
            eventId: conversion.eventId,
            channel,
            leaseToken: payload.leaseToken
          })
        });
      } catch {
        // A later authenticated visit re-acknowledges the local processed marker.
      }
    };

    if (conversion.ga4Pending) {
      sendSignupEvent('ga4', conversion, () => void acknowledge('ga4'));
    }
    if (conversion.googleAdsPending) {
      sendSignupEvent('google_ads', conversion, () => void acknowledge('google_ads'));
    }

    return { state: 'reserved', conversion };
  } catch {
    return { state: 'retry' };
  }
}
