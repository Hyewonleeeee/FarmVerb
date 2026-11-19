import { isBlackFriday2026PreviewEnvironment } from './blackFriday2026';

export type CampaignPhase = 'before' | 'active' | 'after';

// Asia/Seoul is UTC+09:00: November 20 00:00 through December 2 00:00 KST.
// The exclusive end includes all of December 1, independent of visitor timezone.
export const BLACK_FRIDAY_STARTS_AT = '2026-11-19T15:00:00.000Z';
export const BLACK_FRIDAY_END_EXCLUSIVE = '2026-12-01T15:00:00.000Z';
export const BLACK_FRIDAY_START_MS = Date.parse(BLACK_FRIDAY_STARTS_AT);
export const BLACK_FRIDAY_END_MS = Date.parse(BLACK_FRIDAY_END_EXCLUSIVE);
export const CAMPAIGN_CLOCK_MAX_AGE_MS = 60_000;

export type CampaignRuntime = {
  previewMode: boolean;
  campaignEnabled: boolean;
  phase: CampaignPhase;
  serverNowMs: number;
  nextBoundaryAt: number | null;
};

export type CampaignSnapshot = CampaignRuntime & {
  ok: true;
  startsAt: typeof BLACK_FRIDAY_STARTS_AT;
  endExclusive: typeof BLACK_FRIDAY_END_EXCLUSIVE;
  forcedPhase: CampaignPhase | null;
};

export function isCampaignPhase(value: unknown): value is CampaignPhase {
  return value === 'before' || value === 'active' || value === 'after';
}

export function getCampaignPhase(nowMs: number): CampaignPhase {
  if (!Number.isFinite(nowMs)) throw new Error('A finite campaign time is required.');
  if (nowMs < BLACK_FRIDAY_START_MS) return 'before';
  return nowMs < BLACK_FRIDAY_END_MS ? 'active' : 'after';
}

function nextBoundary(phase: CampaignPhase): number | null {
  if (phase === 'before') return BLACK_FRIDAY_START_MS;
  return phase === 'active' ? BLACK_FRIDAY_END_MS : null;
}

// Call on the server for authoritative decisions; inject nowMs in tests. No
// module-level time or public/browser environment flag enables a Live campaign.
export function getCampaignRuntime(
  env: Record<string, string | undefined>,
  nowMs: number = Date.now()
): CampaignRuntime {
  const previewMode = isBlackFriday2026PreviewEnvironment(env);
  const campaignEnabled = previewMode || env.BLACK_FRIDAY_2026_ENABLED === 'true';
  const actualPhase = getCampaignPhase(nowMs);
  const phase = campaignEnabled ? actualPhase : 'before';
  return {
    previewMode, campaignEnabled, phase, serverNowMs: nowMs,
    nextBoundaryAt: campaignEnabled ? nextBoundary(phase) : null
  };
}

export function createCampaignSnapshot(runtime: CampaignRuntime, requestedPhase?: unknown): CampaignSnapshot {
  const forcedPhase = runtime.previewMode && isCampaignPhase(requestedPhase) ? requestedPhase : null;
  return {
    ...runtime,
    phase: forcedPhase ?? runtime.phase,
    nextBoundaryAt: forcedPhase ? null : runtime.nextBoundaryAt,
    ok: true,
    startsAt: BLACK_FRIDAY_STARTS_AT,
    endExclusive: BLACK_FRIDAY_END_EXCLUSIVE,
    forcedPhase
  };
}

// Reject malformed, mixed-version or mode-inconsistent responses instead of
// letting a cached/invalid response enable checkout or advertise a stale price.
export function parseCampaignSnapshot(value: unknown, expectedPreviewMode: boolean): CampaignSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.ok !== true || data.previewMode !== expectedPreviewMode
    || typeof data.campaignEnabled !== 'boolean' || !isCampaignPhase(data.phase)
    || typeof data.serverNowMs !== 'number' || !Number.isSafeInteger(data.serverNowMs)
    || Math.abs(data.serverNowMs) > 8_640_000_000_000_000
    || data.startsAt !== BLACK_FRIDAY_STARTS_AT || data.endExclusive !== BLACK_FRIDAY_END_EXCLUSIVE
    || (data.forcedPhase !== null && !isCampaignPhase(data.forcedPhase))) return null;
  if (data.previewMode && !data.campaignEnabled) return null;
  if (data.forcedPhase !== null && (!data.previewMode || data.phase !== data.forcedPhase)) return null;
  const phase = data.campaignEnabled ? getCampaignPhase(data.serverNowMs) : 'before';
  if (data.phase !== (data.forcedPhase ?? phase)) return null;
  const boundary = data.campaignEnabled && data.forcedPhase === null ? nextBoundary(phase) : null;
  if (data.nextBoundaryAt !== boundary) return null;
  return {
    ok: true, previewMode: expectedPreviewMode, campaignEnabled: data.campaignEnabled,
    phase: data.phase, serverNowMs: data.serverNowMs, nextBoundaryAt: boundary,
    startsAt: BLACK_FRIDAY_STARTS_AT, endExclusive: BLACK_FRIDAY_END_EXCLUSIVE,
    forcedPhase: data.forcedPhase as CampaignPhase | null
  };
}

// elapsedMs must come from performance.now(), never the browser wall clock.
// Crossing a boundary updates presentation but requires a fresh server response
// before the caller can trust the price for checkout.
export function getCampaignClockState(snapshot: CampaignSnapshot, elapsedMs: number) {
  const validElapsed = Number.isFinite(elapsedMs) && elapsedMs >= 0;
  const estimatedNow = snapshot.serverNowMs + (validElapsed ? elapsedMs : 0);
  const phase = snapshot.forcedPhase
    ?? (snapshot.campaignEnabled ? getCampaignPhase(estimatedNow) : 'before');
  return {
    phase,
    saleActive: snapshot.campaignEnabled && phase === 'active',
    clockReady: validElapsed && elapsedMs < CAMPAIGN_CLOCK_MAX_AGE_MS
      && (snapshot.nextBoundaryAt === null || estimatedNow < snapshot.nextBoundaryAt)
  };
}
