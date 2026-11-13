import {
  OFFICIAL_PRODUCT_CATALOG,
  getOfficialProductByName,
  getOfficialProductBySlug,
  type OfficialProductSlug
} from '../products/catalog';

export const BLACK_FRIDAY_2026 = {
  name: 'Black Friday 2026',
  startsOn: '2026-11-20',
  endsOn: '2026-12-01',
  displayDates: 'NOV 20 — DEC 01',
  previewNotice: 'Preview pricing only — checkout disabled',
  branch: 'codex/black-friday-2026'
} as const;

export type BlackFridayPreviewVariant = 'editorial' | 'product';

export const BLACK_FRIDAY_2026_PRICES = {
  'nebula-space': 29,
  'uiseong-garlic': 15,
  'glitch-drum-pack-vol-1': 23,
  'nebula-series': 99,
  'organic-series': 35
} as const satisfies Partial<Record<OfficialProductSlug, number>>;

export const BLACK_FRIDAY_2026_FEATURED_SLUGS = [
  'nebula-series',
  'organic-series',
  'nebula-space',
  'uiseong-garlic',
  'glitch-drum-pack-vol-1'
] as const satisfies readonly OfficialProductSlug[];

export type BlackFriday2026Offer = {
  product: (typeof OFFICIAL_PRODUCT_CATALOG)[number];
  previewPrice: number;
};

export function getBlackFriday2026PriceBySlug(slug: string | null | undefined): number | null {
  const product = getOfficialProductBySlug(slug);
  if (!product) {
    return null;
  }

  return BLACK_FRIDAY_2026_PRICES[product.slug as keyof typeof BLACK_FRIDAY_2026_PRICES] ?? null;
}

export function getBlackFriday2026PriceByProductName(productName: string): number | null {
  return getBlackFriday2026PriceBySlug(getOfficialProductByName(productName)?.slug);
}

export function getBlackFriday2026FeaturedOffers(): BlackFriday2026Offer[] {
  return BLACK_FRIDAY_2026_FEATURED_SLUGS.flatMap((slug) => {
    const product = getOfficialProductBySlug(slug);
    const previewPrice = getBlackFriday2026PriceBySlug(slug);
    return product && previewPrice !== null ? [{ product, previewPrice }] : [];
  });
}

export function parseBlackFridayPreviewVariant(
  value: string | null | undefined
): BlackFridayPreviewVariant | null {
  return value === 'editorial' || value === 'product' ? value : null;
}

export function isBlackFriday2026PreviewEnvironment(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.VERCEL_ENV === 'production') {
    return false;
  }

  const explicit = env.NEXT_PUBLIC_BLACK_FRIDAY_PREVIEW ?? env.BLACK_FRIDAY_PREVIEW;
  if (explicit === 'false') {
    return false;
  }

  if (explicit === 'true' && env.NODE_ENV !== 'production') {
    return true;
  }

  return env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === BLACK_FRIDAY_2026.branch;
}
