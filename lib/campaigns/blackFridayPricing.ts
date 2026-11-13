import { getOfficialProductByName, getOfficialProductBySlug, type OfficialProductSlug } from '../products/catalog';
import type { CampaignPhase } from './blackFridayClock';

// Approved by the owner on 2026-11-13 for Preview implementation.
// Deploying this table does not enable the campaign: a separate server flag does.
export const BLACK_FRIDAY_PRICE_APPROVAL = '2026-11-13';
export const BLACK_FRIDAY_PRICE_TABLE = {
  'nebula-crush': { before: 39, active: 19, after: 29 },
  'nebula-drift': { before: 49, active: 25, after: 39 },
  'nebula-drums': { before: 49, active: 25, after: 39 },
  'nebula-rift': { before: 59, active: 29, after: 49 },
  'nebula-space': { before: 59, active: 29, after: 49 },
  'nebula-series': { before: 189, active: 89, after: 129 },
  'jeju-citrus-air': { before: 29, active: 15, after: 25 },
  'boseong-green-tea': { before: 29, active: 15, after: 25 },
  'uiseong-garlic': { before: 29, active: 15, after: 25 },
  'organic-series': { before: 69, active: 35, after: 59 },
  'glitch-drum-pack-vol-1': { before: 49, active: 25, after: 39 }
} as const satisfies Record<OfficialProductSlug, Record<CampaignPhase, number>>;

export const BLACK_FRIDAY_2026_PRICES = Object.freeze(Object.fromEntries(
  Object.entries(BLACK_FRIDAY_PRICE_TABLE).map(([slug, prices]) => [slug, prices.active])
)) as Readonly<Record<OfficialProductSlug, number>>;

export function getCampaignPriceBySlug(slug: string | null | undefined, phase: CampaignPhase) {
  const product = getOfficialProductBySlug(slug);
  if (!product || !['before', 'active', 'after'].includes(phase)) return null;
  const prices = BLACK_FRIDAY_PRICE_TABLE[product.slug];
  const price = prices[phase];
  // Missing post-sale prices must never silently fall back to the old price.
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    currency: 'USD' as const,
    price,
    priceCents: Math.round(price * 100),
    compareAt: phase === 'active' ? prices.before : null,
    discountPercent: phase === 'active' ? Math.floor(100 * (prices.before - price) / prices.before) : 0
  };
}

export function getCampaignPriceByProductName(productName: string, phase: CampaignPhase) {
  return getCampaignPriceBySlug(getOfficialProductByName(productName)?.slug, phase);
}

// Cart storage is only a list of chosen products, never a source of authority for prices.
export function repriceCampaignCart<T extends { slug: string; price: number; currency: string }>(
  items: readonly T[], phase: CampaignPhase
): T[] {
  return items.map((item) => {
    const offer = getCampaignPriceBySlug(item.slug, phase);
    return offer ? { ...item, price: offer.price, currency: offer.currency } : { ...item };
  });
}
