export type LemonCheckoutSlug =
  | 'nebula-series'
  | 'nebula-crush'
  | 'nebula-space'
  | 'nebula-drift'
  | 'nebula-rift'
  | 'nebula-drums'
  | 'glitch-drum-pack-vol-1'
  | 'organic-series'
  | 'jeju-citrus-air'
  | 'boseong-green-tea'
  | 'uiseong-garlic';

const organicCheckoutUrlBySlug = {
  'organic-series':
    'https://farmverb.lemonsqueezy.com/checkout/buy/abafec50-4129-433d-8467-a4b06bdaeee4',
  'jeju-citrus-air':
    'https://farmverb.lemonsqueezy.com/checkout/buy/2db28c70-4ef3-4fac-8342-d1f2b7a22b17',
  'boseong-green-tea':
    'https://farmverb.lemonsqueezy.com/checkout/buy/b4d2a735-3a41-4cca-890e-04f4921a19a0',
  'uiseong-garlic':
    'https://farmverb.lemonsqueezy.com/checkout/buy/f5215fdc-54c1-4a02-8692-e1af8bb347f0'
} satisfies Pick<
  Record<LemonCheckoutSlug, string>,
  'organic-series' | 'jeju-citrus-air' | 'boseong-green-tea' | 'uiseong-garlic'
>;

const checkoutUrlBySlug: Record<LemonCheckoutSlug, string | undefined> = {
  'nebula-series': process.env.NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_SERIES,
  'nebula-crush': process.env.NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_CRUSH,
  'nebula-space': process.env.NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_SPACE,
  'nebula-drift': process.env.NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_DRIFT,
  'nebula-rift': process.env.NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_RIFT,
  'nebula-drums': process.env.NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_DRUMS,
  'glitch-drum-pack-vol-1':
    process.env.NEXT_PUBLIC_LEMON_CHECKOUT_GLITCH_DRUM_PACK_VOL_1 ??
    process.env.NEXT_PUBLIC_LEMON_CHECKOUT_GLITCH_DRUM_PACK,
  'organic-series':
    process.env.NEXT_PUBLIC_LEMON_CHECKOUT_ORGANIC_SERIES?.trim() ||
    organicCheckoutUrlBySlug['organic-series'],
  'jeju-citrus-air':
    process.env.NEXT_PUBLIC_LEMON_CHECKOUT_JEJU_CITRUS_AIR?.trim() ||
    organicCheckoutUrlBySlug['jeju-citrus-air'],
  'boseong-green-tea':
    process.env.NEXT_PUBLIC_LEMON_CHECKOUT_BOSEONG_GREEN_TEA?.trim() ||
    organicCheckoutUrlBySlug['boseong-green-tea'],
  'uiseong-garlic':
    process.env.NEXT_PUBLIC_LEMON_CHECKOUT_UISEONG_GARLIC?.trim() ||
    organicCheckoutUrlBySlug['uiseong-garlic']
};

const slugByProductName = new Map<string, LemonCheckoutSlug>([
  ['nebula series', 'nebula-series'],
  ['nebula series bundle', 'nebula-series'],
  ['nebula crush', 'nebula-crush'],
  ['nebula space', 'nebula-space'],
  ['nebula drift', 'nebula-drift'],
  ['nebula rift', 'nebula-rift'],
  ['nebula drums', 'nebula-drums'],
  ['glitch drum pack vol.1', 'glitch-drum-pack-vol-1'],
  ['glitch drum pack vol. i', 'glitch-drum-pack-vol-1'],
  ['glitch drum pack vol i', 'glitch-drum-pack-vol-1'],
  ['organic series', 'organic-series'],
  ['organic series bundle', 'organic-series'],
  ['jeju citrus air', 'jeju-citrus-air'],
  ['boseong green tea', 'boseong-green-tea'],
  ['uiseong garlic', 'uiseong-garlic']
]);

function normalizeUrl(value: string | undefined) {
  const url = value?.trim();
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:' ? parsedUrl.toString() : null;
  } catch {
    return null;
  }
}

export function getLemonCheckoutUrl(slug: string | null | undefined) {
  if (!slug) {
    return null;
  }

  return normalizeUrl(checkoutUrlBySlug[slug as LemonCheckoutSlug]);
}

export function getLemonCheckoutUrlByProductName(productName: string) {
  const slug = slugByProductName.get(productName.trim().toLowerCase());
  return getLemonCheckoutUrl(slug);
}

export function getLemonMyOrdersUrl() {
  return normalizeUrl(process.env.NEXT_PUBLIC_LEMON_MY_ORDERS_URL);
}

export function getLemonBuyButtonLabel(_productName: string) {
  return 'Buy Now';
}

// TODO: Future Supabase + Lemon webhook integration for account purchase history.
// Lemon Squeezy remains the source of truth for v1.0 orders, license keys, and downloads.
