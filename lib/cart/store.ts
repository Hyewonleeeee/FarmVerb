import { getMainProductPrice, getProductPricing } from '@/lib/pricing/products';
import { getLemonCheckoutUrl } from '@/lib/checkout/lemonLinks';

export type CartItem = {
  slug: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  quantity: number;
  image: string | null;
  checkoutUrl: string | null;
};

type CatalogProduct = {
  slug: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image: string | null;
  checkoutUrl: string | null;
};

const CART_STORAGE_PREFIX = 'farmverb_cart_v1';
const CART_UPDATED_EVENT = 'farmverb:cart-updated';

function priceOf(productName: string, fallback = 0) {
  const pricing = getProductPricing(productName);
  return pricing ? getMainProductPrice(pricing) : fallback;
}

const PRODUCT_CATALOG: CatalogProduct[] = [
  {
    slug: 'nebula-series',
    name: 'Nebula Series',
    description: 'Nebula Series bundle',
    price: priceOf('Nebula Series', 189),
    currency: 'USD',
    image: '/Nebula%20Series/Main/Nebula%20Series.png',
    checkoutUrl: getLemonCheckoutUrl('nebula-series')
  },
  {
    slug: 'nebula-crush',
    name: 'Nebula Crush',
    description: 'Dynamic crush processor',
    price: priceOf('Nebula Crush', 39),
    currency: 'USD',
    image: '/Nebula%20Series/Main/1-Nebula%20Crush.png',
    checkoutUrl: getLemonCheckoutUrl('nebula-crush')
  },
  {
    slug: 'nebula-space',
    name: 'Nebula Space',
    description: 'Atmospheric space processor',
    price: priceOf('Nebula Space', 59),
    currency: 'USD',
    image: '/Nebula%20Series/Main/2-Nebula%20Space.png',
    checkoutUrl: getLemonCheckoutUrl('nebula-space')
  },
  {
    slug: 'nebula-drift',
    name: 'Nebula Drift',
    description: 'Spectral motion processor',
    price: priceOf('Nebula Drift', 49),
    currency: 'USD',
    image: '/Nebula%20Series/Main/3-Nebula%20Drift.png',
    checkoutUrl: getLemonCheckoutUrl('nebula-drift')
  },
  {
    slug: 'nebula-rift',
    name: 'Nebula Rift',
    description: 'Fractured digital processor',
    price: priceOf('Nebula Rift', 59),
    currency: 'USD',
    image: '/Nebula%20Series/Main/4-Nebula%20Rift.png',
    checkoutUrl: getLemonCheckoutUrl('nebula-rift')
  },
  {
    slug: 'nebula-drums',
    name: 'Nebula Drums',
    description: 'Decent Sampler instrument',
    price: priceOf('Nebula Drums', 49),
    currency: 'USD',
    image: '/Nebula%20Series/Main/5-Nebula%20Drums.png',
    checkoutUrl: getLemonCheckoutUrl('nebula-drums')
  },
  {
    slug: 'glitch-drum-pack-vol-1',
    name: 'Glitch Drum Pack Vol.1',
    description: 'Digital glitch drum sample pack',
    price: priceOf('Glitch Drum Pack Vol.1', 49),
    currency: 'USD',
    image: '/GlitchDrum/GlitchDrum.png',
    checkoutUrl: getLemonCheckoutUrl('glitch-drum-pack-vol-1')
  }
];

const productByName = new Map(PRODUCT_CATALOG.map((product) => [product.name.toLowerCase(), product]));
const productBySlug = new Map(PRODUCT_CATALOG.map((product) => [product.slug, product]));
const legacyProductAliases = new Map<string, CatalogProduct>([
  ['nebula-drum', productBySlug.get('nebula-drums') as CatalogProduct],
  ['nebula-drums', productBySlug.get('nebula-drums') as CatalogProduct],
  ['glitch-drum-pack-vol-i', productBySlug.get('glitch-drum-pack-vol-1') as CatalogProduct],
  ['glitch-drum-pack-vol-1', productBySlug.get('glitch-drum-pack-vol-1') as CatalogProduct]
].filter((entry): entry is [string, CatalogProduct] => Boolean(entry[1])));

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

function getCartStorageKey(userId: string) {
  const normalizedUserId = userId.trim();
  return normalizedUserId ? `${CART_STORAGE_PREFIX}:${normalizedUserId}` : null;
}

function resolveProduct(productName: string): CatalogProduct {
  const fromCatalog = productByName.get(productName.toLowerCase().trim());
  if (fromCatalog) {
    return fromCatalog;
  }

  return {
    slug: slugify(productName) || `custom-${Date.now()}`,
    name: productName,
    description: 'Digital audio product',
    price: 0,
    currency: 'USD',
    image: null,
    checkoutUrl: null
  };
}

function resolveCatalogProduct(input: Partial<CartItem>) {
  const slug = typeof input.slug === 'string' ? slugify(input.slug) : '';
  if (slug) {
    const bySlug = productBySlug.get(slug) ?? legacyProductAliases.get(slug);
    if (bySlug) {
      return bySlug;
    }
  }

  const name = typeof input.name === 'string' ? input.name.trim().toLowerCase() : '';
  if (name) {
    return productByName.get(name) ?? legacyProductAliases.get(slugify(name)) ?? null;
  }

  return null;
}

function isSameCartItem(left: CartItem, right: Partial<CartItem>) {
  return (
    left.slug === right.slug &&
    left.name === right.name &&
    left.description === right.description &&
    left.price === right.price &&
    left.currency === right.currency &&
    left.quantity === right.quantity &&
    left.image === right.image &&
    left.checkoutUrl === right.checkoutUrl
  );
}

function normalizeCartItem(input: Partial<CartItem>): CartItem | null {
  const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';

  if (!slug || !name) {
    return null;
  }

  const catalogProduct = resolveCatalogProduct(input);
  if (!catalogProduct) {
    return null;
  }

  return {
    slug: catalogProduct.slug,
    name: catalogProduct.name,
    description: catalogProduct.description,
    quantity: 1,
    price: catalogProduct.price,
    currency: catalogProduct.currency,
    image: catalogProduct.image,
    checkoutUrl: catalogProduct.checkoutUrl
  };
}

function emitCartUpdated() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

function writeCartItems(userId: string, nextItems: CartItem[]) {
  const storage = getStorage();
  const storageKey = getCartStorageKey(userId);
  if (!storage || !storageKey) {
    return nextItems;
  }

  storage.setItem(storageKey, JSON.stringify(nextItems));
  emitCartUpdated();
  return nextItems;
}

export function getCartItems(userId: string): CartItem[] {
  const storage = getStorage();
  const storageKey = getCartStorageKey(userId);
  if (!storage || !storageKey) {
    return [];
  }

  const raw = storage.getItem(storageKey);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CartItem>[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed
      .map((item) => normalizeCartItem(item))
      .filter((item): item is CartItem => Boolean(item));

    const shouldRewrite = normalized.length !== parsed.length || normalized.some((item, index) => !isSameCartItem(item, parsed[index] ?? {}));

    if (shouldRewrite) {
      writeCartItems(userId, normalized);
    }

    return normalized;
  } catch {
    return [];
  }
}

export function addItemToCart(userId: string, productName: string): CartItem[] {
  const product = resolveProduct(productName);
  const currentItems = getCartItems(userId);
  const existing = currentItems.find((item) => item.slug === product.slug);

  if (!existing) {
    return writeCartItems(userId, [
      ...currentItems,
      {
        slug: product.slug,
        name: product.name,
        description: product.description,
        price: product.price,
        currency: product.currency,
        quantity: 1,
        image: product.image,
        checkoutUrl: product.checkoutUrl
      }
    ]);
  }

  return writeCartItems(
    userId,
    currentItems.map((item) =>
      item.slug === product.slug
        ? {
            ...item,
            name: product.name,
            description: product.description,
            price: product.price,
            currency: product.currency,
            image: product.image,
            checkoutUrl: product.checkoutUrl,
            quantity: 1
          }
        : item
    )
  );
}

export function updateCartItemQuantity(userId: string, productSlug: string, nextQuantity: number): CartItem[] {
  const safeQuantity = Number.isFinite(nextQuantity) ? Math.floor(nextQuantity) : 1;
  if (safeQuantity <= 0) {
    return removeCartItem(userId, productSlug);
  }

  const currentItems = getCartItems(userId);
  const nextItems = currentItems.map((item) =>
    item.slug === productSlug ? { ...item, quantity: safeQuantity } : item
  );
  return writeCartItems(userId, nextItems);
}

export function removeCartItem(userId: string, productSlug: string): CartItem[] {
  const currentItems = getCartItems(userId);
  const nextItems = currentItems.filter((item) => item.slug !== productSlug);
  return writeCartItems(userId, nextItems);
}

export function clearCartItems(userId: string): CartItem[] {
  const storage = getStorage();
  const storageKey = getCartStorageKey(userId);
  if (storage && storageKey) {
    storage.removeItem(storageKey);
    emitCartUpdated();
  }

  return [];
}

export function getCartItemCount(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function getCartSubtotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function getCatalogProductBySlug(slug: string) {
  const normalizedSlug = slugify(slug);
  return productBySlug.get(normalizedSlug) ?? legacyProductAliases.get(normalizedSlug) ?? null;
}

export function getCatalogProductByName(name: string) {
  return productByName.get(name.toLowerCase().trim()) ?? null;
}

export function subscribeToCart(userId: string, listener: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const storageKey = getCartStorageKey(userId);
  if (!storageKey) {
    return () => {};
  }

  const onCartUpdated = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey) {
      listener();
    }
  };

  window.addEventListener(CART_UPDATED_EVENT, onCartUpdated);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(CART_UPDATED_EVENT, onCartUpdated);
    window.removeEventListener('storage', onStorage);
  };
}
