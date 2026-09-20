import {
  OFFICIAL_PRODUCT_CATALOG,
  type OfficialProductSlug
} from '@/lib/products/catalog';

export type LemonCheckoutSlug = OfficialProductSlug;

const checkoutUrlBySlug = new Map<LemonCheckoutSlug, string>(
  OFFICIAL_PRODUCT_CATALOG.map((product) => [product.slug, product.lemonCheckoutUrl])
);

const slugByProductName = new Map<string, LemonCheckoutSlug>();
for (const product of OFFICIAL_PRODUCT_CATALOG) {
  for (const name of [product.name, ...product.aliases]) {
    slugByProductName.set(name.trim().toLowerCase(), product.slug);
  }
}

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

  return normalizeUrl(checkoutUrlBySlug.get(slug as LemonCheckoutSlug));
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

// Lemon Squeezy remains the source of truth for orders, license keys, and downloads.
