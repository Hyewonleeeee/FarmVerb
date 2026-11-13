import { NextResponse } from 'next/server';
import { createCampaignSnapshot, getCampaignRuntime } from '@/lib/campaigns/blackFridayClock';
import { isBlackFriday2026PreviewEnvironment } from '@/lib/campaigns/blackFriday2026';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store' };
let developmentClock: { value: string; startMs: number; monotonicStart: number } | null = null;

function serverNowMs() {
  // This is a server-only development fixture. It cannot run on a Vercel
  // Preview production build or a Live deployment, regardless of env values.
  const value = process.env.BLACK_FRIDAY_PREVIEW_CLOCK_START;
  if (process.env.NODE_ENV === 'development' && isBlackFriday2026PreviewEnvironment()
    && value && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const startMs = Date.parse(value);
    if (Number.isFinite(startMs)) {
      if (developmentClock?.value !== value) {
        developmentClock = { value, startMs, monotonicStart: performance.now() };
      }
      return Math.floor(developmentClock.startMs + performance.now() - developmentClock.monotonicStart);
    }
  }
  developmentClock = null;
  return Date.now();
}

export async function GET(request: Request) {
  const state = getCampaignRuntime(process.env, serverNowMs());
  const requestedPhase = new URL(request.url).searchParams.get('bf');
  return NextResponse.json(createCampaignSnapshot(state, requestedPhase), { headers: NO_STORE });
}
