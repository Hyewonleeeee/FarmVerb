export type LemonCheckoutSlug =
  | 'nebula-series'
  | 'nebula-crush'
  | 'nebula-space'
  | 'nebula-drift'
  | 'nebula-rift'
  | 'nebula-drums'
  | 'glitch-drum-pack-vol-1';

const checkoutUrlBySlug: Record<LemonCheckoutSlug, string | undefined> = {
  'nebula-series': process.env.NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_SERIES,
  'nebula-crush': process.env.NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_CRUSH,
  'nebula-space': process.env.NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_SPACE,
  'nebula-drift': process.env.NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_DRIFT,
  'nebula-rift': process.env.NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_RIFT,
  'nebula-drums': process.env.NEXT_PUBLIC_LEMON_CHECKOUT_NEBULA_DRUMS,
  'glitch-drum-pack-vol-1':
    process.env.NEXT_PUBLIC_LEMON_CHECKOUT_GLITCH_DRUM_PACK_VOL_1 ??
    process.env.NEXT_PUBLIC_LEMON_CHECKOUT_GLITCH_DRUM_PACK
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
  ['glitch drum pack vol i', 'glitch-drum-pack-vol-1']
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
